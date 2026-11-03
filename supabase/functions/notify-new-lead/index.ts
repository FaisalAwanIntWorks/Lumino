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

interface LeadNotificationRequest {
  client_id: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  product_name: string;
  configuration: {
    style?: string;
    shank?: string;
    metal?: string;
    shape?: string;
    caratRange?: number;
    stone?: string;
    size?: string;
    engraving?: string;
  };
  notes: string;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const {
      client_id,
      customer_name,
      customer_email,
      customer_phone,
      product_name,
      configuration,
      notes,
    }: LeadNotificationRequest = await req.json();

    if (!client_id || !customer_name || !customer_email) {
      return new Response(
        JSON.stringify({ error: "client_id, customer_name, and customer_email are required" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Get client details
    const { data: client, error: clientError } = await supabase
      .from("clients")
      .select("email, company_name")
      .eq("id", client_id)
      .maybeSingle();

    if (clientError || !client) {
      console.error("Error fetching client:", clientError);
      return new Response(
        JSON.stringify({ error: "Client not found" }),
        { status: 404, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Check notification preferences
    const { data: notifPref } = await supabase
      .from("client_notification_preferences")
      .select("is_enabled")
      .eq("client_id", client_id)
      .eq("notification_type", "new_lead")
      .maybeSingle();

    if (notifPref && notifPref.is_enabled === false) {
      console.log("Client has disabled new_lead notifications, skipping email.");
      return new Response(
        JSON.stringify({ success: true, message: "Notification skipped (disabled by client)" }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Build configuration details
    const configDetails: string[] = [];
    if (configuration.style) configDetails.push(`<tr><td style="padding:6px 0;color:#777;font-size:14px;width:80px;">Style</td><td style="padding:6px 0;color:#1a1a1a;font-size:14px;font-weight:500;">${configuration.style}</td></tr>`);
    if (configuration.shank) configDetails.push(`<tr><td style="padding:6px 0;color:#777;font-size:14px;">Shank</td><td style="padding:6px 0;color:#1a1a1a;font-size:14px;font-weight:500;">${configuration.shank}</td></tr>`);
    if (configuration.metal) configDetails.push(`<tr><td style="padding:6px 0;color:#777;font-size:14px;">Metal</td><td style="padding:6px 0;color:#1a1a1a;font-size:14px;font-weight:500;">${configuration.metal}</td></tr>`);
    if (configuration.shape) configDetails.push(`<tr><td style="padding:6px 0;color:#777;font-size:14px;">Shape</td><td style="padding:6px 0;color:#1a1a1a;font-size:14px;font-weight:500;">${configuration.shape}</td></tr>`);
    if (configuration.caratRange) configDetails.push(`<tr><td style="padding:6px 0;color:#777;font-size:14px;">Carat</td><td style="padding:6px 0;color:#1a1a1a;font-size:14px;font-weight:500;">${configuration.caratRange}ct</td></tr>`);
    if (configuration.stone) configDetails.push(`<tr><td style="padding:6px 0;color:#777;font-size:14px;">Stone</td><td style="padding:6px 0;color:#1a1a1a;font-size:14px;font-weight:500;">${configuration.stone}</td></tr>`);
    if (configuration.size) configDetails.push(`<tr><td style="padding:6px 0;color:#777;font-size:14px;">Size</td><td style="padding:6px 0;color:#1a1a1a;font-size:14px;font-weight:500;">${configuration.size}</td></tr>`);
    if (configuration.engraving) configDetails.push(`<tr><td style="padding:6px 0;color:#777;font-size:14px;">Personalized Inscription</td><td style="padding:6px 0;color:#1a1a1a;font-size:14px;font-weight:500;">"${configuration.engraving}"</td></tr>`);

    const configTableRows = configDetails.length > 0 
      ? configDetails.join('')
      : '<tr><td style="padding:6px 0;color:#777;font-size:14px;" colspan="2">Custom configuration saved</td></tr>';

    const currentDate = new Date().toLocaleDateString('en-US', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });

    const emailHtml = `
<!DOCTYPE html>
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
      <td align="center" style="padding:40px 20px;">
        <table role="presentation" style="width:100%;max-width:560px;border-collapse:collapse;background-color:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
          <!-- Header -->
          <tr>
            <td class="email-header" style="padding:32px 40px 24px;text-align:center;background-color:#000000;">
              <img src="https://vault.jewlx.ai/images/jewelx-email-logo.png" alt="JewlX" style="height:56px;" />
            </td>
          </tr>
          <!-- Content -->
          <tr>
            <td style="padding:40px;">
              <h2 style="margin:0 0 8px;color:#1a1a1a;font-size:22px;font-weight:600;">New Lead Received</h2>
              <p style="margin:0 0 24px;color:#777;font-size:13px;">${currentDate}</p>
              <!-- Customer Info -->
              <div style="background-color:#f9f9f9;border:1px solid #eee;border-radius:6px;padding:20px;margin-bottom:20px;">
                <p style="margin:0 0 12px;color:#1a1a1a;font-size:13px;font-weight:600;text-transform:uppercase;">Customer Information</p>
                <table style="width:100%;border-collapse:collapse;">
                  <tr><td style="padding:6px 0;color:#777;font-size:14px;width:80px;">Name</td><td style="padding:6px 0;color:#1a1a1a;font-size:14px;font-weight:600;">${customer_name}</td></tr>
                  <tr><td style="padding:6px 0;color:#777;font-size:14px;">Email</td><td style="padding:6px 0;"><a href="mailto:${customer_email}" style="color:#0b6e4f;text-decoration:none;font-size:14px;">${customer_email}</a></td></tr>
                  <tr><td style="padding:6px 0;color:#777;font-size:14px;">Phone</td><td style="padding:6px 0;color:#1a1a1a;font-size:14px;">${customer_phone || 'Not provided'}</td></tr>
                </table>
              </div>
              <!-- Design Details -->
              <div style="background-color:#f9f9f9;border:1px solid #eee;border-radius:6px;padding:20px;margin-bottom:20px;">
                <p style="margin:0 0 12px;color:#1a1a1a;font-size:13px;font-weight:600;text-transform:uppercase;">Ring Design — ${product_name}</p>
                <table style="width:100%;border-collapse:collapse;">${configTableRows}</table>
              </div>
              ${notes ? `
              <div style="background-color:#f9f9f9;border:1px solid #eee;border-radius:6px;padding:20px;margin-bottom:20px;">
                <p style="margin:0 0 8px;color:#1a1a1a;font-size:13px;font-weight:600;text-transform:uppercase;">Customer Notes</p>
                <p style="margin:0;color:#555;font-size:14px;line-height:1.6;font-style:italic;">"${notes}"</p>
              </div>` : ''}
              <!-- Button -->
              <table role="presentation" style="width:100%;border-collapse:collapse;">
                <tr>
                  <td align="center" style="padding:16px 0;">
                    <a href="https://vault.jewlx.ai/saved-designs" style="display:inline-block;padding:12px 24px;background-color:#0b6e4f;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;border-radius:6px;">
                      View All Leads
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin:16px 0 0;color:#777;font-size:13px;text-align:center;">Respond quickly to increase your conversion rate.</p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:24px 40px;background-color:#fafafa;border-top:1px solid #eee;">
              <p style="margin:0;color:#999;font-size:12px;text-align:center;">
                This is an automated notification from JewlX.<br>&copy; ${new Date().getFullYear()} JewlX. All rights reserved.<br>
                <a href="https://vault.jewlx.ai" style="color:#0b6e4f;text-decoration:none;font-weight:600;">vault.jewlx.ai</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `;

    // Owner + opted-in staff + extra notification emails, de-duplicated.
    const recipients = await getLeadNotificationRecipients(supabase, client_id, client.email);
    if (!recipients.to) {
      console.log("No lead notification recipients, skipping email.");
      return new Response(
        JSON.stringify({ success: true, message: "Notification skipped (no recipients)" }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const emailResponse = await resend.emails.send({
      from: FROM_EMAIL,
      to: [recipients.to],
      ...(recipients.bcc.length > 0 ? { bcc: recipients.bcc } : {}),
      subject: `🎉 New Lead: ${customer_name} saved a ring design!`,
      html: emailHtml,
      reply_to: REPLY_TO,
    });

    console.log("Lead notification email sent:", emailResponse);

    await supabase.from("email_logs").insert(recipients.all.map((recipient) => ({
      recipient_email: recipient,
      email_type: "lead_notification",
      subject: `New Lead: ${customer_name} saved a ring design!`,
      status: "sent",
      resend_id: emailResponse.data?.id,
      metadata: { client_id, customer_name, customer_email, product_name },
    })));

    return new Response(
      JSON.stringify({ success: true, message: "Lead notification sent to client" }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: any) {
    console.error("Error in notify-new-lead:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Failed to send lead notification" }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);