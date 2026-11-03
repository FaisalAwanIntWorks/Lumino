import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const Resend = (await import("https://esm.sh/resend@2.0.0")).Resend;

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const FROM_EMAIL = "JewlX <onboarding@resend.dev>";
const REPLY_TO = Deno.env.get("SUPPORT_EMAIL") || undefined;

interface NotifyAdminsStatusRequest {
  client_company: string;
  client_email: string;
  action_type: "deleted" | "deactivated" | "activated" | "status_changed";
  new_status?: string;
  previous_status?: string;
  performed_by_admin_email: string;
  performed_by_admin_name?: string;
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
      client_company, client_email, action_type, new_status, previous_status,
      performed_by_admin_email, performed_by_admin_name 
    }: NotifyAdminsStatusRequest = await req.json();

    if (!client_company || !client_email || !action_type || !performed_by_admin_email) {
      return new Response(
        JSON.stringify({ error: "client_company, client_email, action_type, and performed_by_admin_email are required" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const { data: adminRoles, error: rolesError } = await supabase
      .from("user_roles").select("user_id").eq("role", "agency_admin");

    if (rolesError || !adminRoles || adminRoles.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "No admins to notify" }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const adminEmails: string[] = [];
    for (const { user_id } of adminRoles) {
      const { data: userData, error: userError } = await supabase.auth.admin.getUserById(user_id);
      if (!userError && userData?.user?.email) {
        adminEmails.push(userData.user.email);
      }
    }
    // Always include the performing admin so they get a confirmation record
    if (!adminEmails.some((e) => e.toLowerCase() === performed_by_admin_email.toLowerCase())) {
      adminEmails.push(performed_by_admin_email);
    }

    if (adminEmails.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "No other admins to notify" }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const actionTimestamp = new Date().toLocaleString("en-US", {
      weekday: "long", year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit", timeZoneName: "short",
    });
    const adminDisplayName = performed_by_admin_name || performed_by_admin_email;

    let actionTitle = "Client Deleted";
    let actionDescription = "A client has been permanently deleted from the JewlX platform.";
    if (action_type === "deactivated") { actionTitle = "Client Deactivated"; actionDescription = "A client account has been deactivated."; }
    else if (action_type === "activated") { actionTitle = "Client Activated"; actionDescription = "A client account has been activated."; }
    else if (action_type === "status_changed") { actionTitle = "Client Status Changed"; actionDescription = `A client's status has been changed from "${previous_status}" to "${new_status}".`; }

    const emailSubject = action_type === "deleted" ? `⚠️ Client Deleted: ${client_company}`
      : action_type === "deactivated" ? `⏸️ Client Deactivated: ${client_company}`
      : action_type === "activated" ? `✅ Client Activated: ${client_company}`
      : `🔄 Client Status Changed: ${client_company}`;

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
          <img src="https://vault.jewlx.ai/images/jewelx-email-logo.png" alt="JewlX" style="height:56px;" />
        </td></tr>
        <!-- Content -->
        <tr><td style="padding:40px;">
          <h2 style="margin:0 0 16px;color:#1a1a1a;font-size:22px;font-weight:600;">${actionTitle}</h2>
          <p style="margin:0 0 24px;color:#555;font-size:15px;line-height:1.6;">${actionDescription}</p>
          <!-- Client Details -->
          <div style="background-color:#f9f9f9;border:1px solid #eee;border-radius:6px;padding:20px;margin-bottom:20px;">
            <p style="margin:0 0 12px;color:#1a1a1a;font-size:13px;font-weight:600;text-transform:uppercase;">Client Information</p>
            <table style="width:100%;border-collapse:collapse;">
              <tr><td style="padding:6px 0;color:#777;font-size:14px;width:120px;">Company</td><td style="padding:6px 0;color:#1a1a1a;font-size:14px;font-weight:600;">${client_company}</td></tr>
              <tr><td style="padding:6px 0;color:#777;font-size:14px;">Email</td><td style="padding:6px 0;color:#1a1a1a;font-size:14px;">${client_email}</td></tr>
              ${action_type === "status_changed" && previous_status && new_status ? `
              <tr><td style="padding:6px 0;color:#777;font-size:14px;">Previous Status</td><td style="padding:6px 0;color:#1a1a1a;font-size:14px;">${previous_status}</td></tr>
              <tr><td style="padding:6px 0;color:#777;font-size:14px;">New Status</td><td style="padding:6px 0;color:#1a1a1a;font-size:14px;font-weight:600;">${new_status}</td></tr>` : ''}
              <tr><td style="padding:6px 0;color:#777;font-size:14px;">Action Time</td><td style="padding:6px 0;color:#1a1a1a;font-size:14px;">${actionTimestamp}</td></tr>
            </table>
          </div>
          <!-- Admin Details -->
          <div style="background-color:#f9f9f9;border:1px solid #eee;border-radius:6px;padding:20px;margin-bottom:24px;">
            <p style="margin:0 0 12px;color:#1a1a1a;font-size:13px;font-weight:600;text-transform:uppercase;">Action Performed By</p>
            <table style="width:100%;border-collapse:collapse;">
              <tr><td style="padding:6px 0;color:#777;font-size:14px;width:80px;">Admin</td><td style="padding:6px 0;color:#1a1a1a;font-size:14px;font-weight:500;">${adminDisplayName}</td></tr>
              <tr><td style="padding:6px 0;color:#777;font-size:14px;">Email</td><td style="padding:6px 0;color:#1a1a1a;font-size:14px;">${performed_by_admin_email}</td></tr>
            </table>
          </div>
          <!-- Button -->
          <table role="presentation" style="width:100%;border-collapse:collapse;">
            <tr><td align="center" style="padding:16px 0;">
              <a href="https://admin.jewlx.ai/clients" style="display:inline-block;padding:12px 24px;background-color:#0b6e4f;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;border-radius:6px;">View All Clients</a>
            </td></tr>
          </table>
          <p style="margin:16px 0 0;color:#777;font-size:13px;text-align:center;">This is an automated notification for administrative awareness.</p>
        </td></tr>
        <!-- Footer -->
        <tr><td style="padding:24px 40px;background-color:#fafafa;border-top:1px solid #eee;">
          <p style="margin:0;color:#999;font-size:12px;text-align:center;">
            &copy; ${new Date().getFullYear()} JewlX Admin Notification<br>
            <a href="https://admin.jewlx.ai" style="color:#0b6e4f;text-decoration:none;font-weight:600;">admin.jewlx.ai</a>
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>
    `;

    const emailResponse = await resend.emails.send({
      from: FROM_EMAIL, to: adminEmails, subject: emailSubject, html: emailHtml, reply_to: REPLY_TO,
    });

    console.log("Admin status notification emails sent:", emailResponse);

    await supabase.from("email_logs").insert({
      recipient_email: adminEmails.join(", "),
      email_type: `admin_client_${action_type}_notification`,
      subject: emailSubject, status: "sent", resend_id: emailResponse.data?.id,
      metadata: { client_company, client_email, action_type, new_status, previous_status, performed_by_admin_email, notified_admins: adminEmails },
    });

    return new Response(
      JSON.stringify({ success: true, message: `Notified ${adminEmails.length} admin(s)` }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: any) {
    console.error("Error in notify-admins-client-status:", error);
    return new Response(
      JSON.stringify({ error: "Failed to notify admins" }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);