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

interface NotifyAdminsRequest {
  new_client_company: string;
  new_client_email: string;
  created_by_admin_email?: string;
  created_by_admin_name?: string;
  plan_name?: string;
  phone?: string;
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
      new_client_company,
      new_client_email,
      created_by_admin_email,
      created_by_admin_name,
      plan_name,
      phone,
    }: NotifyAdminsRequest = await req.json();

    if (!new_client_company || !new_client_email) {
      return new Response(
        JSON.stringify({ error: "new_client_company and new_client_email are required" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const isSelfServe = !created_by_admin_email;

    const { data: adminRoles, error: rolesError } = await supabase
      .from("user_roles")
      .select("user_id")
      .eq("role", "agency_admin");

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
        // For admin-created clients, exclude the creating admin. For self-serve, notify all.
        if (isSelfServe || userData.user.email.toLowerCase() !== created_by_admin_email!.toLowerCase()) {
          adminEmails.push(userData.user.email);
        }
      }
    }

    if (adminEmails.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "No other admins to notify" }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const createdAt = new Date().toLocaleString("en-US", {
      weekday: "long", year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit", timeZoneName: "short",
    });
    const adminDisplayName = isSelfServe ? "Self-serve via Stripe" : (created_by_admin_name || created_by_admin_email);

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
          <h2 style="margin:0 0 16px;color:#1a1a1a;font-size:22px;font-weight:600;">New Client Registered</h2>
          <p style="margin:0 0 24px;color:#555;font-size:15px;line-height:1.6;">A new client has been registered on the Aurezo platform.</p>
          <!-- Client Details -->
          <div style="background-color:#f9f9f9;border:1px solid #eee;border-radius:6px;padding:20px;margin-bottom:20px;">
            <p style="margin:0 0 12px;color:#1a1a1a;font-size:13px;font-weight:600;text-transform:uppercase;">New Client Information</p>
            <table style="width:100%;border-collapse:collapse;">
              <tr><td style="padding:6px 0;color:#777;font-size:14px;width:120px;">Company</td><td style="padding:6px 0;color:#1a1a1a;font-size:14px;font-weight:600;">${new_client_company}</td></tr>
              <tr><td style="padding:6px 0;color:#777;font-size:14px;">Email</td><td style="padding:6px 0;color:#1a1a1a;font-size:14px;">${new_client_email}</td></tr>
              ${phone ? `<tr><td style="padding:6px 0;color:#777;font-size:14px;">Phone</td><td style="padding:6px 0;color:#1a1a1a;font-size:14px;">${phone}</td></tr>` : ""}
              ${plan_name ? `<tr><td style="padding:6px 0;color:#777;font-size:14px;">Plan</td><td style="padding:6px 0;color:#1a1a1a;font-size:14px;font-weight:600;">${plan_name}</td></tr>` : ""}
              <tr><td style="padding:6px 0;color:#777;font-size:14px;">Registered On</td><td style="padding:6px 0;color:#1a1a1a;font-size:14px;">${createdAt}</td></tr>
            </table>
          </div>
          <!-- Admin Details -->
          <div style="background-color:#f9f9f9;border:1px solid #eee;border-radius:6px;padding:20px;margin-bottom:24px;">
            <p style="margin:0 0 12px;color:#1a1a1a;font-size:13px;font-weight:600;text-transform:uppercase;">Created By</p>
            <table style="width:100%;border-collapse:collapse;">
              <tr><td style="padding:6px 0;color:#777;font-size:14px;width:80px;">${isSelfServe ? "Source" : "Admin"}</td><td style="padding:6px 0;color:#1a1a1a;font-size:14px;font-weight:500;">${adminDisplayName}</td></tr>
              ${!isSelfServe ? `<tr><td style="padding:6px 0;color:#777;font-size:14px;">Email</td><td style="padding:6px 0;color:#1a1a1a;font-size:14px;">${created_by_admin_email}</td></tr>` : ""}
            </table>
          </div>
          <!-- Button -->
          <table role="presentation" style="width:100%;border-collapse:collapse;">
            <tr><td align="center" style="padding:16px 0;">
              <a href="https://studioadmin.aurezotech.com/clients" style="display:inline-block;padding:12px 24px;background-color:#0b6e4f;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;border-radius:6px;">View All Clients</a>
            </td></tr>
          </table>
          <p style="margin:16px 0 0;color:#777;font-size:13px;text-align:center;">The client has received a welcome email with setup instructions.</p>
        </td></tr>
        <!-- Footer -->
        <tr><td style="padding:24px 40px;background-color:#fafafa;border-top:1px solid #eee;">
          <p style="margin:0;color:#999;font-size:12px;text-align:center;">
            &copy; ${new Date().getFullYear()} Aurezo Admin Notification<br>
            <a href="https://studioadmin.aurezotech.com" style="color:#0b6e4f;text-decoration:none;font-weight:600;">studioadmin.aurezotech.com</a>
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
      to: adminEmails,
      subject: `New Client Registered: ${new_client_company}`,
      html: emailHtml,
      reply_to: REPLY_TO,
    });

    console.log("Admin notification emails sent:", emailResponse);

    await supabase.from("email_logs").insert({
      recipient_email: adminEmails.join(", "),
      email_type: "admin_new_client_notification",
      subject: `New Client Registered: ${new_client_company}`,
      status: "sent",
      resend_id: emailResponse.data?.id,
      metadata: { new_client_company, new_client_email, created_by_admin_email: created_by_admin_email || "self_serve_stripe", plan_name, phone, notified_admins: adminEmails },
    });

    return new Response(
      JSON.stringify({ success: true, message: `Notified ${adminEmails.length} admin(s)` }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: any) {
    console.error("Error in notify-admins-new-client:", error);
    return new Response(
      JSON.stringify({ error: "Failed to notify admins" }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);