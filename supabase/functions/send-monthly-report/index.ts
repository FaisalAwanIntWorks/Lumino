import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { timingSafeEqual } from "../_shared/timing-safe.ts";
import {
  buildEmailHtml,
  buildPeriod,
  EMPTY_STATS,
  fmtInt,
  WIDGET_VIEW_SOURCES,
  type Stats,
} from "./template.ts";

const Resend = (await import("https://esm.sh/resend@2.0.0")).Resend;

const FROM_EMAIL = "Aurezo <onboarding@resend.dev>";
const REPLY_TO = Deno.env.get("SUPPORT_EMAIL") || undefined;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Resend's default rate limit is 2 requests/second — stay comfortably under it.
const SEND_DELAY_MS = 450;

const AI_IMAGE_FEATURES = ["ring_preview", "grillz_preview", "enquiry_preview"];


function countOf(result: any): number {
  return result?.count ?? 0;
}

async function computeStats(
  supabase: any,
  clientId: string,
  startISO: string,
  endISO: string,
): Promise<Stats> {
  const range = (query: any, col: string) => query.gte(col, startISO).lte(col, endISO);
  const headCount = (table: string, col = "created_at") =>
    range(
      supabase.from(table).select("id", { count: "exact", head: true }).eq("client_id", clientId),
      col,
    );

  const [
    viewStats,
    savedDesigns,
    ringBuilder,
    diamondLeads,
    grillLeads,
    enquiryLeads,
    metalLeads,
    bookingRows,
    aiImages,
    aiChats,
    orderRows,
    cadRequests,
  ] = await Promise.all([
    supabase.rpc("get_widget_view_stats", {
      p_client_id: clientId,
      p_start_date: startISO,
      p_end_date: endISO,
    }),
    headCount("saved_designs"),
    headCount("design_requests"),
    headCount("diamond_form_leads"),
    headCount("grill_form_leads"),
    headCount("custom_enquiry_leads"),
    headCount("metal_buying_leads"),
    range(
      supabase.from("appointment_bookings").select("id, ring_configuration").eq("client_id", clientId),
      "created_at",
    ),
    range(
      supabase.from("ai_usage_logs").select("id", { count: "exact", head: true })
        .eq("client_id", clientId).in("feature", AI_IMAGE_FEATURES),
      "created_at",
    ),
    range(
      supabase.from("ai_chat_sessions").select("id", { count: "exact", head: true }).eq("client_id", clientId),
      "started_at",
    ),
    range(
      supabase.from("orders").select("total_amount, order_source").eq("client_id", clientId),
      "created_at",
    ),
    headCount("cad_requests"),
  ]);

  // Views by widget surface
  const viewsBySource: Record<string, { total: number; unique: number }> = {};
  let views = 0;
  let uniqueVisitors = 0;
  for (const { key } of WIDGET_VIEW_SOURCES) {
    const row = (viewStats?.data as any[] | null)?.find((r: any) => r.source === key);
    const entry = { total: Number(row?.total_count ?? 0), unique: Number(row?.unique_sessions ?? 0) };
    viewsBySource[key] = entry;
    views += entry.total;
    uniqueVisitors += entry.unique;
  }

  // Bookings split the same way the dashboard does: Metal IQ bookings are their own bucket
  const bookings = bookingRows?.data ?? [];
  const metalIqBookings = bookings.filter((b: any) => {
    const cfg = b.ring_configuration;
    return cfg && typeof cfg === "object" && cfg.source === "metal_iq";
  }).length;
  const regularBookings = bookings.length - metalIqBookings;

  const leadSources: Record<string, number> = {
    widget: countOf(savedDesigns),
    ring_builder: countOf(ringBuilder),
    diamond_form: countOf(diamondLeads),
    grill_form: countOf(grillLeads),
    custom_enquiry: countOf(enquiryLeads),
    metal_iq: countOf(metalLeads),
    booking: regularBookings,
    metal_iq_bookings: metalIqBookings,
  };

  // Mirrors client-dashboard-stats' totalLeads: metal_iq_bookings is a subset of
  // appointment_bookings shown separately, so it is not added on top.
  const leads = Object.entries(leadSources)
    .filter(([key]) => key !== "metal_iq_bookings")
    .reduce((sum, [, n]) => sum + n, 0);

  const orders = orderRows?.data ?? [];
  const revenue = orders.reduce((sum: number, o: any) => sum + Number(o.total_amount || 0), 0);
  const formSources = ["ring-builder", "grillz-builder", "custom-inquiry"];
  const depositOrders = orders.filter((o: any) => formSources.includes(o.order_source));
  const deposits = depositOrders.reduce((sum: number, o: any) => sum + Number(o.total_amount || 0), 0);

  const imageCount = countOf(aiImages);
  const chatCount = countOf(aiChats);

  return {
    views,
    uniqueVisitors,
    viewsBySource,
    leads,
    leadSources,
    aiGenerations: imageCount + chatCount,
    aiImages: imageCount,
    aiChats: chatCount,
    bookings: bookings.length,
    orders: orders.length,
    revenue,
    deposits,
    depositCount: depositOrders.length,
    cadRequests: countOf(cadRequests),
  };
}

function hasActivity(s: Stats): boolean {
  return s.views > 0 || s.leads > 0 || s.aiGenerations > 0 || s.orders > 0 || s.cadRequests > 0;
}


// ─── Handler ──────────────────────────────────────────────────────────────
interface RequestBody {
  month?: string;          // "YYYY-MM" — defaults to the previous calendar month
  clientId?: string;       // single client
  clientIds?: string[];    // explicit subset
  dryRun?: boolean;        // compute + return, never send
  force?: boolean;         // resend even if already sent for this month
  includeEmpty?: boolean;  // send even when the month had no activity
  testEmail?: string;      // send to this address instead of the client (not recorded as a run)
  limit?: number;          // max clients loaded per invocation
  maxSends?: number;       // max emails sent per invocation (keeps runs inside the wall-clock limit)
}

// Clients already handled for the target month are skipped without recomputing
// anything, so a follow-up invocation resumes exactly where the previous stopped.
const HANDLED_STATUSES = ["sent", "skipped_no_activity"];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** A malformed clients.timezone must not abort the whole run. */
function safeTimeZone(tz: string | null | undefined): string {
  if (!tz) return "America/New_York";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz }).format(new Date());
    return tz;
  } catch {
    console.warn(`[send-monthly-report] invalid timezone "${tz}" — falling back`);
    return "America/New_York";
  }
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const resendKey = Deno.env.get("RESEND_API_KEY");

    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace("Bearer ", "").trim();
    const cronSecret = req.headers.get("x-cron-secret") ?? "";

    const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

    // Cron calls with the shared cron_config secret (the DB has no access to
    // the service role key); admins may trigger manually with their session.
    let isCron = !!token && token === serviceKey;
    if (!isCron && cronSecret) {
      const { data: secretRow } = await supabase
        .from("cron_config")
        .select("value")
        .eq("key", "access_alert_secret")
        .maybeSingle();
      isCron = !!secretRow?.value && timingSafeEqual(cronSecret, secretRow.value as string);
    }
    if (!isCron && !token) return json({ error: "Authentication required" }, 401);

    if (!isCron) {
      const { data: { user }, error: authError } = await supabase.auth.getUser(token);
      if (authError || !user) return json({ error: "Invalid authentication" }, 401);

      const { data: adminRole } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .eq("role", "agency_admin")
        .maybeSingle();

      if (!adminRole) return json({ error: "Access denied" }, 403);
    }

    const body: RequestBody = await req.json().catch(() => ({}));

    if (!resendKey && !body.dryRun) {
      return json({ error: "RESEND_API_KEY not configured" }, 503);
    }
    const resend = resendKey ? new Resend(resendKey) : null;

    // ── Resolve the reporting month (defaults to the previous calendar month) ──
    let targetYear: number;
    let targetMonthIdx: number;
    if (body.month) {
      const match = /^(\d{4})-(\d{2})$/.exec(body.month);
      if (!match) return json({ error: "month must be formatted as YYYY-MM" }, 400);
      targetYear = Number(match[1]);
      targetMonthIdx = Number(match[2]) - 1;
      if (targetMonthIdx < 0 || targetMonthIdx > 11) {
        return json({ error: "month must be between 01 and 12" }, 400);
      }
    } else {
      const now = new Date();
      targetYear = now.getUTCMonth() === 0 ? now.getUTCFullYear() - 1 : now.getUTCFullYear();
      targetMonthIdx = now.getUTCMonth() === 0 ? 11 : now.getUTCMonth() - 1;
    }

    // ── Load the client list ──────────────────────────────────────────────
    let clientQuery = supabase
      .from("clients")
      .select("id, company_name, email, timezone, currency")
      .eq("status", "active")
      .order("company_name", { ascending: true });

    if (body.clientId) clientQuery = clientQuery.eq("id", body.clientId);
    if (body.clientIds?.length) clientQuery = clientQuery.in("id", body.clientIds);

    const limit = Math.min(Math.max(body.limit ?? 500, 1), 1000);
    clientQuery = clientQuery.limit(limit);

    const { data: clients, error: clientsError } = await clientQuery;
    if (clientsError) throw clientsError;

    // period_month is the same calendar month for every client, so one lookup
    // tells us who has already been handled this run cycle.
    const periodMonthKey = `${targetYear}-${String(targetMonthIdx + 1).padStart(2, "0")}-01`;
    const handled = new Set<string>();
    if (!body.force && !body.testEmail) {
      const { data: priorRuns } = await supabase
        .from("monthly_report_runs")
        .select("client_id, status")
        .eq("period_month", periodMonthKey)
        .in("status", HANDLED_STATUSES);
      for (const row of priorRuns ?? []) handled.add(row.client_id);
    }

    const maxSends = Math.min(Math.max(body.maxSends ?? 100, 1), 500);
    const results: Array<Record<string, unknown>> = [];
    let sent = 0;
    let skipped = 0;
    let failed = 0;
    let remaining = 0;

    for (const client of clients ?? []) {
      if (handled.has(client.id)) {
        skipped++;
        results.push({ clientId: client.id, company: client.company_name, status: "skipped_already_sent" });
        continue;
      }

      // Leave the rest for the next invocation rather than risk the wall-clock limit.
      if (sent >= maxSends) {
        remaining++;
        continue;
      }

      const tz = safeTimeZone(client.timezone);
      const period = buildPeriod(targetYear, targetMonthIdx, tz);
      const prevYear = targetMonthIdx === 0 ? targetYear - 1 : targetYear;
      const prevMonthIdx = targetMonthIdx === 0 ? 11 : targetMonthIdx - 1;
      const prevPeriod = buildPeriod(prevYear, prevMonthIdx, tz);

      const recipient = body.testEmail || client.email;
      const isTest = Boolean(body.testEmail);

      try {
        if (!recipient) {
          skipped++;
          results.push({ clientId: client.id, company: client.company_name, status: "skipped_no_email" });
          continue;
        }

        // Opt-out check (absent row = enabled, matching the rest of the platform)
        const { data: pref } = await supabase
          .from("client_notification_preferences")
          .select("is_enabled")
          .eq("client_id", client.id)
          .eq("notification_type", "monthly_report")
          .maybeSingle();

        if (pref && pref.is_enabled === false && !isTest) {
          skipped++;
          results.push({ clientId: client.id, company: client.company_name, status: "skipped_opted_out" });
          continue;
        }

        const [stats, previous, wallet, freeCreditRows, upcoming] = await Promise.all([
          computeStats(supabase, client.id, period.startISO, period.endISO),
          computeStats(supabase, client.id, prevPeriod.startISO, prevPeriod.endISO)
            .catch(() => EMPTY_STATS),
          supabase.from("client_wallets").select("balance").eq("client_id", client.id).maybeSingle(),
          supabase.from("client_free_credits").select("dollars_remaining")
            .eq("client_id", client.id).gt("expires_at", new Date().toISOString()),
          supabase.from("appointment_bookings").select("id", { count: "exact", head: true })
            .eq("client_id", client.id)
            .gte("preferred_date", new Date().toISOString().split("T")[0])
            .lte("preferred_date", new Date(Date.now() + 30 * 86400000).toISOString().split("T")[0]),
        ]);

        if (!hasActivity(stats) && !body.includeEmpty && !isTest) {
          skipped++;
          if (!body.dryRun) {
            await supabase.from("monthly_report_runs").upsert({
              client_id: client.id,
              period_month: period.periodMonth,
              status: "skipped_no_activity",
              recipient_email: recipient,
              metrics: stats as unknown as Record<string, unknown>,
              updated_at: new Date().toISOString(),
            }, { onConflict: "client_id,period_month" });
          }
          results.push({ clientId: client.id, company: client.company_name, status: "skipped_no_activity" });
          continue;
        }

        const freeCredits = (freeCreditRows?.data ?? [])
          .reduce((sum: number, row: any) => sum + Number(row.dollars_remaining || 0), 0);

        const html = buildEmailHtml({
          companyName: client.company_name,
          period,
          stats,
          previous,
          currency: client.currency || "USD",
          walletBalance: Number(wallet?.data?.balance ?? 0),
          freeCredits,
          upcomingBookings: upcoming?.count ?? 0,
        });

        const subject = `Your ${period.monthLabel} report — ${fmtInt(stats.views)} views, ${fmtInt(stats.leads)} leads`;

        if (body.dryRun) {
          results.push({
            clientId: client.id,
            company: client.company_name,
            status: "dry_run",
            recipient,
            subject,
            period: period.label,
            stats,
          });
          continue;
        }

        const emailResponse = await resend!.emails.send({
          from: FROM_EMAIL,
          to: [recipient],
          subject,
          html,
          reply_to: REPLY_TO,
        });

        if ((emailResponse as any)?.error) {
          throw new Error((emailResponse as any).error.message || "Resend rejected the message");
        }

        const resendId = emailResponse.data?.id ?? null;

        await supabase.from("email_logs").insert({
          recipient_email: recipient,
          email_type: "monthly_report",
          subject,
          status: "sent",
          resend_id: resendId,
          metadata: {
            client_id: client.id,
            company_name: client.company_name,
            period: period.periodMonth,
            views: stats.views,
            leads: stats.leads,
            ai_generations: stats.aiGenerations,
            test: isTest,
          },
        });

        if (!isTest) {
          await supabase.from("monthly_report_runs").upsert({
            client_id: client.id,
            period_month: period.periodMonth,
            status: "sent",
            recipient_email: recipient,
            resend_id: resendId,
            metrics: stats as unknown as Record<string, unknown>,
            error_message: null,
            updated_at: new Date().toISOString(),
          }, { onConflict: "client_id,period_month" });
        }

        sent++;
        results.push({
          clientId: client.id,
          company: client.company_name,
          status: "sent",
          recipient,
          period: period.label,
          views: stats.views,
          leads: stats.leads,
          aiGenerations: stats.aiGenerations,
        });

        await sleep(SEND_DELAY_MS);
      } catch (err) {
        failed++;
        const message = err instanceof Error ? err.message : "Unknown error";
        console.error(`[send-monthly-report] ${client.company_name} failed:`, message);

        if (!body.dryRun && !isTest) {
          await supabase.from("monthly_report_runs").upsert({
            client_id: client.id,
            period_month: period.periodMonth,
            status: "failed",
            recipient_email: recipient ?? null,
            error_message: message.slice(0, 500),
            updated_at: new Date().toISOString(),
          }, { onConflict: "client_id,period_month" });
        }

        results.push({ clientId: client.id, company: client.company_name, status: "failed", error: message });
      }
    }

    const monthKey = periodMonthKey.slice(0, 7);
    console.log(
      `[send-monthly-report] ${monthKey}: sent=${sent} skipped=${skipped} failed=${failed} remaining=${remaining}`,
    );

    return json({
      success: true,
      month: monthKey,
      processed: clients?.length ?? 0,
      sent,
      skipped,
      failed,
      remaining,
      // A later invocation picks up whoever is left — already-handled clients are skipped.
      hasMore: remaining > 0 || (clients?.length ?? 0) === limit,
      results,
    });
  } catch (error) {
    console.error("[send-monthly-report] fatal:", error);
    return json({ error: error instanceof Error ? error.message : "Unknown error" }, 500);
  }
});
