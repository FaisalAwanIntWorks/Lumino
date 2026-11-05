import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const Resend = (await import("https://esm.sh/resend@2.0.0")).Resend;

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const FROM_EMAIL = "Aurezo <onboarding@resend.dev>";
const REPLY_TO = Deno.env.get("SUPPORT_EMAIL") || undefined;

interface LeadDeletedRequest {
  client_id: string;
  staff_name: string;
  staff_email: string;
  deleted_lead: {
    customer_name: string;
    customer_email: string;
    customer_phone: string | null;
    product_name: string | null;
    follow_up_status: string;
    created_at: string;
    notes: string | null;
    configuration: any;
  };
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { client_id, staff_name, staff_email, deleted_lead }: LeadDeletedRequest = await req.json();

    if (!client_id || !staff_name || !staff_email || !deleted_lead) {
      return new Response(
        JSON.stringify({ error: "client_id, staff_name, staff_email, and deleted_lead are required" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const { data: client, error: clientError } = await supabase
      .from("clients")
      .select("email, company_name")
      .eq("id", client_id)
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
      .eq("client_id", client_id)
      .eq("notification_type", "lead_deleted")
      .maybeSingle();

    if (notifPref && notifPref.is_enabled === false) {
      return new Response(
        JSON.stringify({ success: true, message: "Notification skipped (disabled by client)" }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const config = deleted_lead.configuration || {};
    const configRows: string[] = [];
    if (config.style) configRows.push(`<tr><td style="padding:6px 0;color:#777;font-size:14px;width:80px;">Style</td><td style="padding:6px 0;color:#1a1a1a;font-size:14px;">${config.style}</td></tr>`);
    if (config.shank) configRows.push(`<tr><td style="padding:6px 0;color:#777;font-size:14px;">Shank</td><td style="padding:6px 0;color:#1a1a1a;font-size:14px;">${config.shank}</td></tr>`);
    if (config.metal) configRows.push(`<tr><td style="padding:6px 0;color:#777;font-size:14px;">Metal</td><td style="padding:6px 0;color:#1a1a1a;font-size:14px;">${config.metal}</td></tr>`);
    if (config.shape) configRows.push(`<tr><td style="padding:6px 0;color:#777;font-size:14px;">Shape</td><td style="padding:6px 0;color:#1a1a1a;font-size:14px;">${config.shape}</td></tr>`);
    if (config.caratRange) configRows.push(`<tr><td style="padding:6px 0;color:#777;font-size:14px;">Carat</td><td style="padding:6px 0;color:#1a1a1a;font-size:14px;">${config.caratRange}ct</td></tr>`);
    if (config.stone) configRows.push(`<tr><td style="padding:6px 0;color:#777;font-size:14px;">Stone</td><td style="padding:6px 0;color:#1a1a1a;font-size:14px;">${config.stone}</td></tr>`);
    if (config.size) configRows.push(`<tr><td style="padding:6px 0;color:#777;font-size:14px;">Size</td><td style="padding:6px 0;color:#1a1a1a;font-size:14px;">${config.size}</td></tr>`);

    const deletedAt = new Date().toLocaleDateString('en-US', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit',
    });
    const leadCreatedAt = new Date(deleted_lead.created_at).toLocaleDateString('en-US', {
      year: 'numeric', month: 'long', day: 'numeric',
    });

    const emailHtml = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light only"><style>:root{color-scheme:light only;}@media(prefers-color-scheme:dark){.eh{background-color:#000000!important;}}[data-ogsc] .eh{background-color:#000000!important;}</style></head>
<body style="margin:0;padding:0;background-color:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
  <table role="presentation" style="width:100%;border-collapse:collapse;">
    <tr><td align="center" style="padding:40px 20px;">
      <table role="presentation" style="width:100%;max-width:560px;border-collapse:collapse;background-color:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
        <!-- Header -->
        <tr><td class="eh" style="padding:32px 40px 24px;text-align:center;background-color:#000000;">
          <img src="https://studio.aurezotech.com/images/aurezo-email-logo.png" alt="Aurezo" style="height:56px;" />
        </td></tr>
        <!-- Content -->
        <tr><td style="padding:40px;">
          <h2 style="margin:0 0 8px;color:#1a1a1a;font-size:22px;font-weight:600;">Lead Deleted</h2>
          <p style="margin:0 0 24px;color:#777;font-size:13px;">${deletedAt}</p>
          <!-- Action By -->
          <div style="background-color:#f9f9f9;border:1px solid #eee;border-radius:6px;padding:20px;margin-bottom:20px;">
            <p style="margin:0 0 12px;color:#1a1a1a;font-size:13px;font-weight:600;text-transform:uppercase;">Action Taken By</p>
            <table style="width:100%;border-collapse:collapse;">
              <tr><td style="padding:6px 0;color:#777;font-size:14px;width:100px;">Staff Name</td><td style="padding:6px 0;color:#1a1a1a;font-size:14px;font-weight:600;">${staff_name}</td></tr>
              <tr><td style="padding:6px 0;color:#777;font-size:14px;">Staff Email</td><td style="padding:6px 0;"><a href="mailto:${staff_email}" style="color:#0b6e4f;text-decoration:none;font-size:14px;">${staff_email}</a></td></tr>
            </table>
          </div>
          <!-- Deleted Customer -->
          <div style="background-color:#f9f9f9;border:1px solid #eee;border-radius:6px;padding:20px;margin-bottom:20px;">
            <p style="margin:0 0 12px;color:#1a1a1a;font-size:13px;font-weight:600;text-transform:uppercase;">Deleted Customer Information</p>
            <table style="width:100%;border-collapse:collapse;">
              <tr><td style="padding:6px 0;color:#777;font-size:14px;width:80px;">Name</td><td style="padding:6px 0;color:#1a1a1a;font-size:14px;font-weight:600;">${deleted_lead.customer_name}</td></tr>
              <tr><td style="padding:6px 0;color:#777;font-size:14px;">Email</td><td style="padding:6px 0;color:#1a1a1a;font-size:14px;">${deleted_lead.customer_email}</td></tr>
              <tr><td style="padding:6px 0;color:#777;font-size:14px;">Phone</td><td style="padding:6px 0;color:#1a1a1a;font-size:14px;">${deleted_lead.customer_phone || 'Not provided'}</td></tr>
              <tr><td style="padding:6px 0;color:#777;font-size:14px;">Status</td><td style="padding:6px 0;color:#1a1a1a;font-size:14px;">${deleted_lead.follow_up_status}</td></tr>
              <tr><td style="padding:6px 0;color:#777;font-size:14px;">Created</td><td style="padding:6px 0;color:#1a1a1a;font-size:14px;">${leadCreatedAt}</td></tr>
            </table>
          </div>
          ${configRows.length > 0 ? `
          <div style="background-color:#f9f9f9;border:1px solid #eee;border-radius:6px;padding:20px;margin-bottom:20px;">
            <p style="margin:0 0 12px;color:#1a1a1a;font-size:13px;font-weight:600;text-transform:uppercase;">Design — ${deleted_lead.product_name || 'Custom Ring'}</p>
            <table style="width:100%;border-collapse:collapse;">${configRows.join('')}</table>
          </div>` : ''}
          ${deleted_lead.notes ? `
          <div style="background-color:#f9f9f9;border:1px solid #eee;border-radius:6px;padding:20px;margin-bottom:20px;">
            <p style="margin:0 0 8px;color:#1a1a1a;font-size:13px;font-weight:600;text-transform:uppercase;">Customer Notes</p>
            <p style="margin:0;color:#555;font-size:14px;font-style:italic;">"${deleted_lead.notes}"</p>
          </div>` : ''}
          <!-- Button -->
          <table role="presentation" style="width:100%;border-collapse:collapse;">
            <tr><td align="center" style="padding:16px 0;">
              <a href="https://studio.aurezotech.com/saved-designs" style="display:inline-block;padding:12px 24px;background-color:#0b6e4f;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;border-radius:6px;">View Remaining Leads</a>
            </td></tr>
          </table>
          <p style="margin:16px 0 0;color:#777;font-size:13px;text-align:center;">If this action was unauthorized, please review your staff permissions.</p>
        </td></tr>
        <!-- Footer -->
        <tr><td style="padding:24px 40px;background-color:#fafafa;border-top:1px solid #eee;">
          <p style="margin:0;color:#999;font-size:12px;text-align:center;">
            This is an automated security notification from Aurezo.<br>&copy; ${new Date().getFullYear()} Aurezo. All rights reserved.<br>
            <a href="https://studio.aurezotech.com" style="color:#0b6e4f;text-decoration:none;font-weight:600;">studio.aurezotech.com</a>
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>
    `;

    const emailResponse = await resend.emails.send({
      from: FROM_EMAIL,
      to: [client.email],
      subject: `⚠️ Lead Deleted: ${deleted_lead.customer_name} was removed by ${staff_name}`,
      html: emailHtml,
      reply_to: REPLY_TO,
    });

    console.log("Lead deletion notification email sent:", emailResponse);

    await supabase.from("email_logs").insert({
      recipient_email: client.email,
      email_type: "lead_deleted_notification",
      subject: `Lead Deleted: ${deleted_lead.customer_name} was removed by ${staff_name}`,
      status: "sent",
      resend_id: emailResponse.data?.id,
      metadata: { client_id, staff_name, staff_email, deleted_customer_name: deleted_lead.customer_name, deleted_customer_email: deleted_lead.customer_email },
    });

    return new Response(
      JSON.stringify({ success: true, message: "Lead deletion notification sent to client" }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: any) {
    console.error("Error in notify-lead-deleted:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Failed to send lead deletion notification" }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);