import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { BILLING_EMAIL_RECIPIENTS } from "../_shared/billing-email-recipients.ts";

const Resend = (await import("npm:resend@2.0.0")).Resend;
const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const FROM_EMAIL = "JewlX <onboarding@resend.dev>";
const REPLY_TO = Deno.env.get("SUPPORT_EMAIL") || undefined;

type EventType =
  | "subscription_started"
  | "subscription_renewed"
  | "subscription_canceled"
  | "credits_purchased"
  | "cad_addon_purchased"
  | "payment_failed"
  | "refund"
  | "dispute"
  | "access_paused"
  | "access_restored";

const EVENT_LABELS: Record<EventType, { title: string; subject: string; tone: "success" | "warning" | "danger" }> = {
  subscription_started:  { title: "New Subscription Started",     subject: "New subscription started",     tone: "success" },
  subscription_renewed:  { title: "Subscription Renewed",         subject: "Subscription renewed",         tone: "success" },
  subscription_canceled: { title: "Subscription Canceled",        subject: "Subscription canceled",        tone: "warning" },
  credits_purchased:     { title: "Credits Purchased",            subject: "Credits purchased",            tone: "success" },
  cad_addon_purchased:   { title: "CAD Add-on Purchased",         subject: "CAD add-on purchased",         tone: "success" },
  payment_failed:        { title: "Subscription Payment Failed",  subject: "Subscription payment failed",  tone: "danger"  },
  refund:                { title: "Charge Refunded",              subject: "Charge refunded",              tone: "warning" },
  dispute:               { title: "Dispute Opened",               subject: "Dispute opened",               tone: "danger"  },
  access_paused:         { title: "Client Widget Access Paused",  subject: "Client widget access paused (grace period elapsed)", tone: "danger"  },
  access_restored:       { title: "Client Widget Access Restored",subject: "Client widget access restored (payment received)",   tone: "success" },
};

interface BillingEventRequest {
  event_type: EventType;
  stripe_event_id?: string;
  stripe_object_id: string;
  client_id?: string | null;
  client_company?: string | null;
  client_email?: string | null;
  amount_cents?: number | null;
  currency?: string | null;
  plan_name?: string | null;
  pack_label?: string | null;
  addon_label?: string | null;
  stripe_session_id?: string | null;
  stripe_subscription_id?: string | null;
  stripe_invoice_id?: string | null;
  stripe_charge_id?: string | null;
  occurred_at?: string | null;
  notes?: string | null;
}

const fmtMoney = (cents: number | null | undefined, currency = "usd") => {
  if (cents == null) return "—";
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: currency.toUpperCase() }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency.toUpperCase()}`;
  }
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } }
    );

    const body = (await req.json()) as BillingEventRequest;

    if (!body.event_type || !EVENT_LABELS[body.event_type]) {
      return new Response(JSON.stringify({ error: "invalid event_type" }), {
        status: 400, headers: { "Content-Type": "application/json", ...corsHeaders }
      });
    }
    if (!body.stripe_object_id) {
      return new Response(JSON.stringify({ error: "stripe_object_id required" }), {
        status: 400, headers: { "Content-Type": "application/json", ...corsHeaders }
      });
    }

    // ── Idempotency: insert into admin_billing_events; if already exists, skip ─
    const { data: inserted, error: insertErr } = await supabase
      .from("admin_billing_events")
      .insert({
        event_type: body.event_type,
        stripe_event_id: body.stripe_event_id ?? null,
        stripe_object_id: body.stripe_object_id,
        client_id: body.client_id ?? null,
        amount_cents: body.amount_cents ?? null,
        currency: body.currency ?? "usd",
        metadata: {
          plan_name: body.plan_name ?? null,
          pack_label: body.pack_label ?? null,
          addon_label: body.addon_label ?? null,
          client_email: body.client_email ?? null,
          client_company: body.client_company ?? null,
          stripe_session_id: body.stripe_session_id ?? null,
          stripe_subscription_id: body.stripe_subscription_id ?? null,
          stripe_invoice_id: body.stripe_invoice_id ?? null,
          stripe_charge_id: body.stripe_charge_id ?? null,
          notes: body.notes ?? null,
        },
      })
      .select("id")
      .maybeSingle();

    if (insertErr) {
      // Unique violation = already notified for this event/object
      if ((insertErr as any).code === "23505") {
        return new Response(JSON.stringify({ success: true, skipped: "already_notified" }), {
          status: 200, headers: { "Content-Type": "application/json", ...corsHeaders }
        });
      }
      throw insertErr;
    }
    if (!inserted) {
      return new Response(JSON.stringify({ success: true, skipped: "already_notified" }), {
        status: 200, headers: { "Content-Type": "application/json", ...corsHeaders }
      });
    }

    // ── In-app admin notifications ───────────────────────────────────────
    const { data: adminRoles } = await supabase
      .from("user_roles")
      .select("user_id")
      .eq("role", "agency_admin");

    const adminIds: string[] = (adminRoles ?? []).map((r: any) => r.user_id);

    if (adminIds.length > 0) {
      const label = EVENT_LABELS[body.event_type];
      const amount = fmtMoney(body.amount_cents, body.currency ?? "usd");
      const detail =
        body.event_type === "cad_addon_purchased" ? body.addon_label ?? "CAD add-on" :
        body.event_type === "credits_purchased"   ? body.pack_label  ?? "credit pack" :
        body.event_type.startsWith("subscription") ? body.plan_name  ?? "subscription" :
        "billing event";

      const inAppRows = adminIds.map((uid) => ({
        user_id: uid,
        category: "billing",
        title: label.title,
        message: `${body.client_company ?? body.client_email ?? "A client"} — ${detail} (${amount})`,
        metadata: {
          event_type: body.event_type,
          client_id: body.client_id,
          stripe_session_id: body.stripe_session_id,
          stripe_subscription_id: body.stripe_subscription_id,
          stripe_invoice_id: body.stripe_invoice_id,
          stripe_charge_id: body.stripe_charge_id,
          amount_cents: body.amount_cents,
        },
      }));
      await supabase.from("admin_notifications").insert(inAppRows);
    }

    // ── Email admins ─────────────────────────────────────────────────────
    const adminEmails: string[] = [...BILLING_EMAIL_RECIPIENTS];

    if (adminEmails.length === 0) {
      return new Response(JSON.stringify({ success: true, in_app_only: true }), {
        status: 200, headers: { "Content-Type": "application/json", ...corsHeaders }
      });
    }

    const label = EVENT_LABELS[body.event_type];
    const amount = fmtMoney(body.amount_cents, body.currency ?? "usd");
    const occurred = body.occurred_at
      ? new Date(body.occurred_at).toLocaleString("en-US", { dateStyle: "full", timeStyle: "short", timeZone: "UTC" }) + " UTC"
      : new Date().toLocaleString("en-US", { dateStyle: "full", timeStyle: "short", timeZone: "UTC" }) + " UTC";

    const accent =
      label.tone === "success" ? "#0b6e4f" :
      label.tone === "warning" ? "#b45309" :
      "#b91c1c";

    const adminUrl = body.client_id
      ? `https://admin.jewlx.ai/admin/sub-accounts/${body.client_id}`
      : `https://admin.jewlx.ai/admin/revenue-usage`;

    const rows: Array<[string, string]> = [];
    if (body.client_company) rows.push(["Company", body.client_company]);
    if (body.client_email)   rows.push(["Email",   body.client_email]);
    rows.push(["Amount",     amount]);
    if (body.plan_name)      rows.push(["Plan",    body.plan_name]);
    if (body.pack_label)     rows.push(["Pack",    body.pack_label]);
    if (body.addon_label)    rows.push(["Add-on",  body.addon_label]);
    rows.push(["When",       occurred]);
    if (body.stripe_session_id)      rows.push(["Stripe Session",      body.stripe_session_id]);
    if (body.stripe_subscription_id) rows.push(["Stripe Subscription", body.stripe_subscription_id]);
    if (body.stripe_invoice_id)      rows.push(["Stripe Invoice",      body.stripe_invoice_id]);
    if (body.stripe_charge_id)       rows.push(["Stripe Charge",       body.stripe_charge_id]);
    if (body.notes)                  rows.push(["Notes",                body.notes]);

    // Stacked layout: label on its own line above the value. This renders
    // cleanly on narrow mobile viewports (no squeezed 2-column table that
    // forces long emails/IDs to wrap character-by-character vertically).
    const detailsHtml = rows
      .map(([k, v], i) => `<div style="padding:10px 0;${i === 0 ? "" : "border-top:1px solid #eee;"}">
        <div style="color:#777;font-size:12px;font-weight:600;letter-spacing:0.4px;text-transform:uppercase;margin-bottom:4px;">${k}</div>
        <div style="color:#1a1a1a;font-size:15px;line-height:1.5;word-break:break-word;overflow-wrap:anywhere;">${v}</div>
      </div>`)
      .join("");

    const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light only">
<style>:root{color-scheme:light only;}@media(prefers-color-scheme:dark){.eh{background-color:#000000!important;}}[data-ogsc] .eh{background-color:#000000!important;}
@media only screen and (max-width:600px){.eb-pad{padding:24px 20px 4px!important;}.eb-pad2{padding:0 20px!important;}.eb-foot{padding:20px!important;}.eb-head{padding:24px 20px 20px!important;}}</style></head>
<body style="margin:0;padding:0;background-color:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
<table role="presentation" style="width:100%;border-collapse:collapse;"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" style="width:100%;max-width:600px;border-collapse:collapse;background-color:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
  <tr><td class="eh eb-head" style="padding:32px 40px 24px;text-align:center;background-color:#000000;">
    <img src="https://vault.jewlx.ai/images/jewelx-email-logo.png" alt="JewlX" style="height:56px;" />
  </td></tr>
  <tr><td class="eb-pad" style="padding:36px 40px 8px;">
    <p style="margin:0 0 6px;color:${accent};font-size:12px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;">Billing Event</p>
    <h2 style="margin:0 0 12px;color:#1a1a1a;font-size:22px;font-weight:600;line-height:1.3;">${label.title}</h2>
    <p style="margin:0 0 24px;color:#555;font-size:15px;line-height:1.6;">A new billing event was recorded on the JewlX platform.</p>
  </td></tr>
  <tr><td class="eb-pad2" style="padding:0 40px;">
    <div style="background-color:#f9f9f9;border:1px solid #eee;border-radius:6px;padding:16px 20px;margin-bottom:24px;">
      <p style="margin:0 0 8px;color:#1a1a1a;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Details</p>
      ${detailsHtml}
    </div>
    <table role="presentation" style="width:100%;border-collapse:collapse;"><tr><td align="center" style="padding:8px 0 24px;">
      <a href="${adminUrl}" style="display:inline-block;padding:12px 24px;background-color:${accent};color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;border-radius:6px;">Open in Admin</a>
    </td></tr></table>
  </td></tr>
  <tr><td class="eb-foot" style="padding:24px 40px;background-color:#fafafa;border-top:1px solid #eee;">
    <p style="margin:0;color:#999;font-size:12px;text-align:center;">&copy; ${new Date().getFullYear()} JewlX Admin Notification<br>
      <a href="https://admin.jewlx.ai" style="color:#0b6e4f;text-decoration:none;font-weight:600;">admin.jewlx.ai</a>
    </p>
  </td></tr>
</table>
</td></tr></table></body></html>`;

    const subject = `[JewlX] ${label.subject} — ${body.client_company ?? body.client_email ?? "client"} (${amount})`;

    const emailResp = await resend.emails.send({
      from: FROM_EMAIL,
      to: adminEmails,
      subject,
      html,
      reply_to: REPLY_TO,
    });

    await supabase.from("email_logs").insert({
      recipient_email: adminEmails.join(", "),
      email_type: `admin_billing_${body.event_type}`,
      subject,
      status: "sent",
      resend_id: (emailResp as any)?.data?.id ?? null,
      metadata: {
        event_type: body.event_type,
        stripe_object_id: body.stripe_object_id,
        client_id: body.client_id,
        amount_cents: body.amount_cents,
        notified_admins: adminEmails,
      },
    });

    return new Response(JSON.stringify({ success: true, notified: adminEmails.length }), {
      status: 200, headers: { "Content-Type": "application/json", ...corsHeaders }
    });
  } catch (e: any) {
    console.error("[notify-admins-billing-event] error:", e?.message ?? e);
    return new Response(JSON.stringify({ error: "Failed to send billing notification" }), {
      status: 500, headers: { "Content-Type": "application/json", ...corsHeaders }
    });
  }
});
