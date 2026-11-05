/**
 * daily-leads-report
 *
 * Runs once a day at 12:00 AM US Eastern time (America/New_York, DST-aware).
 * pg_cron fires at 04:00 and 05:00 UTC (migration 20261102120000) and only
 * the run that lands on Eastern midnight sends; the other one skips. It emails
 * Aurezo super admins (never admin staff) how many leads every client
 * account received on each form during the day that just ended. Internal /
 * dummy accounts are left out.
 *
 *   { mode: "send", date?: "YYYY-MM-DD", test?: boolean, force?: boolean }
 *   { mode: "send", since: ISO }   one-off "so far" report from `since` to now
 *                                  (never blocks the nightly report)
 *   { mode: "preview", date?: "YYYY-MM-DD" }     same numbers as JSON, no email
 *
 * Auth: the service role key (cron) or a super admin session.
 */
// deno-lint-ignore-file no-explicit-any
import { createClient } from "npm:@supabase/supabase-js@2";
import { getAdminAccess } from "../_shared/admin-access.ts";

const Resend = (await import("npm:resend@2.0.0")).Resend;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const FROM_EMAIL = "Aurezo Daily Leads <onboarding@resend.dev>";
const DASHBOARD_URL = "https://studioadmin.aurezotech.com/admin";
const LOGO_URL = "https://studio.aurezotech.com/images/aurezo-email-logo.png";

// The nightly report goes to every active super admin
// (admin_staff_members.is_super_admin). "[TEST]" sends go only to this inbox.
const TEST_RECIPIENT = "faisala@wavesmvmnt.com";

// Every Aurezo super admin (same list as migration 20260903150000). Always
// emailed, even when their admin_staff_members row is missing or not flagged
// is_super_admin, so a stale staff table can never drop the report.
const SUPER_ADMIN_EMAILS = [
  "faisala@wavesmvmnt.com",
  "vikramk@wavesmvmnt.com",
  "gskinot@wavesmvmnt.com",
];

// Extra recipients who get the nightly report alongside the super admins
// (requested 2026-09-24). Not super admins; only this email list is affected.
const EXTRA_REPORT_RECIPIENTS = [
  "enamh@wavesmvmnt.com",
  "alishabbir@wavesmvmnt.com",
  "affaan@wavesmvmnt.com",
];

// "End of day" is midnight US Eastern time (EST in winter, EDT in summer).
const REPORT_TZ = "America/New_York";
const REPORT_TZ_LABEL = "Eastern Time";

// Internal / dummy accounts that never appear in the report.
const EXCLUDED_CLIENT_EMAILS = new Set([
  "demo@lumierejewelry.com",    // Lumière Fine Jewelry
  "creatives@wavesmvmnt.com",   // WAVES MVMNT
  "gsk@crmmvmnt.com",           // Aurezo
  "faisal914awan@gmail.com",    // fbe
  "client@demo.com",            // Demo Client
  "emailflows@wavesmvmnt.com",  // Top G
  "vkonlinee@gmail.com",        // VDK 7
]);
const EXCLUDED_CLIENT_IDS = new Set([
  "65a0bc7d-84e2-4591-ba6c-ef4f4a6517ac", // Lumière Fine Jewelry
]);

// Same 7 lead sources as get_admin_lead_aggregates, in display order.
const FORMS: Array<{ source: string; label: string }> = [
  { source: "diamond_form_leads", label: "Quote Estimator" },
  { source: "design_requests", label: "Ring Builder" },
  { source: "grill_form_leads", label: "Grillz Builder" },
  { source: "custom_enquiry_leads", label: "Custom Enquiry" },
  { source: "metal_buying_leads", label: "Metal IQ" },
  { source: "saved_designs", label: "Ring OS — Saved Design" },
  { source: "appointment_bookings", label: "Appointment Booking" },
];

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));

// ─── Report window ───────────────────────────────────────────────────────────

// Wall-clock parts of an instant in the report time zone.
function tzParts(at: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: REPORT_TZ, hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(at);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return { y: get("year"), m: get("month"), d: get("day"), h: get("hour"), min: get("minute"), s: get("second") };
}

// UTC instant of 00:00 Eastern on a YYYY-MM-DD day (handles EST/EDT).
function tzMidnight(day: string): Date {
  const guess = new Date(`${day}T00:00:00Z`);
  const p = tzParts(guess);
  const asUtc = Date.UTC(p.y, p.m - 1, p.d, p.h, p.min, p.s);
  return new Date(guess.getTime() - (asUtc - guess.getTime()));
}

const tzDay = (at: Date) => {
  const p = tzParts(at);
  return `${p.y}-${String(p.m).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`;
};

const nextDay = (day: string) => new Date(Date.parse(`${day}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);

const dayLabel = (day: string) =>
  new Date(`${day}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });

function isEasternMidnightHour(at = new Date()): boolean {
  return tzParts(at).h === 0;
}

function reportWindow(date?: string, since?: string): { date: string; label: string; from: Date; to: Date; partial: boolean } {
  if (since && !Number.isNaN(Date.parse(since))) {
    // One-off "so far" report: from `since` up to right now.
    const from = new Date(since);
    const to = new Date();
    const fmt = (d: Date) => d.toLocaleString("en-US", { timeZone: REPORT_TZ, month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
    return { date: tzDay(to), label: `${fmt(from)} – ${fmt(to)}`, from, to, partial: true };
  }
  let day: string;
  if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    day = date;
  } else {
    // The cron fires right after Eastern midnight, so "12 hours ago, Eastern"
    // is always the day that just ended. A manual daytime run gives today so far.
    day = tzDay(new Date(Date.now() - 12 * 60 * 60_000));
  }
  return { date: day, label: dayLabel(day), from: tzMidnight(day), to: tzMidnight(nextDay(day)), partial: false };
}

// ─── Data ────────────────────────────────────────────────────────────────────

interface ClientRow { client_id: string; name: string; total: number; forms: Record<string, number> }

async function buildReport(supabase: any, date?: string, since?: string) {
  const win = reportWindow(date, since);

  const [{ data: clients, error: clientsErr }, { data: counts, error: countsErr }] = await Promise.all([
    supabase.from("clients").select("id, company_name, email"),
    supabase.rpc("get_daily_leads_report", { p_start: win.from.toISOString(), p_end: win.to.toISOString() }),
  ]);
  if (clientsErr) throw new Error(`clients: ${clientsErr.message}`);
  if (countsErr) throw new Error(`get_daily_leads_report: ${countsErr.message}`);

  const included = new Map<string, string>();
  for (const c of clients ?? []) {
    if (EXCLUDED_CLIENT_IDS.has(c.id)) continue;
    if (c.email && EXCLUDED_CLIENT_EMAILS.has(String(c.email).trim().toLowerCase())) continue;
    included.set(c.id, c.company_name || c.email || c.id);
  }

  const rows = new Map<string, ClientRow>();
  const byForm: Record<string, number> = {};
  for (const r of counts ?? []) {
    const name = included.get(r.client_id);
    if (!name) continue; // excluded or deleted client
    const n = Number(r.lead_count) || 0;
    const row: ClientRow = rows.get(r.client_id) ?? { client_id: r.client_id, name, total: 0, forms: {} };
    row.forms[r.source] = (row.forms[r.source] ?? 0) + n;
    row.total += n;
    rows.set(r.client_id, row);
    byForm[r.source] = (byForm[r.source] ?? 0) + n;
  }

  const withLeads = [...rows.values()].sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
  const withoutLeads = [...included.entries()]
    .filter(([id]) => !rows.has(id))
    .map(([, name]) => name)
    .sort((a, b) => a.localeCompare(b));

  return {
    date: win.date,
    date_label: win.label,
    partial: win.partial,
    timezone: REPORT_TZ_LABEL,
    window: { from: win.from.toISOString(), to: win.to.toISOString() },
    total_leads: withLeads.reduce((s, c) => s + c.total, 0),
    by_form: byForm,
    clients: withLeads,
    clients_without_leads: withoutLeads,
  };
}

// ─── Email ───────────────────────────────────────────────────────────────────

function reportHtml(report: Awaited<ReturnType<typeof buildReport>>, isTest: boolean): string {
  const td = "padding:7px 8px;border-bottom:1px solid #f1f1f3;";
  const th = (t: string, right = false) => `<th style="text-align:${right ? "right" : "left"};padding:6px 8px;color:#71717a;font-weight:600;border-bottom:2px solid #e4e4e7;">${t}</th>`;

  const clientBlocks = report.clients.map((c) => {
    const formRows = FORMS.filter((f) => c.forms[f.source]).map((f) => `
      <tr>
        <td style="${td}padding-left:20px;color:#3f3f46;">${esc(f.label)}</td>
        <td style="${td}text-align:right;">${c.forms[f.source]}</td>
      </tr>`).join("");
    return `
      <tr>
        <td style="${td}font-weight:700;background:#fafafa;">${esc(c.name)}</td>
        <td style="${td}font-weight:700;background:#fafafa;text-align:right;">${c.total}</td>
      </tr>${formRows}`;
  }).join("");

  const formTotals = FORMS.filter((f) => report.by_form[f.source]).map((f) => `
    <tr><td style="${td}">${esc(f.label)}</td><td style="${td}text-align:right;font-weight:600;">${report.by_form[f.source]}</td></tr>`).join("");

  const body = `
    ${isTest ? `<p style="background:#fef3c7;border:1px solid #fde68a;border-radius:8px;padding:8px 12px;color:#92400e;">Test send — the scheduled report goes out to all super admins at 12:00 AM ${REPORT_TZ_LABEL} (EST/EDT) every night.</p>` : ""}
    <p style="font-size:15px;margin-top:0;">
      <strong style="font-size:22px;color:#0f766e;">${report.total_leads}</strong> lead${report.total_leads === 1 ? "" : "s"}
      across <strong>${report.clients.length}</strong> client account${report.clients.length === 1 ? "" : "s"} ${report.partial ? "from" : "on"} ${esc(report.date_label)} (${REPORT_TZ_LABEL}).
    </p>
    ${report.clients.length ? `
    <h3 style="margin:20px 0 8px;font-size:14px;">Leads by client and form</h3>
    <table style="width:100%;border-collapse:collapse;font-size:13px;">
      <thead><tr>${th("Client / Form")}${th("Leads", true)}</tr></thead>
      <tbody>${clientBlocks}</tbody>
    </table>
    <h3 style="margin:24px 0 8px;font-size:14px;">Totals by form</h3>
    <table style="width:100%;border-collapse:collapse;font-size:13px;">
      <thead><tr>${th("Form")}${th("Leads", true)}</tr></thead>
      <tbody>${formTotals}</tbody>
    </table>` : `<p style="color:#71717a;">No leads were submitted on any client account.</p>`}
    ${report.clients_without_leads.length ? `
    <h3 style="margin:24px 0 8px;font-size:14px;">No leads today (${report.clients_without_leads.length})</h3>
    <p style="color:#71717a;font-size:13px;margin:0;">${report.clients_without_leads.map(esc).join(" · ")}</p>` : ""}`;

  return `<!doctype html><html><body style="margin:0;background:#f4f4f5;font-family:Inter,Segoe UI,Arial,sans-serif;color:#18181b;">
  <div style="max-width:640px;margin:0 auto;padding:32px 16px;">
    <div style="text-align:center;margin-bottom:20px;"><img src="${LOGO_URL}" alt="Aurezo" style="height:48px;" /></div>
    <div style="background:#fff;border-radius:14px;overflow:hidden;border:1px solid #e4e4e7;">
      <div style="background:#0f766e;color:#fff;padding:18px 24px;font-size:18px;font-weight:700;">${report.partial ? "Leads Report (so far)" : "Daily Leads Report"} · ${esc(report.date_label)}</div>
      <div style="padding:24px;font-size:14px;line-height:1.6;">${body}</div>
      <div style="padding:16px 24px;border-top:1px solid #e4e4e7;font-size:12px;color:#71717a;">
        Sent to Aurezo super admins and the leads team · internal and demo accounts are excluded · <a href="${DASHBOARD_URL}" style="color:#0f766e;">Open admin dashboard</a>
      </div>
    </div>
  </div></body></html>`;
}

async function recipients(supabase: any, test: boolean): Promise<string[]> {
  if (test) return [TEST_RECIPIENT];
  // Known super admins + extra recipients + anyone flagged super admin in the staff table.
  const set = new Set<string>([...SUPER_ADMIN_EMAILS, ...EXTRA_REPORT_RECIPIENTS].map((e) => e.toLowerCase()));
  const { data, error } = await supabase
    .from("admin_staff_members")
    .select("email")
    .eq("is_super_admin", true)
    .eq("status", "active");
  if (error) console.error("admin_staff_members lookup failed", error.message);
  for (const r of data ?? []) {
    const e = String(r.email ?? "").trim().toLowerCase();
    if (e.includes("@")) set.add(e);
  }
  return [...set];
}

async function sendReport(supabase: any, opts: { date?: string; since?: string; test: boolean; force: boolean; source: string }) {
  const report = await buildReport(supabase, opts.date, opts.since);
  const emailType = opts.test ? "daily_leads_report_test" : "daily_leads_report";

  // One real report per day, even if the cron or a manual run fires twice.
  // A one-off "so far" report never counts as the day's report.
  if (!opts.test && !opts.force && !report.partial) {
    const { data: prior } = await supabase
      .from("email_logs")
      .select("id")
      .eq("email_type", emailType)
      .eq("status", "sent")
      .eq("metadata->>report_date", report.date)
      .limit(1);
    if (prior?.length) return { sent: false, skipped: "already sent for this date", report };
  }

  const to = await recipients(supabase, opts.test);
  if (to.length === 0) return { sent: false, error: "no recipients", report };

  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) return { sent: false, error: "RESEND_API_KEY not configured", report };

  const subject = `${opts.test ? "[TEST] " : ""}${report.partial ? "Leads Report (so far)" : "Daily Leads Report"} · ${report.date_label} · ${report.total_leads} lead${report.total_leads === 1 ? "" : "s"}`;
  let status: "sent" | "failed" = "sent";
  let errorMessage: string | null = null;
  let resendId: string | null = null;
  try {
    const resp: any = await new Resend(key).emails.send({ from: FROM_EMAIL, to, subject, html: reportHtml(report, opts.test) });
    if (resp?.error) {
      status = "failed";
      errorMessage = String(resp.error?.message ?? resp.error);
    } else {
      resendId = resp?.data?.id ?? null;
    }
  } catch (e) {
    status = "failed";
    errorMessage = (e as Error).message;
  }

  // Keep the shared email ledger consistent with every other sender.
  const { error: logErr } = await supabase.from("email_logs").insert({
    recipient_email: to.join(", "),
    email_type: emailType,
    subject,
    status,
    resend_id: resendId,
    error_message: errorMessage,
    metadata: { report_date: report.partial ? null : report.date, partial_window: report.partial ? report.window : undefined, total_leads: report.total_leads, clients_with_leads: report.clients.length, source: opts.source },
  });
  if (logErr) console.error("email_logs insert failed", logErr.message);

  return { sent: status === "sent", error: errorMessage ?? undefined, recipients: to, report };
}

// ─── HTTP entry ──────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  let body: any = {};
  try { body = await req.json(); } catch { /* empty body */ }
  const mode: string = body?.mode ?? "send";

  // Auth: service role (cron), the shared cron trigger secret (pg_net cannot
  // read the service-role JWT), or a super admin session.
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  const isService = !!token && token === serviceKey;
  if (!isService) {
    const triggerSecret = req.headers.get("x-trigger-secret") ?? "";
    let triggerOk = false;
    if (triggerSecret) {
      const { data } = await supabase
        .from("cron_config")
        .select("value")
        .eq("key", "dtt_ghl_trigger_secret")
        .maybeSingle();
      triggerOk = !!data?.value && data.value === triggerSecret;
    }
    if (!triggerOk) {
      const access = await getAdminAccess(req);
      if (!access.isSuperAdmin) return json({ error: "Super admin access required" }, 403);
    }
  }

  try {
    if (mode === "preview") {
      return json({ report: await buildReport(supabase, body?.date) });
    }
    if (mode === "send") {
      // The cron fires at 04:00 and 05:00 UTC so one of them is always 12 AM
      // Eastern (EDT/EST); the other run skips.
      if (body?.source === "cron" && !body?.date && !isEasternMidnightHour()) {
        return json({ sent: false, skipped: "not midnight US Eastern" });
      }
      const result = await sendReport(supabase, {
        date: body?.date,
        since: typeof body?.since === "string" ? body.since : undefined,
        test: body?.test === true,
        force: body?.force === true,
        source: typeof body?.source === "string" ? body.source : (isService ? "cron" : "manual"),
      });
      return json(result);
    }
    return json({ error: `Unknown mode: ${mode}` }, 400);
  } catch (e) {
    console.error("daily-leads-report error", (e as Error).message);
    return json({ error: (e as Error).message }, 500);
  }
});
