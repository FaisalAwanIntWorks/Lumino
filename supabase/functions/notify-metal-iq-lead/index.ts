import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getLeadNotificationRecipients } from "../_shared/lead-notification-recipients.ts";

const Resend = (await import("https://esm.sh/resend@2.0.0")).Resend;
const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const FROM_EMAIL = "JewlX <onboarding@resend.dev>";
const REPLY_TO = Deno.env.get("SUPPORT_EMAIL") || undefined;

interface MetalIQLeadRequest {
  client_id: string;
  lead_id?: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  location?: string;
  metal_type: string;
  karat?: string;
  weight_grams?: number;
  knows_karat: boolean;
  knows_weight: boolean;
  knows_authentic: boolean;
  is_authentic?: boolean;
  estimated_offer?: number;
  competitor_offer?: number;
  estimated_profit?: number;
  spot_price_at_time?: number;
  spot_price_date?: string;
  buy_percentage?: number;
  lead_score: string;
  photo_urls?: string[];
}

function fmtNum(n: number): string {
  const [intPart, decPart] = n.toString().split(".");
  const withCommas = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return decPart ? `${withCommas}.${decPart}` : withCommas;
}

function esc(s: string | undefined | null): string {
  if (!s) return "";
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body: MetalIQLeadRequest = await req.json();

    if (!body.client_id || !body.customer_name || !body.customer_email || !body.metal_type) {
      return new Response(
        JSON.stringify({ error: "client_id, customer_name, customer_email, and metal_type are required" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const { data: client, error: clientError } = await supabase
      .from("clients")
      .select("email, company_name")
      .eq("id", body.client_id)
      .maybeSingle();

    if (clientError || !client) {
      return new Response(
        JSON.stringify({ error: "Client not found" }),
        { status: 404, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Check notification preferences
    const { data: notifPref } = await supabase
      .from("client_notification_preferences")
      .select("is_enabled")
      .eq("client_id", body.client_id)
      .eq("notification_type", "new_lead")
      .maybeSingle();

    if (notifPref && notifPref.is_enabled === false) {
      return new Response(
        JSON.stringify({ success: true, message: "Notification skipped (disabled by client)" }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const currentDate = new Date().toLocaleDateString("en-US", {
      weekday: "long", year: "numeric", month: "long", day: "numeric",
      hour: "2-digit", minute: "2-digit",
    });

    const metalLabel = body.metal_type.charAt(0).toUpperCase() + body.metal_type.slice(1);

    const scoreColors: Record<string, { bg: string; color: string; label: string }> = {
      hot: { bg: "#fef2f2", color: "#dc2626", label: "🔥 Hot Lead" },
      warm: { bg: "#fff7ed", color: "#ea580c", label: "🌡️ Warm Lead" },
      cold: { bg: "#eff6ff", color: "#2563eb", label: "❄️ Cold Lead" },
      suspect: { bg: "#f9fafb", color: "#6b7280", label: "⚠️ Suspect" },
    };
    const score = scoreColors[body.lead_score] || scoreColors.cold;

    // Build metal details rows
    let metalRows = `
      <tr><td style="padding:5px 0;color:#777;font-size:13px;width:100px;">Metal</td><td style="padding:5px 0;color:#1a1a1a;font-size:13px;font-weight:600;">${esc(metalLabel)}</td></tr>
      <tr><td style="padding:5px 0;color:#777;font-size:13px;">Karat/Purity</td><td style="padding:5px 0;color:#1a1a1a;font-size:13px;">${body.knows_karat && body.karat ? esc(body.karat) : '<span style="color:#ea580c;font-style:italic;">Unknown</span>'}</td></tr>
      <tr><td style="padding:5px 0;color:#777;font-size:13px;">Weight</td><td style="padding:5px 0;color:#1a1a1a;font-size:13px;">${body.knows_weight && body.weight_grams ? body.weight_grams + 'g' : '<span style="color:#ea580c;font-style:italic;">Unknown</span>'}</td></tr>
      <tr><td style="padding:5px 0;color:#777;font-size:13px;">Authenticity</td><td style="padding:5px 0;color:#1a1a1a;font-size:13px;">${body.knows_authentic ? (body.is_authentic ? '✅ Verified' : '❌ Not Authentic') : '<span style="color:#ea580c;font-style:italic;">Unsure</span>'}</td></tr>
    `;

    // Build quote section
    let quoteSection = "";
    if (body.estimated_offer != null && body.spot_price_at_time != null) {
      quoteSection = `
        <div style="padding:16px;background-color:#f9f9f9;border-radius:6px;border:1px solid #eee;margin-bottom:16px;">
          <p style="margin:0 0 10px;color:#1a1a1a;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Quote Breakdown</p>
          <table style="width:100%;border-collapse:collapse;">
            <tr><td style="padding:5px 0;color:#777;font-size:13px;width:120px;">Spot Price</td><td style="padding:5px 0;color:#1a1a1a;font-size:13px;font-weight:600;">$${fmtNum(body.spot_price_at_time)}/oz</td></tr>
            ${body.buy_percentage != null ? `<tr><td style="padding:5px 0;color:#777;font-size:13px;">Buy Rate</td><td style="padding:5px 0;color:#1a1a1a;font-size:13px;">${body.buy_percentage}%</td></tr>` : ''}
            <tr><td style="padding:5px 0;color:#777;font-size:13px;">Your Offer</td><td style="padding:5px 0;color:#0b6e4f;font-size:15px;font-weight:700;">$${body.estimated_offer.toFixed(2)}</td></tr>
            ${body.competitor_offer != null ? `<tr><td style="padding:5px 0;color:#777;font-size:13px;">Competitor Offer</td><td style="padding:5px 0;color:#777;font-size:13px;">$${body.competitor_offer.toFixed(2)}</td></tr>` : ''}
            ${body.estimated_profit != null ? `<tr><td style="padding:5px 0;color:#777;font-size:13px;">Est. Profit</td><td style="padding:5px 0;color:#16a34a;font-size:15px;font-weight:700;">$${body.estimated_profit.toFixed(2)}</td></tr>` : ''}
          </table>
        </div>
      `;
    }

    // Photos section
    let photosSection = "";
    if (body.photo_urls && body.photo_urls.length > 0) {
      const thumbs = body.photo_urls.map(
        (url) => `<a href="${esc(url)}" target="_blank" style="display:inline-block;margin:0 6px 6px 0;"><img src="${esc(url)}" alt="Item photo" style="width:80px;height:80px;object-fit:cover;border-radius:6px;border:1px solid #eee;" /></a>`
      ).join("");
      photosSection = `
        <div style="padding:16px;background-color:#f9f9f9;border-radius:6px;border:1px solid #eee;margin-bottom:16px;">
          <p style="margin:0 0 10px;color:#1a1a1a;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Photos (${body.photo_urls.length})</p>
          ${thumbs}
        </div>
      `;
    }

    const emailHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light only">
  <meta name="supported-color-schemes" content="light only">
  <style>
    :root { color-scheme: light only; }
    @media (prefers-color-scheme: dark) {
      .email-header { background-color: #000000 !important; }
      .email-wrapper { background-color: #f5f5f5 !important; }
      .email-card { background-color: #ffffff !important; }
    }
    [data-ogsc] .email-header { background-color: #000000 !important; }
  </style>
</head>
<body style="margin:0;padding:0;background-color:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
  <table role="presentation" style="width:100%;border-collapse:collapse;">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" style="width:100%;max-width:640px;border-collapse:collapse;background-color:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
          <tr>
            <td class="email-header" style="padding:28px 32px 20px;text-align:center;background-color:#000000;">
              <img src="https://vault.jewlx.ai/images/jewelx-email-logo.png" alt="JewlX" style="height:56px;" />
            </td>
          </tr>
          <tr>
            <td style="padding:28px 32px 32px;">
              <!-- Score badge -->
              <table role="presentation" style="margin-bottom:16px;"><tr><td style="padding:4px 14px;border-radius:20px;font-size:12px;font-weight:600;background-color:${score.bg};color:${score.color};">${score.label}</td></tr></table>

              <h2 style="margin:0 0 4px;color:#1a1a1a;font-size:20px;font-weight:700;">New Metal IQ Lead</h2>
              <p style="margin:0 0 20px;color:#999;font-size:12px;">${currentDate}</p>
              <p style="margin:0 0 20px;color:#555;font-size:14px;line-height:1.5;">
                A customer just submitted a ${metalLabel.toLowerCase()} buying estimate on your Metal IQ widget.
              </p>

              <!-- Customer -->
              <div style="padding:16px;background-color:#f9f9f9;border-radius:6px;border:1px solid #eee;margin-bottom:16px;">
                <p style="margin:0 0 10px;color:#1a1a1a;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Customer</p>
                <table style="width:100%;border-collapse:collapse;">
                  <tr><td style="padding:5px 0;color:#777;font-size:13px;width:70px;">Name</td><td style="padding:5px 0;color:#1a1a1a;font-size:13px;font-weight:600;">${esc(body.customer_name)}</td></tr>
                  <tr><td style="padding:5px 0;color:#777;font-size:13px;">Email</td><td style="padding:5px 0;"><a href="mailto:${esc(body.customer_email)}" style="color:#0b6e4f;text-decoration:none;font-size:13px;">${esc(body.customer_email)}</a></td></tr>
                  <tr><td style="padding:5px 0;color:#777;font-size:13px;">Phone</td><td style="padding:5px 0;color:#1a1a1a;font-size:13px;">${esc(body.customer_phone) || 'Not provided'}</td></tr>
                  ${body.location ? `<tr><td style="padding:5px 0;color:#777;font-size:13px;">Location</td><td style="padding:5px 0;color:#1a1a1a;font-size:13px;">${esc(body.location)}</td></tr>` : ''}
                </table>
              </div>

              <!-- Metal Details -->
              <div style="padding:16px;background-color:#f9f9f9;border-radius:6px;border:1px solid #eee;margin-bottom:16px;">
                <p style="margin:0 0 10px;color:#1a1a1a;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Metal Details</p>
                <table style="width:100%;border-collapse:collapse;">${metalRows}</table>
              </div>

              ${quoteSection}
              ${photosSection}

              <!-- CTA -->
              <table role="presentation" style="width:100%;border-collapse:collapse;">
                <tr>
                  <td align="center" style="padding:8px 0;">
                    <a href="https://vault.jewlx.ai/dashboard/metal-buying-leads" style="display:inline-block;padding:12px 28px;background-color:#0b6e4f;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;border-radius:6px;">
                      View Lead Details
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 32px;background-color:#fafafa;border-top:1px solid #eee;">
              <p style="margin:0;color:#999;font-size:11px;text-align:center;">
                This is an automated email generated by the system. Please do not reply to this email.<br>&copy; ${new Date().getFullYear()} JewlX. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    const subject = `New Metal IQ Lead: ${body.customer_name} — ${metalLabel}`;

    // Owner + opted-in staff + extra notification emails, de-duplicated.
    const recipients = await getLeadNotificationRecipients(supabase, body.client_id, client.email);
    if (!recipients.to) {
      return new Response(
        JSON.stringify({ success: true, message: "Notification skipped (no recipients)" }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const emailResponse = await resend.emails.send({
      from: FROM_EMAIL,
      to: [recipients.to],
      ...(recipients.bcc.length > 0 ? { bcc: recipients.bcc } : {}),
      subject,
      html: emailHtml,
      reply_to: REPLY_TO,
    });

    console.log("Metal IQ lead notification email sent:", emailResponse);

    await supabase.from("email_logs").insert(recipients.all.map((recipient) => ({
      recipient_email: recipient,
      email_type: "metal_iq_lead_notification",
      subject,
      status: "sent",
      resend_id: emailResponse.data?.id,
      metadata: { client_id: body.client_id, lead_id: body.lead_id || null, customer_name: body.customer_name, customer_email: body.customer_email, metal_type: body.metal_type, lead_score: body.lead_score },
    })));

    return new Response(
      JSON.stringify({ success: true, message: "Metal IQ lead notification sent" }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: any) {
    console.error("Error in notify-metal-iq-lead:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Failed to send notification" }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
