/**
 * platform-health-monitor
 *
 * Runs once a day from pg_cron (see migration 20260918180000) and on demand
 * from the admin Platform Health page. Daily on purpose: row volume and
 * invocations are kept minimal.
 *
 *   { mode: "run", source?: "cron" | "manual" }   probe everything, persist, alert
 *   { mode: "report", period: "monthly", month?: "YYYY-MM" }   email + store monthly report
 *   { mode: "test_alert" }                          send a test alert to verify delivery
 *   { mode: "inspect" }                             read-only dump of what is stored
 *
 * Auth: the service role key, the database trigger secret (x-trigger-secret,
 * what pg_cron sends on this project), or an agency_admin session. Reports
 * and test alerts additionally require a super admin.
 */
// deno-lint-ignore-file no-explicit-any
import { createClient } from "npm:@supabase/supabase-js@2.116.0";
import { getAdminAccess } from "../_shared/admin-access.ts";
import { timingSafeEqual } from "../_shared/timing-safe.ts";
import {
  collectQuotas,
  emailStats,
  loadSettings,
  runCoreChecks,
  runExternalChecks,
  type HealthSettings,
  type QuotaMetric,
  type ServiceStatus,
} from "../_shared/platform-health-checks.ts";

const Resend = (await import("npm:resend@2.0.0")).Resend;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const FROM_EMAIL = "Aurezo Platform Health <onboarding@resend.dev>";
const DASHBOARD_URL = "https://studioadmin.aurezotech.com/admin/platform-health";
const LOGO_URL = "https://studio.aurezotech.com/images/aurezo-email-logo.png";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

// ─── Recipients & delivery ───────────────────────────────────────────────────

async function alertRecipients(supabase: any, settings: HealthSettings): Promise<string[]> {
  const set = new Set<string>();
  try {
    const { data } = await supabase
      .from("admin_staff_members")
      .select("email")
      .eq("is_super_admin", true)
      .eq("status", "active");
    for (const r of data ?? []) if (r.email) set.add(String(r.email).toLowerCase());
  } catch { /* ignore */ }
  for (const e of settings.alert_emails ?? []) {
    if (typeof e === "string" && e.includes("@")) set.add(e.toLowerCase());
  }
  if (set.size === 0) {
    // Fallback: every agency admin's auth email.
    try {
      const { data: roles } = await supabase.from("user_roles").select("user_id").eq("role", "agency_admin");
      for (const r of roles ?? []) {
        const { data } = await supabase.auth.admin.getUserById(r.user_id);
        if (data?.user?.email) set.add(data.user.email.toLowerCase());
      }
    } catch { /* ignore */ }
  }
  return [...set];
}

async function notifyInApp(supabase: any, title: string, message: string, metadata: Record<string, unknown>) {
  try {
    const { data: admins } = await supabase.from("user_roles").select("user_id").eq("role", "agency_admin");
    if (!admins?.length) return;
    await supabase.from("admin_notifications").insert(
      admins.map((a: any) => ({ user_id: a.user_id, category: "system", title, message, metadata })),
    );
  } catch (e) {
    console.error("in-app notification failed", (e as Error).message);
  }
}

interface AlertInput {
  alert_type: "incident_open" | "incident_resolved" | "quota_warning" | "quota_critical" | "monthly_report" | "test_alert";
  alert_key: string;
  component?: string | null;
  severity: "info" | "warning" | "critical";
  title: string;
  message: string;
  html: string;
  details?: Record<string, unknown>;
  inApp?: boolean;
}

async function sendAlert(supabase: any, settings: HealthSettings, input: AlertInput): Promise<{ sent: boolean; error?: string }> {
  const recipients = await alertRecipients(supabase, settings);
  let email_status: "sent" | "failed" | "skipped" = "skipped";
  let email_error: string | null = null;
  let resend_id: string | null = null;

  if (settings.alerts_enabled && recipients.length > 0) {
    const key = Deno.env.get("RESEND_API_KEY");
    if (!key) {
      email_status = "failed";
      email_error = "RESEND_API_KEY not configured";
    } else {
      try {
        const resend = new Resend(key);
        const prefix = input.severity === "critical" ? "[CRITICAL] " : input.severity === "warning" ? "[WARNING] " : "";
        const resp: any = await resend.emails.send({
          from: FROM_EMAIL,
          to: recipients,
          subject: `${prefix}${input.title} · Aurezo Platform Health`,
          html: input.html,
        });
        if (resp?.error) {
          email_status = "failed";
          email_error = String(resp.error?.message ?? resp.error);
        } else {
          email_status = "sent";
          resend_id = resp?.data?.id ?? null;
        }
        // Keep the shared email ledger consistent with every other sender.
        await supabase.from("email_logs").insert({
          recipient_email: recipients.join(", "),
          email_type: "platform_health_alert",
          subject: `${prefix}${input.title}`,
          status: email_status,
          resend_id,
          error_message: email_error,
          metadata: { alert_type: input.alert_type, alert_key: input.alert_key, component: input.component ?? null },
        });
      } catch (e) {
        email_status = "failed";
        email_error = (e as Error).message;
      }
    }
  } else if (!settings.alerts_enabled) {
    email_error = "alerts disabled in settings";
  } else {
    email_error = "no recipients configured";
  }

  if (input.inApp !== false) {
    await notifyInApp(supabase, input.title, input.message, {
      source: "platform_health", alert_type: input.alert_type, component: input.component ?? null, severity: input.severity,
    });
  }

  await supabase.from("platform_health_alerts").insert({
    alert_type: input.alert_type,
    alert_key: input.alert_key,
    component: input.component ?? null,
    severity: input.severity,
    title: input.title,
    message: input.message,
    recipients,
    email_status,
    email_error,
    resend_id,
    details: input.details ?? {},
  });

  return { sent: email_status === "sent", error: email_error ?? undefined };
}

// ─── Email templates ─────────────────────────────────────────────────────────

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));

function shell(accent: string, heading: string, body: string): string {
  return `<!doctype html><html><body style="margin:0;background:#f4f4f5;font-family:Inter,Segoe UI,Arial,sans-serif;color:#18181b;">
  <div style="max-width:640px;margin:0 auto;padding:32px 16px;">
    <div style="text-align:center;margin-bottom:20px;"><img src="${LOGO_URL}" alt="Aurezo" style="height:48px;" /></div>
    <div style="background:#fff;border-radius:14px;overflow:hidden;border:1px solid #e4e4e7;">
      <div style="background:${accent};color:#fff;padding:18px 24px;font-size:18px;font-weight:700;">${esc(heading)}</div>
      <div style="padding:24px;font-size:14px;line-height:1.6;">${body}</div>
      <div style="padding:16px 24px;border-top:1px solid #e4e4e7;font-size:12px;color:#71717a;">
        Sent by Aurezo Platform Health monitoring · <a href="${DASHBOARD_URL}" style="color:#0f766e;">Open dashboard</a>
      </div>
    </div>
  </div></body></html>`;
}

function kvTable(rows: Array<[string, unknown]>): string {
  return `<table style="width:100%;border-collapse:collapse;margin:12px 0;">${rows.map(([k, v]) =>
    `<tr><td style="padding:6px 0;color:#71717a;width:40%;vertical-align:top;">${esc(k)}</td><td style="padding:6px 0;font-weight:600;">${esc(v)}</td></tr>`).join("")}</table>`;
}

const fmtDuration = (seconds: number) => {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)} min`;
  if (seconds < 86400) return `${(seconds / 3600).toFixed(1)} h`;
  return `${(seconds / 86400).toFixed(1)} d`;
};

const fmtWhen = (d: Date | string) =>
  new Date(d).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }) + " UTC";

// ─── Run: checks → persist → incidents → quotas → alerts ─────────────────────

async function persistChecks(supabase: any, runId: string, source: string, statuses: ServiceStatus[]) {
  const rows = statuses.map((s) => ({
    run_id: runId,
    component: s.component,
    category: s.category,
    status: s.status,
    latency_ms: s.latency ?? null,
    message: s.message,
    details: s.details ?? {},
    source,
  }));
  const { error } = await supabase.from("platform_health_checks").insert(rows);
  if (error) console.error("persistChecks failed", error.message);
  const today = new Date().toISOString().slice(0, 10);
  const { error: rollErr } = await supabase.rpc("rollup_platform_health_daily", { p_day: today });
  if (rollErr) console.error("rollup failed", rollErr.message);
}

/**
 * What a periodic check can honestly say about an outage:
 *   - it began somewhere between the last passing check and the first failing one
 *   - it ended somewhere between the last failing check and the first passing one
 * So the true duration lies between `min` and `max`, and only that range is reported.
 */
function incidentBounds(inc: any, end: Date): { min: number; max: number } {
  const started = new Date(inc.started_at).getTime();
  const lastFailed = inc.last_failed_at ? new Date(inc.last_failed_at).getTime() : started;
  const prevOk = inc.prev_ok_at ? new Date(inc.prev_ok_at).getTime() : started;
  return {
    min: Math.max(0, (lastFailed - started) / 1000),
    max: Math.max(0, (end.getTime() - prevOk) / 1000),
  };
}

const fmtRange = (b: { min: number; max: number }) =>
  Math.round(b.min) === Math.round(b.max) ? fmtDuration(b.max) : `between ${fmtDuration(b.min)} and ${fmtDuration(b.max)}`;

async function reconcileIncidents(supabase: any, settings: HealthSettings, statuses: ServiceStatus[], runStartedAt: Date) {
  const { data: openRows } = await supabase
    .from("platform_health_incidents")
    .select("*")
    .is("resolved_at", null);
  const open = new Map<string, any>((openRows ?? []).map((r: any) => [r.component, r]));
  const now = new Date();
  let opened = 0, alerted = 0, resolved = 0;

  for (const s of statuses) {
    const existing = open.get(s.component);

    if (s.status !== "operational") {
      let incident = existing;
      if (!incident) {
        // Last time this component was seen healthy, before this run.
        let prevOkAt: string | null = null;
        try {
          const { data: prev } = await supabase
            .from("platform_health_checks")
            .select("checked_at")
            .eq("component", s.component)
            .eq("status", "operational")
            .lt("checked_at", runStartedAt.toISOString())
            .order("checked_at", { ascending: false })
            .limit(1);
          prevOkAt = prev?.[0]?.checked_at ?? null;
        } catch { /* unknown */ }

        const { data, error } = await supabase
          .from("platform_health_incidents")
          .insert({
            component: s.component, category: s.category, status: s.status,
            first_message: s.message, last_message: s.message, checks_failed: 1,
            prev_ok_at: prevOkAt, last_failed_at: now.toISOString(),
          })
          .select("*")
          .single();
        if (error) { console.error("incident insert failed", error.message); continue; }
        incident = data;
        opened++;
      } else {
        const worst = existing.status === "down" || s.status === "down" ? "down" : "degraded";
        const { data } = await supabase
          .from("platform_health_incidents")
          .update({
            checks_failed: existing.checks_failed + 1, last_message: s.message, status: worst,
            last_failed_at: now.toISOString(), updated_at: now.toISOString(),
          })
          .eq("id", existing.id)
          .select("*")
          .single();
        incident = data ?? { ...existing, checks_failed: existing.checks_failed + 1, status: worst, last_message: s.message, last_failed_at: now.toISOString() };
      }

      // Alert once the failure is confirmed (N consecutive checks), only once per incident.
      if (!incident.notified_at && incident.checks_failed >= Math.max(1, settings.incident_confirm_failures)) {
        const isDown = incident.status === "down";
        const title = `${s.component} is ${isDown ? "DOWN" : "degraded"}`;
        const html = shell(isDown ? "#b91c1c" : "#b45309", title, `
          <p>${esc(s.component)} (${esc(s.category)}) failed ${incident.checks_failed === 1 ? "its latest health check" : `${incident.checks_failed} health checks in a row`}.</p>
          ${kvTable([
            ["Status", incident.status.toUpperCase()],
            ["Reason", s.message],
            ["First failed check", fmtWhen(incident.started_at)],
            ["Last seen healthy", incident.prev_ok_at ? fmtWhen(incident.prev_ok_at) : "no earlier healthy check on record"],
            ["Response time", s.latency ? `${s.latency} ms` : "—"],
            ...(s.details?.missing_secret ? [["Action", `Set the ${s.details.missing_secret} secret for the edge functions`] as [string, unknown]] : []),
            ...(String(s.message).includes("API key rejected") ? [["Action", "The API key for this service is invalid or revoked. Rotate it and update the edge function secret."] as [string, unknown]] : []),
          ])}
          <p style="color:#71717a;">Checks run once a day, so the problem began at some point between the two times above. You will receive one more email when a check passes again.</p>`);
        const r = await sendAlert(supabase, settings, {
          alert_type: "incident_open",
          alert_key: `incident:${incident.id}`,
          component: s.component,
          severity: isDown ? "critical" : "warning",
          title,
          message: s.message,
          html,
          details: { incident_id: incident.id, status: incident.status, checks_failed: incident.checks_failed, prev_ok_at: incident.prev_ok_at ?? null, check_details: s.details ?? {} },
        });
        await supabase.from("platform_health_incidents").update({ notified_at: now.toISOString() }).eq("id", incident.id);
        if (r.sent) alerted++;
      }
    } else if (existing) {
      const bounds = incidentBounds(existing, now);
      await supabase
        .from("platform_health_incidents")
        .update({ resolved_at: now.toISOString(), updated_at: now.toISOString() })
        .eq("id", existing.id);
      resolved++;
      if (existing.notified_at && !existing.resolved_notified_at) {
        const title = `${s.component} recovered`;
        const html = shell("#0b6e4f", title, `
          <p>${esc(s.component)} passed its health check again.</p>
          ${kvTable([
            ["Was", existing.status.toUpperCase()],
            ["Last seen healthy before", existing.prev_ok_at ? fmtWhen(existing.prev_ok_at) : "unknown"],
            ["First failed check", fmtWhen(existing.started_at)],
            ["Last failed check", fmtWhen(existing.last_failed_at ?? existing.started_at)],
            ["First passing check", fmtWhen(now)],
            ["Unhealthy for", fmtRange(bounds)],
            ["Failed checks", existing.checks_failed],
            ["Last error", existing.last_message ?? "—"],
          ])}
          <p style="color:#71717a;">The exact duration is not known: checks are periodic, so only the range can be stated.</p>`);
        await sendAlert(supabase, settings, {
          alert_type: "incident_resolved",
          alert_key: `incident:${existing.id}:resolved`,
          component: s.component,
          severity: "info",
          title,
          message: `Recovered. Unhealthy for ${fmtRange(bounds)}.`,
          html,
          details: { incident_id: existing.id, duration_min_seconds: Math.round(bounds.min), duration_max_seconds: Math.round(bounds.max) },
        });
        await supabase.from("platform_health_incidents").update({ resolved_notified_at: now.toISOString() }).eq("id", existing.id);
      }
    }
  }

  // Components that had an open incident but were not probed this run (e.g. an
  // optional provider whose key was removed) are closed so they do not linger.
  const probed = new Set(statuses.map((s) => s.component));
  for (const [component, inc] of open) {
    if (probed.has(component)) continue;
    await supabase
      .from("platform_health_incidents")
      .update({ resolved_at: now.toISOString(), updated_at: now.toISOString(), last_message: "No longer monitored" })
      .eq("id", inc.id);
    resolved++;
  }

  return { opened, alerted, resolved };
}

/**
 * Every run leaves the latest values on the dashboard. A run within the same
 * hour as the previous snapshot overwrites it instead of adding a row, so
 * repeated manual checks do not grow the table.
 */
async function snapshotQuotas(supabase: any, metrics: QuotaMetric[]) {
  const { data: recent } = await supabase
    .from("platform_quota_snapshots")
    .select("id, service, metric, captured_at")
    .gte("captured_at", new Date(Date.now() - 60 * 60 * 1000).toISOString())
    .order("captured_at", { ascending: false })
    .limit(500);
  const latest = new Map<string, { id: string }>();
  for (const r of recent ?? []) {
    const k = `${r.service}:${r.metric}`;
    if (!latest.has(k)) latest.set(k, r);
  }

  const nowIso = new Date().toISOString();
  const inserts: any[] = [];
  for (const m of metrics) {
    const row = {
      service: m.service, metric: m.metric, label: m.label, used: m.used, quota_limit: m.limit,
      pct: m.pct, unit: m.unit, level: m.level, details: m.details ?? {}, captured_at: nowIso,
    };
    const prior = latest.get(`${m.service}:${m.metric}`);
    if (prior) {
      const { error } = await supabase.from("platform_quota_snapshots").update(row).eq("id", prior.id);
      if (error) console.error("quota snapshot update failed", error.message);
    } else {
      inserts.push(row);
    }
  }
  if (inserts.length) {
    const { error } = await supabase.from("platform_quota_snapshots").insert(inserts);
    if (error) console.error("quota snapshot insert failed", error.message);
  }
}

async function alertQuotas(supabase: any, settings: HealthSettings, metrics: QuotaMetric[]) {
  let sent = 0;
  const cooldownMs = Math.max(1, settings.quota_alert_cooldown_hours) * 60 * 60 * 1000;
  for (const m of metrics) {
    if (m.level !== "warning" && m.level !== "critical") continue;
    const alertKey = `quota:${m.service}:${m.metric}:${m.level}`;
    const { data: prior } = await supabase
      .from("platform_health_alerts")
      .select("id, created_at")
      .eq("alert_key", alertKey)
      .gte("created_at", new Date(Date.now() - cooldownMs).toISOString())
      .limit(1);
    if (prior?.length) continue;

    const isCritical = m.level === "critical";
    const limitSource = String(m.details?.limit_source ?? "");
    const isThreshold = limitSource === "alert threshold";
    const unverified = limitSource === "settings (unverified)";
    const usedStr = `${m.used} ${m.unit}`;
    const limitStr = m.limit === null ? "—" : `${m.limit} ${m.unit}`;
    const title = isThreshold
      ? `${m.label}: above the alert threshold`
      : `${m.label}: ${isCritical ? "limit nearly reached" : "approaching limit"}`;
    const action =
      m.service === "resend" && m.metric.startsWith("emails") ? "Upgrade the Resend plan or reduce outbound email before sends start failing."
      : m.service === "resend" ? "Open the Resend dashboard and look at the rejected sends (invalid recipients, unverified domain, quota)."
      : m.service === "supabase" ? "Upgrade the plan or free up space (archive logs, prune storage)."
      : m.service === "stripe" ? "Open Stripe → Developers → Webhooks, inspect the failed events, fix the handler and resend them."
      : m.service === "edge" || m.service === "errors" ? "Open Admin → System Errors to inspect what is failing."
      : "Review the metric on the Platform Health dashboard.";
    const html = shell(isCritical ? "#b91c1c" : "#b45309", title, `
      ${kvTable([
        ["Metric", m.label],
        ["Value", usedStr],
        [isThreshold ? "Alert threshold" : "Limit", limitStr],
        ...(m.pct !== null ? [["Usage", `${m.pct}%`] as [string, unknown]] : []),
        ["Where the value comes from", String(m.details?.source_note ?? m.details?.source ?? "platform data")],
        ...(!isThreshold ? [["Where the limit comes from", limitSource || "—"] as [string, unknown]] : []),
        ["Level", m.level.toUpperCase()],
        ["Action", action],
      ])}
      ${unverified ? `<p style="color:#b45309;"><strong>The limit is a value entered in Platform Health → Settings and has not been confirmed against your real plan.</strong> Check it there before acting on this alert.</p>` : ""}
      <p style="color:#71717a;">This alert repeats at most once every ${settings.quota_alert_cooldown_hours} hours while the condition persists.</p>`);
    const r = await sendAlert(supabase, settings, {
      alert_type: isCritical ? "quota_critical" : "quota_warning",
      alert_key: alertKey,
      component: m.label,
      severity: isCritical ? "critical" : "warning",
      title,
      message: `${usedStr}${m.limit !== null ? ` of ${limitStr}` : ""}${m.pct !== null ? ` (${m.pct}%)` : ""}${unverified ? " · limit not verified" : ""}`,
      html,
      details: { service: m.service, metric: m.metric, used: m.used, limit: m.limit, pct: m.pct, unit: m.unit, ...(m.details ?? {}) },
    });
    if (r.sent) sent++;
  }
  return sent;
}

async function runMonitor(supabase: any, supabaseUrl: string, serviceKey: string, source: "cron" | "manual") {
  const settings = await loadSettings(supabase);
  const runId = crypto.randomUUID();
  const startedAt = new Date();

  const [core, external] = await Promise.all([
    runCoreChecks(supabase, supabaseUrl, serviceKey, settings, { probeEdgeFunctions: true, includeCron: true }),
    runExternalChecks(settings, supabaseUrl),
  ]);
  const statuses = [...core, ...external.statuses];
  const quotas = await collectQuotas(supabase, settings, external.extras);

  await persistChecks(supabase, runId, source, statuses);
  const incidents = await reconcileIncidents(supabase, settings, statuses, startedAt);
  await snapshotQuotas(supabase, quotas);
  const quotaAlerts = await alertQuotas(supabase, settings, quotas);

  return {
    run_id: runId,
    source,
    timestamp: startedAt.toISOString(),
    duration_ms: Date.now() - startedAt.getTime(),
    statuses,
    quotas,
    incidents,
    quota_alerts_sent: quotaAlerts,
    plan_limits_verified: settings.plan_limits_verified === true,
  };
}

// ─── Monthly report ──────────────────────────────────────────────────────────

function monthRange(month?: string): { label: string; key: string; from: Date; to: Date } {
  let y: number, m: number; // m is 0-based
  if (month && /^\d{4}-\d{2}$/.test(month)) {
    y = Number(month.slice(0, 4)); m = Number(month.slice(5, 7)) - 1;
  } else {
    const now = new Date();
    const prev = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
    y = prev.getUTCFullYear(); m = prev.getUTCMonth();
  }
  const from = new Date(Date.UTC(y, m, 1));
  const to = new Date(Date.UTC(y, m + 1, 1));
  const label = from.toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
  return { label, key: `${y}-${String(m + 1).padStart(2, "0")}`, from, to };
}

async function count(supabase: any, table: string, build: (q: any) => any): Promise<number> {
  try {
    const { count } = await build(supabase.from(table).select("id", { count: "exact", head: true }));
    return count ?? 0;
  } catch { return 0; }
}

async function buildMonthlyReport(supabase: any, month?: string) {
  const range = monthRange(month);
  const fromIso = range.from.toISOString();
  const toIso = range.to.toISOString();
  const fromDay = fromIso.slice(0, 10);
  const toDay = toIso.slice(0, 10);
  const periodEnd = new Date(Math.min(Date.now(), range.to.getTime()));

  const { data: daily } = await supabase
    .from("platform_health_daily")
    .select("*")
    .gte("day", fromDay)
    .lt("day", toDay);

  const byComponent = new Map<string, any>();
  const daysWithChecks = new Set<string>();
  for (const d of daily ?? []) {
    daysWithChecks.add(String(d.day));
    const c = byComponent.get(d.component) ?? { component: d.component, category: d.category, checks_total: 0, checks_ok: 0, checks_degraded: 0, checks_down: 0, latency_weighted: 0, latency_n: 0, p95: 0 };
    c.checks_total += d.checks_total; c.checks_ok += d.checks_ok; c.checks_degraded += d.checks_degraded; c.checks_down += d.checks_down;
    if (d.avg_latency_ms != null) { c.latency_weighted += d.avg_latency_ms * d.checks_total; c.latency_n += d.checks_total; }
    c.p95 = Math.max(c.p95, d.p95_latency_ms ?? 0);
    byComponent.set(d.component, c);
  }

  const { data: incidents } = await supabase
    .from("platform_health_incidents")
    .select("*")
    .gte("started_at", fromIso)
    .lt("started_at", toIso)
    .order("started_at", { ascending: true });

  const incByComp = new Map<string, { n: number; min: number; max: number }>();
  const incidentRows = (incidents ?? []).map((i: any) => {
    const end = i.resolved_at ? new Date(i.resolved_at) : new Date();
    const b = incidentBounds(i, end);
    const e = incByComp.get(i.component) ?? { n: 0, min: 0, max: 0 };
    e.n++; e.min += b.min; e.max += b.max;
    incByComp.set(i.component, e);
    return {
      component: i.component, status: i.status,
      prev_ok_at: i.prev_ok_at ?? null, started_at: i.started_at,
      last_failed_at: i.last_failed_at ?? i.started_at, resolved_at: i.resolved_at,
      duration_min_seconds: Math.round(b.min), duration_max_seconds: Math.round(b.max),
      checks_failed: i.checks_failed,
      message: i.last_message ?? i.first_message,
    };
  });

  const components = [...byComponent.values()].map((c) => {
    const inc = incByComp.get(c.component) ?? { n: 0, min: 0, max: 0 };
    return {
      component: c.component,
      category: c.category,
      uptime_pct: c.checks_total ? Math.round(10000 * (c.checks_total - c.checks_down) / c.checks_total) / 100 : null,
      healthy_pct: c.checks_total ? Math.round(10000 * c.checks_ok / c.checks_total) / 100 : null,
      avg_latency_ms: c.latency_n ? Math.round(c.latency_weighted / c.latency_n) : null,
      p95_latency_ms: c.p95 || null,
      checks_total: c.checks_total,
      checks_ok: c.checks_ok,
      checks_down: c.checks_down,
      checks_degraded: c.checks_degraded,
      incidents: inc.n,
      downtime_min_seconds: Math.round(inc.min),
      downtime_max_seconds: Math.round(inc.max),
    };
  }).sort((a, b) => a.category.localeCompare(b.category) || a.component.localeCompare(b.component));

  const totalChecks = components.reduce((s, c) => s + c.checks_total, 0);
  const totalOk = components.reduce((s, c) => s + c.checks_ok, 0);

  const [mail, aiRequests, aiCached, webhooks, webhooksFailed, errorsTotal, errorsCritical, errorsHigh, alertsSent] = await Promise.all([
    emailStats(supabase, fromIso, toIso),
    count(supabase, "ai_usage_logs", (q) => q.gte("created_at", fromIso).lt("created_at", toIso)),
    count(supabase, "ai_usage_logs", (q) => q.gte("created_at", fromIso).lt("created_at", toIso).eq("cached", true)),
    count(supabase, "stripe_webhook_events", (q) => q.gte("processed_at", fromIso).lt("processed_at", toIso)),
    count(supabase, "stripe_webhook_events", (q) => q.gte("processed_at", fromIso).lt("processed_at", toIso).eq("status", "failed")),
    count(supabase, "system_errors", (q) => q.gte("timestamp", fromIso).lt("timestamp", toIso)),
    count(supabase, "system_errors", (q) => q.gte("timestamp", fromIso).lt("timestamp", toIso).eq("severity", "critical")),
    count(supabase, "system_errors", (q) => q.gte("timestamp", fromIso).lt("timestamp", toIso).eq("severity", "high")),
    count(supabase, "platform_health_alerts", (q) => q.gte("created_at", fromIso).lt("created_at", toIso).neq("alert_type", "monthly_report")),
  ]);

  // Usage trajectory: first vs last snapshot in the month per metric.
  const { data: snaps } = await supabase
    .from("platform_quota_snapshots")
    .select("service, metric, label, used, quota_limit, unit, level, captured_at")
    .gte("captured_at", fromIso)
    .lt("captured_at", toIso)
    .order("captured_at", { ascending: true });
  const quotaSummary = new Map<string, any>();
  for (const s of snaps ?? []) {
    const k = `${s.service}:${s.metric}`;
    const e = quotaSummary.get(k) ?? { service: s.service, metric: s.metric, label: s.label, unit: s.unit, first: s.used, last: s.used, peak: s.used, limit: s.quota_limit, worst_level: "ok", samples: 0 };
    e.last = s.used; e.peak = Math.max(Number(e.peak), Number(s.used)); e.limit = s.quota_limit; e.samples++;
    const rank = { ok: 0, info: 0, warning: 1, critical: 2 } as Record<string, number>;
    if ((rank[s.level] ?? 0) > (rank[e.worst_level] ?? 0)) e.worst_level = s.level;
    quotaSummary.set(k, e);
  }

  const daysInPeriod = Math.max(1, Math.ceil((periodEnd.getTime() - range.from.getTime()) / 86_400_000));

  return {
    period: range.key,
    period_label: range.label,
    generated_at: new Date().toISOString(),
    // Share of health checks that passed. With one check a day this is a
    // sample, not continuous uptime, and is labelled that way everywhere.
    checks_passed_pct: totalChecks ? Math.round(10000 * totalOk / totalChecks) / 100 : null,
    total_checks: totalChecks,
    checks_passed: totalOk,
    days_in_period: daysInPeriod,
    days_with_checks: daysWithChecks.size,
    components,
    incidents: incidentRows,
    usage: {
      emails_sent: mail?.sent_recipients ?? null,
      emails_rejected: mail?.failed_recipients ?? null,
      email_api_calls: mail?.sent_calls ?? null,
      ai_requests: aiRequests,
      ai_requests_cached: aiCached,
      stripe_webhooks: webhooks, stripe_webhooks_failed: webhooksFailed,
      system_errors: errorsTotal, critical_errors: errorsCritical, high_errors: errorsHigh,
      alerts_sent: alertsSent,
    },
    quotas: [...quotaSummary.values()],
  };
}

function monthlyReportHtml(report: any): string {
  const dash = (v: unknown) => (v === null || v === undefined ? "—" : String(v));
  const rows = report.components.map((c: any) => `
    <tr>
      <td style="padding:6px 8px;border-bottom:1px solid #f1f1f3;">${esc(c.component)}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #f1f1f3;text-align:right;color:${c.checks_ok < c.checks_total ? "#b91c1c" : "#0b6e4f"};font-weight:600;">${c.checks_ok}/${c.checks_total}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #f1f1f3;text-align:right;">${c.avg_latency_ms ?? "—"} ms</td>
      <td style="padding:6px 8px;border-bottom:1px solid #f1f1f3;text-align:right;">${c.incidents}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #f1f1f3;text-align:right;">${c.incidents ? fmtRange({ min: c.downtime_min_seconds, max: c.downtime_max_seconds }) : "—"}</td>
    </tr>`).join("");
  const incidentRows = report.incidents.slice(0, 15).map((i: any) => `
    <tr>
      <td style="padding:6px 8px;border-bottom:1px solid #f1f1f3;">${esc(i.component)}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #f1f1f3;">${esc(i.status)}${i.resolved_at ? "" : " · ongoing"}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #f1f1f3;">${fmtWhen(i.started_at)}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #f1f1f3;text-align:right;">${fmtRange({ min: i.duration_min_seconds, max: i.duration_max_seconds })}</td>
    </tr>`).join("");
  const u = report.usage;
  const th = (t: string, right = false) => `<th style="text-align:${right ? "right" : "left"};padding:6px 8px;color:#71717a;font-weight:600;border-bottom:2px solid #e4e4e7;">${t}</th>`;
  const allPassed = report.total_checks > 0 && report.checks_passed === report.total_checks;
  return shell("#0f766e", `Platform Health Report · ${report.period_label}`, `
    <p style="font-size:15px;"><strong style="font-size:20px;color:${allPassed ? "#0b6e4f" : "#b91c1c"};">${report.checks_passed} of ${report.total_checks}</strong> health checks passed (${dash(report.checks_passed_pct)}%).</p>
    <p style="color:#71717a;">Checks ran on ${report.days_with_checks} of ${report.days_in_period} days. Services are sampled, not watched continuously: a problem that starts and ends between two checks is not recorded.</p>
    <h3 style="margin:20px 0 8px;font-size:14px;">Service checks</h3>
    <table style="width:100%;border-collapse:collapse;font-size:13px;">
      <thead><tr>${th("Service")}${th("Checks passed", true)}${th("Avg response", true)}${th("Incidents", true)}${th("Unhealthy for", true)}</tr></thead>
      <tbody>${rows || `<tr><td colspan="5" style="padding:8px;color:#71717a;">No checks were recorded in this month.</td></tr>`}</tbody>
    </table>
    <h3 style="margin:20px 0 8px;font-size:14px;">Usage</h3>
    ${kvTable([
      ["Emails accepted by Resend", u.emails_sent === null ? "not available" : `${u.emails_sent} (one per recipient, ${dash(u.email_api_calls)} sends)`],
      ["Emails rejected by Resend", u.emails_rejected === null ? "not available" : u.emails_rejected],
      ["AI requests", `${u.ai_requests} (${u.ai_requests_cached} served from cache)`],
      ["Stripe webhook events received", `${u.stripe_webhooks} (${u.stripe_webhooks_failed} failed processing)`],
      ["Logged system errors", `${u.system_errors} total · ${u.critical_errors} critical · ${u.high_errors} high`],
      ["Alerts sent", u.alerts_sent],
    ])}
    <p style="color:#71717a;font-size:12px;">Email and error figures come from the platform's own logs. Email sent outside the platform and errors that were never logged are not included.</p>
    ${report.incidents.length ? `
    <h3 style="margin:20px 0 8px;font-size:14px;">Incidents (${report.incidents.length})</h3>
    <table style="width:100%;border-collapse:collapse;font-size:13px;">
      <thead><tr>${th("Service")}${th("Status")}${th("First failed check")}${th("Unhealthy for", true)}</tr></thead>
      <tbody>${incidentRows}</tbody>
    </table>` : `<p style="color:#0b6e4f;font-weight:600;">No check failed this month.</p>`}
  `);
}

async function sendMonthlyReport(supabase: any, month?: string) {
  const settings = await loadSettings(supabase);
  const report = await buildMonthlyReport(supabase, month);
  const title = `Monthly platform report · ${report.period_label}`;
  const r = await sendAlert(supabase, settings, {
    alert_type: "monthly_report",
    alert_key: `report:monthly:${report.period}`,
    component: null,
    severity: "info",
    title,
    message: `${report.checks_passed}/${report.total_checks} checks passed · ${report.incidents.length} incidents · ${report.usage.emails_sent ?? "?"} emails · ${report.usage.ai_requests} AI requests`,
    html: monthlyReportHtml(report),
    details: report,
    inApp: false,
  });
  return { report, email_sent: r.sent, email_error: r.error };
}

// ─── Inspect: what is stored right now (read-only) ───────────────────────────

async function inspect(supabase: any) {
  const since = new Date(Date.now() - 8 * 86_400_000).toISOString();
  const [checks, incidents, quotas, alerts, settings, cron, http, daily] = await Promise.all([
    supabase.from("platform_health_checks").select("component, category, status, latency_ms, message, details, source, checked_at").gte("checked_at", since).order("checked_at", { ascending: false }).limit(400),
    supabase.from("platform_health_incidents").select("*").order("started_at", { ascending: false }).limit(30),
    supabase.from("platform_quota_snapshots").select("service, metric, label, used, quota_limit, pct, unit, level, details, captured_at").gte("captured_at", since).order("captured_at", { ascending: false }).limit(200),
    supabase.from("platform_health_alerts").select("created_at, alert_type, alert_key, component, severity, title, message, recipients, email_status, email_error, details").order("created_at", { ascending: false }).limit(30),
    supabase.from("platform_health_settings").select("key, value").order("key"),
    supabase.rpc("get_cron_job_health"),
    supabase.rpc("get_db_http_health"),
    supabase.from("platform_health_daily").select("*").order("day", { ascending: false }).limit(200),
  ]);

  const latest = new Map<string, any>();
  const runs = new Map<string, { source: string; n: number }>();
  for (const c of checks.data ?? []) {
    if (!latest.has(c.component)) latest.set(c.component, c);
    const k = String(c.checked_at).slice(0, 16);
    const e = runs.get(k) ?? { source: c.source, n: 0 };
    e.n++; runs.set(k, e);
  }
  const latestQuota = new Map<string, any>();
  for (const q of quotas.data ?? []) {
    const k = `${q.service}:${q.metric}`;
    if (!latestQuota.has(k)) latestQuota.set(k, q);
  }
  return {
    now: new Date().toISOString(),
    latest_checks: [...latest.values()],
    runs_last_8_days: [...runs.entries()].map(([minute, v]) => ({ minute, ...v })),
    incidents: incidents.data ?? [],
    latest_quotas: [...latestQuota.values()],
    alerts: (alerts.data ?? []).map((a: any) => ({ ...a, details: a.alert_type === "monthly_report" ? { period: a.details?.period } : a.details })),
    settings: settings.data ?? [],
    cron_jobs: cron.data ?? cron.error?.message ?? null,
    db_http: http.data ?? http.error?.message ?? null,
    daily: daily.data ?? [],
    errors: [checks, incidents, quotas, alerts, settings, daily].map((r: any) => r.error?.message).filter(Boolean),
  };
}

// ─── HTTP entry ──────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  let body: any = {};
  try { body = await req.json(); } catch { /* empty body */ }
  const mode: string = body?.mode ?? "run";

  // Auth, in order: service role key, the database's trigger secret (what
  // pg_cron sends on this project), or an agency admin session.
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  let isService = !!token && timingSafeEqual(token, serviceKey);
  if (!isService) {
    const triggerSecret = req.headers.get("x-trigger-secret") ?? "";
    if (triggerSecret) {
      const { data } = await supabase.from("cron_config").select("value").eq("key", "dtt_ghl_trigger_secret").maybeSingle();
      const expected = typeof data?.value === "string" ? data.value : "";
      isService = expected.length > 0 && timingSafeEqual(triggerSecret, expected);
    }
  }
  let isSuperAdmin = isService;
  if (!isService) {
    const access = await getAdminAccess(req);
    if (!access.isAgencyAdmin) return json({ error: "Admin access required" }, 401);
    isSuperAdmin = access.isSuperAdmin;
  }

  try {
    if (mode === "run") {
      const source: "cron" | "manual" = isService && body?.source !== "manual" ? "cron" : "manual";
      const result = await runMonitor(supabase, supabaseUrl, serviceKey, source);
      return json(result);
    }

    if (mode === "inspect") {
      return json(await inspect(supabase));
    }

    if (mode === "report") {
      if (!isSuperAdmin) return json({ error: "Super admin access required" }, 403);
      const result = await sendMonthlyReport(supabase, body?.month);
      return json(result);
    }

    if (mode === "preview_report") {
      const report = await buildMonthlyReport(supabase, body?.month);
      return json({ report });
    }

    if (mode === "test_alert") {
      if (!isSuperAdmin) return json({ error: "Super admin access required" }, 403);
      const settings = await loadSettings(supabase);
      const recipients = await alertRecipients(supabase, settings);
      const r = await sendAlert(supabase, settings, {
        alert_type: "test_alert",
        alert_key: `test:${Date.now()}`,
        component: null,
        severity: "info",
        title: "Test alert from Platform Health",
        message: "If you received this, outage and quota alerts will reach this inbox.",
        html: shell("#0f766e", "Test alert", `<p>This is a test alert from Aurezo Platform Health monitoring.</p>${kvTable([["Recipients", recipients.join(", ") || "none"], ["Alerts enabled", settings.alerts_enabled ? "yes" : "no"], ["Sent", fmtWhen(new Date())]])}`),
        inApp: false,
      });
      return json({ sent: r.sent, error: r.error, recipients });
    }

    return json({ error: `Unknown mode: ${mode}` }, 400);
  } catch (e) {
    console.error("platform-health-monitor error", (e as Error).message);
    return json({ error: (e as Error).message }, 500);
  }
});
