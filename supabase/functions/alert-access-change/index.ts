/**
 * alert-access-change
 *
 * Fired by the `trg_dispatch_client_access_alert` trigger for every row in
 * `client_access_events` (module revoked/granted, client status flip, plan
 * change, billing subscription flip, manual billing override).
 *
 * It enriches the raw before/after row with the things an admin actually needs
 * to judge the blast radius — which modules changed, the AI limits before and
 * after, and whether the client's widgets are live right now — then fans out an
 * in-app admin notification and an email.
 *
 * Widget activation / deactivation gets its own dedicated alert to the super
 * admins (admin_staff_members.is_super_admin), whether it came from billing
 * (subscription cancelled / reinstated, override set / cleared) or from a
 * widget module being toggled on or off for the client.
 *
 * Called with the service-role key only (pg_net); no public surface.
 */
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { featureLabel, GATED_FEATURE_KEYS } from "../_shared/feature-registry.ts";
import { timingSafeEqual } from "../_shared/timing-safe.ts";
import { BILLING_EMAIL_RECIPIENTS, BILLING_ACCESS_EVENT_TYPES } from "../_shared/billing-email-recipients.ts";

const Resend = (await import("npm:resend@2.0.0")).Resend;
const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const FROM_EMAIL = "Aurezo <onboarding@resend.dev>";
const REPLY_TO = Deno.env.get("SUPPORT_EMAIL") || undefined;
const ADMIN_BASE_URL = "https://studioadmin.aurezotech.com";

const log = (s: string, d?: unknown) =>
  console.log(`[ALERT-ACCESS-CHANGE] ${s}${d ? " - " + JSON.stringify(d) : ""}`);

type Severity = "critical" | "info";

interface AccessEvent {
  id: string;
  client_id: string;
  event_type: string;
  severity: Severity;
  source: string | null;
  actor: string | null;
  before_state: Record<string, unknown>;
  after_state: Record<string, unknown>;
  revoked_keys: string[];
  granted_keys: string[];
  notified_at: string | null;
  created_at: string;
}

interface AiLimits {
  chat_rpm: number | null;
  image_rpm: number | null;
  cost_estimate_rpm: number | null;
  chat_quota: number | null;
  image_quota: number | null;
}

const EVENT_TITLES: Record<string, string> = {
  features_changed: "Client Module Access Changed",
  client_status_changed: "Client Account Status Changed",
  plan_changed: "Client Plan Changed",
  subscription_status_changed: "Client Billing Status Changed",
  billing_override_changed: "Client Billing Override Changed",
};

function esc(v: unknown): string {
  return String(v ?? "—")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

const fmtNum = (n: number | null | undefined) =>
  typeof n === "number" ? n.toLocaleString("en-US") : "—";

const fmtDate = (v: unknown) => {
  if (typeof v !== "string" || !v) return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }) + " UTC";
};

/** AI limits for a plan, or nulls when the plan is unknown/unset. */
async function limitsForPlan(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  planId: string | null,
): Promise<AiLimits> {
  const empty: AiLimits = {
    chat_rpm: null, image_rpm: null, cost_estimate_rpm: null, chat_quota: null, image_quota: null,
  };
  if (!planId) return empty;
  const { data } = await supabase
    .from("plan_ai_defaults")
    .select("chat_rpm, image_rpm, cost_estimate_rpm, chat_quota, image_quota")
    .eq("plan_id", planId)
    .maybeSingle();
  return (data as AiLimits) ?? empty;
}

function limitsChanged(a: AiLimits, b: AiLimits): boolean {
  return (["chat_rpm", "image_rpm", "cost_estimate_rpm", "chat_quota", "image_quota"] as const)
    .some((k) => a[k] !== b[k]);
}

/** Resolve auth emails for a list of user ids (skips users without one). */
// deno-lint-ignore no-explicit-any
async function emailsFor(supabase: any, userIds: string[]): Promise<string[]> {
  const out: string[] = [];
  for (const uid of userIds) {
    const { data, error } = await supabase.auth.admin.getUserById(uid);
    if (!error && data?.user?.email) out.push(data.user.email);
  }
  return out;
}

interface EmailSpec {
  kicker: string;
  title: string;
  intro: string;
  accent: string;
  rows: Array<[string, string]>;
  clientId: string;
}

function renderEmail(spec: EmailSpec): string {
  const detailsHtml = spec.rows
    .map(([k, v], i) => `<div style="padding:10px 0;${i === 0 ? "" : "border-top:1px solid #eee;"}">
      <div style="color:#777;font-size:12px;font-weight:600;letter-spacing:0.4px;text-transform:uppercase;margin-bottom:4px;">${k}</div>
      <div style="color:#1a1a1a;font-size:15px;line-height:1.5;word-break:break-word;overflow-wrap:anywhere;">${v}</div>
    </div>`)
    .join("");

  const adminUrl = `${ADMIN_BASE_URL}/admin/clients/${spec.clientId}`;

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light only">
<style>:root{color-scheme:light only;}@media(prefers-color-scheme:dark){.eh{background-color:#000000!important;}}[data-ogsc] .eh{background-color:#000000!important;}
@media only screen and (max-width:600px){.eb-pad{padding:24px 20px 4px!important;}.eb-pad2{padding:0 20px!important;}.eb-foot{padding:20px!important;}.eb-head{padding:24px 20px 20px!important;}}</style></head>
<body style="margin:0;padding:0;background-color:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
<table role="presentation" style="width:100%;border-collapse:collapse;"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" style="width:100%;max-width:600px;border-collapse:collapse;background-color:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
  <tr><td class="eh eb-head" style="padding:32px 40px 24px;text-align:center;background-color:#000000;">
    <img src="https://studio.aurezotech.com/images/aurezo-email-logo.png" alt="Aurezo" style="height:56px;" />
  </td></tr>
  <tr><td class="eb-pad" style="padding:36px 40px 8px;">
    <p style="margin:0 0 6px;color:${spec.accent};font-size:12px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;">${spec.kicker}</p>
    <h2 style="margin:0 0 12px;color:#1a1a1a;font-size:22px;font-weight:600;line-height:1.3;">${spec.title}</h2>
    <p style="margin:0 0 24px;color:#555;font-size:15px;line-height:1.6;">${spec.intro}</p>
  </td></tr>
  <tr><td class="eb-pad2" style="padding:0 40px;">
    <div style="background-color:#f9f9f9;border:1px solid #eee;border-radius:6px;padding:16px 20px;margin-bottom:24px;">
      <p style="margin:0 0 8px;color:#1a1a1a;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Before / After</p>
      ${detailsHtml}
    </div>
    <table role="presentation" style="width:100%;border-collapse:collapse;"><tr><td align="center" style="padding:8px 0 24px;">
      <a href="${adminUrl}" style="display:inline-block;padding:12px 24px;background-color:${spec.accent};color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;border-radius:6px;">Open Client in Admin</a>
    </td></tr></table>
  </td></tr>
  <tr><td class="eb-foot" style="padding:24px 40px;background-color:#fafafa;border-top:1px solid #eee;">
    <p style="margin:0;color:#999;font-size:12px;text-align:center;">&copy; ${new Date().getFullYear()} Aurezo Admin Notification<br>
      <a href="${ADMIN_BASE_URL}" style="color:#0b6e4f;text-decoration:none;font-weight:600;">studioadmin.aurezotech.com</a>
    </p>
  </td></tr>
</table>
</td></tr></table></body></html>`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!serviceKey) {
    return new Response(JSON.stringify({ error: "not configured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(Deno.env.get("SUPABASE_URL") ?? "", serviceKey, {
    auth: { persistSession: false },
  });

  // Caller is either the DB trigger (shared secret from cron_config) or an
  // internal service-role call. Nothing else may reach this function.
  const auth = req.headers.get("Authorization") ?? "";
  let allowed = auth === `Bearer ${serviceKey}`;
  if (!allowed) {
    const presented = req.headers.get("x-alert-secret") ?? "";
    if (presented) {
      const { data: secretRow } = await supabase
        .from("cron_config")
        .select("value")
        .eq("key", "access_alert_secret")
        .maybeSingle();
      allowed = !!secretRow?.value && timingSafeEqual(presented, secretRow.value as string);
    }
  }
  if (!allowed) {
    return new Response(JSON.stringify({ error: "forbidden" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let eventId: string | null = null;

  try {
    const body = await req.json().catch(() => ({}));
    eventId = typeof body?.event_id === "string" ? body.event_id : null;
    if (!eventId) {
      return new Response(JSON.stringify({ error: "event_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: event, error: eventErr } = await supabase
      .from("client_access_events")
      .select("*")
      .eq("id", eventId)
      .maybeSingle<AccessEvent>();
    if (eventErr || !event) throw new Error(`event not found: ${eventId}`);

    // Idempotency — pg_net can retry, and a re-run must not re-email.
    if (event.notified_at) {
      return new Response(JSON.stringify({ success: true, skipped: "already_notified" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const before = (event.before_state ?? {}) as Record<string, unknown>;
    const after = (event.after_state ?? {}) as Record<string, unknown>;

    const { data: client } = await supabase
      .from("clients")
      .select("id, company_name, email, status, plan_id, enabled_features, billing_override_until")
      .eq("id", event.client_id)
      .maybeSingle();

    const clientName = client?.company_name ?? client?.email ?? "Unknown client";

    // ── Widget status ───────────────────────────────────────────────────
    // Billing events carry the gate result before/after the flip straight from
    // the trigger. For everything else, ask the gate the widgets themselves use
    // (`get_client_subscription_active`) — nothing more, nothing less, so the
    // alert never disagrees with what the embed actually does.
    let widgetsLive: boolean;
    if (typeof after.widgets_live === "boolean") {
      widgetsLive = after.widgets_live;
    } else {
      const { data: subActive } = await supabase.rpc("get_client_subscription_active", {
        client_uuid: event.client_id,
      });
      widgetsLive = subActive !== false;
    }
    const widgetsLiveBefore =
      typeof before.widgets_live === "boolean" ? before.widgets_live : null;
    const billingFlip = widgetsLiveBefore !== null && widgetsLiveBefore !== widgetsLive;

    const { data: subRow } = await supabase
      .from("client_subscriptions")
      .select("status, plan_name, current_period_end, cancel_at_period_end")
      .eq("client_id", event.client_id)
      .maybeSingle();

    // ── AI limits before/after ──────────────────────────────────────────
    const beforePlanId =
      event.event_type === "plan_changed"
        ? ((before.plan_id as string | null | undefined) ?? null)
        : (client?.plan_id ?? null);
    const afterPlanId =
      event.event_type === "plan_changed"
        ? ((after.plan_id as string | null | undefined) ?? null)
        : (client?.plan_id ?? null);

    const [beforeLimits, afterLimits] = await Promise.all([
      limitsForPlan(supabase, beforePlanId),
      limitsForPlan(supabase, afterPlanId),
    ]);

    // ── Human summary ───────────────────────────────────────────────────
    const revoked = (event.revoked_keys ?? []).map(featureLabel);
    const granted = (event.granted_keys ?? []).map(featureLabel);

    // Widget modules (subscription-gated) toggled on/off in this event.
    const widgetKeysOff = (event.revoked_keys ?? []).filter((k) => GATED_FEATURE_KEYS.includes(k));
    const widgetKeysOn = (event.granted_keys ?? []).filter((k) => GATED_FEATURE_KEYS.includes(k));
    const moduleFlip = widgetKeysOff.length > 0 || widgetKeysOn.length > 0;

    let summary: string;
    switch (event.event_type) {
      case "features_changed":
        summary = [
          revoked.length ? `Revoked: ${revoked.join(", ")}` : "",
          granted.length ? `Granted: ${granted.join(", ")}` : "",
        ].filter(Boolean).join(" · ");
        break;
      case "client_status_changed":
        summary = `Account status ${esc(before.status)} → ${esc(after.status)}`;
        break;
      case "plan_changed":
        summary = `Plan ${esc(before.plan_name)} → ${esc(after.plan_name)}`;
        break;
      case "subscription_status_changed":
        summary = `Billing ${esc(before.subscription_status)} → ${esc(after.subscription_status)}${
          after.cancel_at_period_end ? " (cancels at period end)" : ""
        }`;
        break;
      case "billing_override_changed":
        summary = after.billing_override_until
          ? `Billing override set until ${fmtDate(after.billing_override_until)}${
            after.billing_override_reason ? ` — ${esc(after.billing_override_reason)}` : ""
          }`
          : "Billing override cleared";
        break;
      default:
        summary = event.event_type;
    }

    const title = EVENT_TITLES[event.event_type] ?? "Client Access Changed";
    const isCritical = event.severity === "critical";

    // ── Recipients ──────────────────────────────────────────────────────
    const { data: adminRoles } = await supabase
      .from("user_roles")
      .select("user_id")
      .eq("role", "agency_admin");
    const adminIds: string[] = (adminRoles ?? []).map((r: { user_id: string }) => r.user_id);

    const { data: superRows } = await supabase
      .from("admin_staff_members")
      .select("user_id")
      .eq("is_super_admin", true)
      .eq("status", "active");
    const superAdminIds: string[] = (superRows ?? [])
      .map((r: { user_id: string | null }) => r.user_id)
      .filter((id: string | null): id is string => !!id && adminIds.includes(id));

    // ── Widget activation / deactivation alert → super admins ───────────
    // One dedicated alert whenever the client's widgets change state:
    //  • billing flip: all widgets went dark (subscription cancelled, override
    //    cleared) or came back (reinstated, override set)
    //  • module flip: specific widget modules were switched off / on
    let widgetAlert: { title: string; message: string; deactivated: boolean } | null = null;
    if (billingFlip) {
      const reason =
        event.event_type === "billing_override_changed"
          ? (after.billing_override_until ? "manual billing override set" : "billing override cleared")
          : `billing ${String(before.subscription_status ?? "—")} → ${String(after.subscription_status ?? "—")}`;
      widgetAlert = widgetsLive
        ? {
          title: `Widgets activated — ${clientName}`,
          message: `All widgets are live again for ${clientName} (${reason}).`,
          deactivated: false,
        }
        : {
          title: `Widgets deactivated — ${clientName}`,
          message: `All widgets are now blocked for ${clientName} (${reason}). Customers see the billing-paused screen.`,
          deactivated: true,
        };
    } else if (moduleFlip) {
      const off = widgetKeysOff.map(featureLabel).join(", ");
      const on = widgetKeysOn.map(featureLabel).join(", ");
      const deactivated = widgetKeysOff.length > 0;
      widgetAlert = {
        title: deactivated
          ? `Widget${widgetKeysOff.length > 1 ? "s" : ""} deactivated — ${clientName}`
          : `Widget${widgetKeysOn.length > 1 ? "s" : ""} activated — ${clientName}`,
        message: [
          off ? `Switched off: ${off}` : "",
          on ? `Switched on: ${on}` : "",
        ].filter(Boolean).join(" · ") + ` (by ${event.source ?? "system"}).`,
        deactivated,
      };
    }

    const widgetAlertRecipients = widgetAlert ? superAdminIds : [];
    const genericRecipients = adminIds.filter((id) => !widgetAlertRecipients.includes(id));

    const baseMetadata = {
      event_id: event.id,
      event_type: event.event_type,
      severity: event.severity,
      client_id: event.client_id,
      revoked_keys: event.revoked_keys,
      granted_keys: event.granted_keys,
      widgets_live: widgetsLive,
      widgets_live_before: widgetsLiveBefore,
      source: event.source,
    };

    // ── In-app notifications ────────────────────────────────────────────
    const notifications: Array<Record<string, unknown>> = [];

    if (widgetAlert) {
      for (const uid of widgetAlertRecipients) {
        notifications.push({
          user_id: uid,
          category: "billing",
          title: `${widgetAlert.deactivated ? "[Action needed] " : ""}${widgetAlert.title}`,
          message: widgetAlert.message,
          metadata: {
            ...baseMetadata,
            kind: "widget_state_change",
            widgets_deactivated: widgetAlert.deactivated,
            widget_keys_off: widgetKeysOff,
            widget_keys_on: widgetKeysOn,
          },
        });
      }
    }

    for (const uid of genericRecipients) {
      notifications.push({
        user_id: uid,
        category: "billing",
        title: `${isCritical ? "[Action needed] " : ""}${title}`,
        message: `${clientName} — ${summary}. Widgets ${widgetsLive ? "live" : "blocked"}.`,
        metadata: baseMetadata,
      });
    }

    if (notifications.length > 0) {
      const { error: notifErr } = await supabase.from("admin_notifications").insert(notifications);
      if (notifErr) throw new Error(`admin_notifications insert failed: ${notifErr.message}`);
    }

    // ── Emails ──────────────────────────────────────────────────────────
    let emailed = 0;
    const canEmail = !!Deno.env.get("RESEND_API_KEY");

    const when = new Date(event.created_at).toLocaleString("en-US", {
      dateStyle: "full", timeStyle: "short", timeZone: "UTC",
    }) + " UTC";

    const commonRows = (): Array<[string, string]> => {
      const rows: Array<[string, string]> = [];
      rows.push(["Account status", esc(client?.status)]);
      rows.push([
        "Billing subscription",
        `${esc(subRow?.status)}${subRow?.cancel_at_period_end ? " (cancels at period end)" : ""}`,
      ]);
      if (client?.billing_override_until && new Date(client.billing_override_until) > new Date()) {
        rows.push(["Billing override", `Active until ${fmtDate(client.billing_override_until)}`]);
      }
      if (limitsChanged(beforeLimits, afterLimits)) {
        rows.push([
          "AI limits (before → after)",
          `Images ${fmtNum(beforeLimits.image_quota)} → ${fmtNum(afterLimits.image_quota)}/mo · ` +
          `Chat ${fmtNum(beforeLimits.chat_quota)} → ${fmtNum(afterLimits.chat_quota)}/mo · ` +
          `Image RPM ${fmtNum(beforeLimits.image_rpm)} → ${fmtNum(afterLimits.image_rpm)}`,
        ]);
      } else {
        rows.push([
          "AI limits",
          `Images ${fmtNum(afterLimits.image_quota)}/mo · Chat ${fmtNum(afterLimits.chat_quota)}/mo (unchanged)`,
        ]);
      }
      rows.push(["Changed by", esc(event.source ?? "system")]);
      rows.push(["When", when]);
      return rows;
    };

    const sendEmail = async (to: string[], subject: string, html: string, emailType: string) => {
      const emailResp = await resend.emails.send({
        from: FROM_EMAIL,
        to,
        subject,
        html,
        reply_to: REPLY_TO,
      });
      emailed += to.length;
      await supabase.from("email_logs").insert({
        recipient_email: to.join(", "),
        email_type: emailType,
        subject,
        status: "sent",
        resend_id: (emailResp as any)?.data?.id ?? null,
        metadata: { event_id: event.id, client_id: event.client_id, severity: event.severity },
      });
    };

    // Widget flip → super admins, both directions.
    if (widgetAlert && canEmail && widgetAlertRecipients.length > 0) {
      const to = billingFlip ? [...BILLING_EMAIL_RECIPIENTS] : await emailsFor(supabase, widgetAlertRecipients);
      if (to.length > 0) {
        const accent = widgetAlert.deactivated ? "#b91c1c" : "#0b6e4f";
        const rows: Array<[string, string]> = [
          ["Client", esc(clientName)],
          ["What changed", esc(summary)],
        ];
        if (billingFlip) {
          rows.push([
            "Widget status",
            widgetsLive
              ? "Activated — customer-facing widgets load again"
              : "Deactivated — widgets show the billing-paused screen",
          ]);
        } else {
          if (widgetKeysOff.length) rows.push(["Widgets switched off", esc(widgetKeysOff.map(featureLabel).join(", "))]);
          if (widgetKeysOn.length) rows.push(["Widgets switched on", esc(widgetKeysOn.map(featureLabel).join(", "))]);
          rows.push(["Billing gate", widgetsLive ? "Live" : "Blocked (subscription cancelled)"]);
        }
        rows.push(...commonRows());

        const html = renderEmail({
          kicker: widgetAlert.deactivated ? "Widgets Deactivated" : "Widgets Activated",
          title: widgetAlert.title,
          intro: esc(widgetAlert.message),
          accent,
          rows,
          clientId: event.client_id,
        });
        await sendEmail(
          to,
          `[Aurezo] ${widgetAlert.title}`,
          html,
          `admin_widget_${widgetAlert.deactivated ? "deactivated" : "activated"}`,
        );
      }
    }

    // Critical events → every other admin (super admins already got the widget
    // email for this event; non-critical events are bell-only as before).
    if (isCritical && canEmail && genericRecipients.length > 0) {
      const isBillingEvent = billingFlip || BILLING_ACCESS_EVENT_TYPES.has(event.event_type);
      const to = isBillingEvent ? [...BILLING_EMAIL_RECIPIENTS] : await emailsFor(supabase, genericRecipients);
      if (to.length > 0) {
        const rows: Array<[string, string]> = [
          ["Client", esc(clientName)],
          ["What changed", esc(summary)],
        ];
        if (revoked.length) rows.push(["Modules revoked", esc(revoked.join(", "))]);
        if (granted.length) rows.push(["Modules granted", esc(granted.join(", "))]);
        rows.push([
          "Widget status",
          widgetsLive
            ? "Live — customer-facing widgets still load"
            : "Blocked — widgets show the billing-paused screen",
        ]);
        rows.push(...commonRows());

        const html = renderEmail({
          kicker: "Access Alert",
          title,
          intro: `${esc(clientName)} just changed state. Review below before the client notices.`,
          accent: "#b91c1c",
          rows,
          clientId: event.client_id,
        });
        await sendEmail(to, `[Aurezo] ${title} — ${clientName}`, html, `admin_access_${event.event_type}`);
      }
    }

    await supabase
      .from("client_access_events")
      .update({
        notified_at: new Date().toISOString(),
        notify_error: null,
        after_state: {
          ...after,
          widgets_live: widgetsLive,
          ...(widgetAlert
            ? {
              widget_alert: {
                deactivated: widgetAlert.deactivated,
                widget_keys_off: widgetKeysOff,
                widget_keys_on: widgetKeysOn,
                super_admins_notified: widgetAlertRecipients.length,
              },
            }
            : {}),
          ai_limits_before: beforeLimits,
          ai_limits_after: afterLimits,
        },
      })
      .eq("id", event.id);

    log("alerted", {
      eventId: event.id,
      type: event.event_type,
      emailed,
      admins: adminIds.length,
      widgetAlert: widgetAlert ? (widgetAlert.deactivated ? "deactivated" : "activated") : null,
      superAdmins: widgetAlertRecipients.length,
    });

    return new Response(
      JSON.stringify({
        success: true,
        emailed,
        in_app: notifications.length,
        widgets_live: widgetsLive,
        widget_alert: widgetAlert ? (widgetAlert.deactivated ? "deactivated" : "activated") : null,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    log("ERROR", { eventId, msg });
    if (eventId) {
      await supabase
        .from("client_access_events")
        .update({ notify_error: msg.slice(0, 500) })
        .eq("id", eventId);
    }
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
