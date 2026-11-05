import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const Resend = (await import("https://esm.sh/resend@2.0.0")).Resend;
const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const FROM_EMAIL = "Aurezo <onboarding@resend.dev>";
const REPLY_TO = Deno.env.get("SUPPORT_EMAIL") || undefined;

interface NotifyRequest {
  client_company: string;
  order_number: string;
  current_size: string;
  requested_size: string;
  product_name?: string;
  metal_type?: string;
  style?: string;
  shape?: string;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body: NotifyRequest = await req.json();
    const { client_company, order_number, current_size, requested_size, product_name, metal_type, style, shape } = body;

    if (!client_company || !order_number || !current_size || !requested_size) {
      return new Response(
        JSON.stringify({ error: "client_company, order_number, current_size, and requested_size are required" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Fetch all agency_admin users
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
        adminEmails.push(userData.user.email);
      }
    }

    if (adminEmails.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "No admins to notify" }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const createdAt = new Date().toLocaleString("en-US", {
      weekday: "long", year: "numeric", month: "long", day: "numeric",
      hour: "2-digit", minute: "2-digit", timeZoneName: "short",
    });

    const detailRows = [
      { label: "Order", value: `#${order_number}` },
      { label: "Client", value: client_company },
      { label: "Current Size", value: current_size },
      { label: "Requested Size", value: requested_size },
      ...(product_name ? [{ label: "Product", value: product_name }] : []),
      ...(metal_type ? [{ label: "Metal", value: metal_type }] : []),
      ...(style ? [{ label: "Style", value: style }] : []),
      ...(shape ? [{ label: "Shape", value: shape }] : []),
      { label: "Requested On", value: createdAt },
    ];

    const detailRowsHtml = detailRows.map(r =>
      `<tr><td style="padding:6px 0;color:#777;font-size:14px;width:130px;">${r.label}</td><td style="padding:6px 0;color:#1a1a1a;font-size:14px;font-weight:${r.label === "Requested Size" ? "700" : "500"};">${r.value}</td></tr>`
    ).join("");

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
          <h2 style="margin:0 0 16px;color:#1a1a1a;font-size:22px;font-weight:600;">CAD Resize Request</h2>
          <p style="margin:0 0 24px;color:#555;font-size:15px;line-height:1.6;">A client has requested a CAD file resize for one of their orders.</p>
          <!-- Request Details -->
          <div style="background-color:#f9f9f9;border:1px solid #eee;border-radius:6px;padding:20px;margin-bottom:20px;">
            <p style="margin:0 0 12px;color:#1a1a1a;font-size:13px;font-weight:600;text-transform:uppercase;">Request Details</p>
            <table style="width:100%;border-collapse:collapse;">
              ${detailRowsHtml}
            </table>
          </div>
          <!-- Size Change Highlight -->
          <div style="background-color:#fef3cd;border:1px solid #ffc107;border-radius:6px;padding:16px;margin-bottom:24px;text-align:center;">
            <p style="margin:0;color:#856404;font-size:15px;font-weight:600;">Size ${current_size} → Size ${requested_size}</p>
          </div>
          <!-- Button -->
          <table role="presentation" style="width:100%;border-collapse:collapse;">
            <tr><td align="center" style="padding:16px 0;">
              <a href="https://studioadmin.aurezotech.com/cad-resize-requests" style="display:inline-block;padding:12px 24px;background-color:#0b6e4f;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;border-radius:6px;">View Resize Requests</a>
            </td></tr>
          </table>
        </td></tr>
        <!-- Footer -->
        <tr><td style="padding:24px 40px;background-color:#fafafa;border-top:1px solid #eee;">
          <p style="margin:0 0 8px;color:#999;font-size:12px;text-align:center;">This is an automated email generated by the system. Please do not reply to this email.</p>
          <p style="margin:0;color:#999;font-size:12px;text-align:center;">
            &copy; ${new Date().getFullYear()} Aurezo<br>
            <a href="https://studioadmin.aurezotech.com" style="color:#0b6e4f;text-decoration:none;font-weight:600;">studioadmin.aurezotech.com</a>
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>
    `;

    const subject = `CAD Resize Request – Order #${order_number} | ${client_company}`;

    const emailResponse = await resend.emails.send({
      from: FROM_EMAIL,
      to: adminEmails,
      subject,
      html: emailHtml,
      reply_to: REPLY_TO,
    });

    console.log("CAD resize notification sent:", emailResponse);

    await supabase.from("email_logs").insert({
      recipient_email: adminEmails.join(", "),
      email_type: "cad_resize_request_notification",
      subject,
      status: "sent",
      resend_id: emailResponse.data?.id,
      metadata: { client_company, order_number, current_size, requested_size, product_name, metal_type, style, shape, notified_admins: adminEmails },
    });

    return new Response(
      JSON.stringify({ success: true, message: `Notified ${adminEmails.length} admin(s)` }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: any) {
    console.error("Error in notify-cad-resize:", error);
    return new Response(
      JSON.stringify({ error: "Failed to notify admins" }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
