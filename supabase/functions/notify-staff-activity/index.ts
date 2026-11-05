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

interface StaffActivityRequest {
  client_id: string;
  event_type: "staff_added" | "staff_removed" | "staff_permissions_changed" | "staff_status_changed";
  staff_name: string;
  staff_email: string;
  performed_by: string; // name of user who performed the action
  details?: Record<string, any>;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body: StaffActivityRequest = await req.json();
    const { client_id, event_type, staff_name, staff_email, performed_by, details } = body;

    if (!client_id || !event_type || !staff_name) {
      return new Response(
        JSON.stringify({ error: "client_id, event_type, and staff_name are required" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Check notification preferences
    const { data: notifPref } = await supabase
      .from("client_notification_preferences")
      .select("is_enabled")
      .eq("client_id", client_id)
      .eq("notification_type", "staff_activity")
      .maybeSingle();

    if (notifPref && notifPref.is_enabled === false) {
      console.log("Client has disabled staff_activity notifications, skipping.");
      return new Response(
        JSON.stringify({ success: true, message: "Notification skipped (disabled by client)" }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Get client email
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

    const currentDate = new Date().toLocaleDateString("en-US", {
      weekday: "long", year: "numeric", month: "long", day: "numeric",
      hour: "2-digit", minute: "2-digit",
    });

    let headerTitle = "";
    let subject = "";
    let actionDetailsHtml = "";

    switch (event_type) {
      case "staff_added":
        headerTitle = "Staff Member Added";
        subject = `👤 New Staff Member: ${staff_name} added to your team`;
        actionDetailsHtml = `
          <tr><td style="padding:6px 0;color:#777;font-size:14px;width:100px;">Action:</td>
              <td style="padding:6px 0;color:#1a1a1a;font-size:14px;font-weight:600;">Added</td></tr>
          <tr><td style="padding:6px 0;color:#777;font-size:14px;">Name:</td>
              <td style="padding:6px 0;color:#1a1a1a;font-size:14px;font-weight:500;">${staff_name}</td></tr>
          <tr><td style="padding:6px 0;color:#777;font-size:14px;">Email:</td>
              <td style="padding:6px 0;color:#1a1a1a;font-size:14px;">${staff_email}</td></tr>
          ${details?.catalog_access ? `<tr><td style="padding:6px 0;color:#777;font-size:14px;">Access:</td>
              <td style="padding:6px 0;color:#1a1a1a;font-size:14px;">${details.catalog_access === 'edit' ? 'View & Edit' : details.catalog_access === 'view' ? 'View Only' : 'Disabled'}</td></tr>` : ""}
          <tr><td style="padding:6px 0;color:#777;font-size:14px;">Added By:</td>
              <td style="padding:6px 0;color:#1a1a1a;font-size:14px;">${performed_by}</td></tr>
        `;
        break;

      case "staff_removed":
        headerTitle = "Staff Member Removed";
        subject = `🚫 Staff Member Removed: ${staff_name}`;
        actionDetailsHtml = `
          <tr><td style="padding:6px 0;color:#777;font-size:14px;width:100px;">Action:</td>
              <td style="padding:6px 0;color:#1a1a1a;font-size:14px;font-weight:600;">Removed</td></tr>
          <tr><td style="padding:6px 0;color:#777;font-size:14px;">Name:</td>
              <td style="padding:6px 0;color:#1a1a1a;font-size:14px;font-weight:500;">${staff_name}</td></tr>
          <tr><td style="padding:6px 0;color:#777;font-size:14px;">Email:</td>
              <td style="padding:6px 0;color:#1a1a1a;font-size:14px;">${staff_email}</td></tr>
          <tr><td style="padding:6px 0;color:#777;font-size:14px;">Removed By:</td>
              <td style="padding:6px 0;color:#1a1a1a;font-size:14px;">${performed_by}</td></tr>
        `;
        break;

      case "staff_permissions_changed":
        headerTitle = "Staff Permissions Updated";
        subject = `🔑 Permissions Changed: ${staff_name}`;
        const oldAccess = details?.old_permissions?.catalog_access || "unknown";
        const newAccess = details?.new_permissions?.catalog_access || "unknown";
        actionDetailsHtml = `
          <tr><td style="padding:6px 0;color:#777;font-size:14px;width:100px;">Action:</td>
              <td style="padding:6px 0;color:#1a1a1a;font-size:14px;font-weight:600;">Permissions Changed</td></tr>
          <tr><td style="padding:6px 0;color:#777;font-size:14px;">Staff:</td>
              <td style="padding:6px 0;color:#1a1a1a;font-size:14px;font-weight:500;">${staff_name} (${staff_email})</td></tr>
          <tr><td style="padding:6px 0;color:#777;font-size:14px;">Previous:</td>
              <td style="padding:6px 0;color:#1a1a1a;font-size:14px;">${oldAccess === 'edit' ? 'View & Edit' : oldAccess === 'view' ? 'View Only' : oldAccess === 'false' ? 'Disabled' : oldAccess}</td></tr>
          <tr><td style="padding:6px 0;color:#777;font-size:14px;">New Access:</td>
              <td style="padding:6px 0;color:#1a1a1a;font-size:14px;font-weight:600;">${newAccess === 'edit' ? 'View & Edit' : newAccess === 'view' ? 'View Only' : newAccess === 'false' ? 'Disabled' : newAccess}</td></tr>
          <tr><td style="padding:6px 0;color:#777;font-size:14px;">Changed By:</td>
              <td style="padding:6px 0;color:#1a1a1a;font-size:14px;">${performed_by}</td></tr>
        `;
        break;

      case "staff_status_changed":
        headerTitle = `Staff Member ${details?.new_status === "active" ? "Activated" : "Deactivated"}`;
        subject = `${details?.new_status === "active" ? "✅" : "⏸️"} Staff ${details?.new_status === "active" ? "Activated" : "Deactivated"}: ${staff_name}`;
        actionDetailsHtml = `
          <tr><td style="padding:6px 0;color:#777;font-size:14px;width:100px;">Action:</td>
              <td style="padding:6px 0;color:#1a1a1a;font-size:14px;font-weight:600;">${(details?.new_status || "").toUpperCase()}</td></tr>
          <tr><td style="padding:6px 0;color:#777;font-size:14px;">Staff:</td>
              <td style="padding:6px 0;color:#1a1a1a;font-size:14px;font-weight:500;">${staff_name} (${staff_email})</td></tr>
          <tr><td style="padding:6px 0;color:#777;font-size:14px;">Changed By:</td>
              <td style="padding:6px 0;color:#1a1a1a;font-size:14px;">${performed_by}</td></tr>
        `;
        break;
    }

    const emailHtml = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light only"><style>:root{color-scheme:light only;}@media(prefers-color-scheme:dark){.eh{background-color:#000000!important;}}[data-ogsc] .eh{background-color:#000000!important;}</style></head>
<body style="margin:0;padding:0;background-color:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
  <table role="presentation" style="width:100%;border-collapse:collapse;">
    <tr><td align="center" style="padding:40px 20px;">
      <table role="presentation" style="width:100%;max-width:560px;border-collapse:collapse;background-color:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
        <tr><td class="eh" style="padding:32px 40px 24px;text-align:center;background-color:#000000;">
          <img src="https://studio.aurezotech.com/images/aurezo-email-logo.png" alt="Aurezo" style="height:56px;" />
        </td></tr>
        <tr><td style="padding:40px;">
          <h2 style="margin:0 0 12px;color:#1a1a1a;font-size:22px;font-weight:600;">${headerTitle}</h2>
          <p style="margin:0 0 4px;color:#999;font-size:13px;">${currentDate}</p>
          <p style="margin:0 0 24px;color:#555;font-size:15px;line-height:1.6;">A staff activity event has occurred on your account.</p>
          <div style="padding:16px;background-color:#f9f9f9;border-radius:6px;border:1px solid #eee;margin-bottom:24px;">
            <p style="margin:0 0 10px;color:#1a1a1a;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Activity Details</p>
            <table style="width:100%;border-collapse:collapse;">${actionDetailsHtml}</table>
          </div>
          <table role="presentation" style="width:100%;border-collapse:collapse;">
            <tr><td align="center" style="padding:8px 0;">
              <a href="https://studio.aurezotech.com/staff" style="display:inline-block;padding:14px 28px;background-color:#0b6e4f;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;border-radius:6px;">
                Manage Staff
              </a>
            </td></tr>
          </table>
        </td></tr>
        <tr><td style="padding:20px 40px;background-color:#fafafa;border-top:1px solid #eee;">
          <p style="margin:0;color:#999;font-size:12px;text-align:center;">
            Automated notification from Aurezo.<br>&copy; ${new Date().getFullYear()} Aurezo. All rights reserved.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

    const emailResponse = await resend.emails.send({
      from: FROM_EMAIL,
      to: [client.email],
      subject,
      html: emailHtml,
      reply_to: REPLY_TO,
    });

    console.log("Staff activity email sent:", { type: event_type, recipient: client.email.substring(0, 3) + "***" });

    await supabase.from("email_logs").insert({
      recipient_email: client.email,
      email_type: `staff_${event_type}`,
      subject,
      status: "sent",
      resend_id: emailResponse.data?.id,
      metadata: { client_id, event_type, staff_name },
    });

    return new Response(
      JSON.stringify({ success: true, message: "Staff activity notification sent" }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: any) {
    console.error("Error in notify-staff-activity:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Failed to send staff activity notification" }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
