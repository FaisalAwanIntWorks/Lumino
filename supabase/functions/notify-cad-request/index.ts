import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const Resend = (await import("https://esm.sh/resend@2.0.0")).Resend;
const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const FROM_EMAIL = "JewlX <onboarding@resend.dev>";
const REPLY_TO = Deno.env.get("SUPPORT_EMAIL") || undefined;

interface NotifyRequest {
  client_company: string;
  product_name: string;
  source: string;
  metal_type?: string;
  style?: string;
  shape?: string;
  ring_size?: string;
  carat_size?: string;
  customer_name?: string;
  is_custom?: boolean;
  client_notes?: string;
  custom_description?: string;
  grillz_type?: string;
  top_teeth?: string;
  bottom_teeth?: string;
  metal_purity?: string;
  jewelry_type?: string;
  setting?: string;
  band?: string;
  budget?: string;
  timeline?: string;
}

const sourceLabels: Record<string, string> = {
  ring_os: "Ring OS",
  ring_builder: "Ring Builder",
  grillz: "Grillz",
  custom_enquiry: "Custom Enquiry",
  custom: "Custom Request",
};

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body: NotifyRequest = await req.json();
    const { client_company, product_name, source, metal_type, style, shape, ring_size, carat_size, customer_name, is_custom, client_notes, custom_description, grillz_type, top_teeth, bottom_teeth, metal_purity, jewelry_type, setting, band, budget, timeline } = body;

    if (!client_company || !product_name) {
      return new Response(
        JSON.stringify({ error: "client_company and product_name are required" }),
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
      { label: "Client", value: client_company },
      { label: "Product", value: product_name },
      { label: "Source", value: sourceLabels[source] || source },
      ...(customer_name ? [{ label: "Customer", value: customer_name }] : []),
      ...(metal_type ? [{ label: "Metal", value: metal_type }] : []),
      ...(metal_purity ? [{ label: "Purity", value: metal_purity }] : []),
      ...(style ? [{ label: "Style", value: style }] : []),
      ...(shape ? [{ label: "Shape", value: shape }] : []),
      ...(ring_size ? [{ label: "Ring Size", value: ring_size }] : []),
      ...(carat_size ? [{ label: "Carat", value: carat_size }] : []),
      ...(grillz_type ? [{ label: "Grillz Type", value: grillz_type }] : []),
      ...(top_teeth ? [{ label: "Top Teeth", value: top_teeth }] : []),
      ...(bottom_teeth ? [{ label: "Bottom Teeth", value: bottom_teeth }] : []),
      ...(jewelry_type ? [{ label: "Jewelry Type", value: jewelry_type }] : []),
      ...(setting ? [{ label: "Setting", value: setting }] : []),
      ...(band ? [{ label: "Band", value: band }] : []),
      ...(budget ? [{ label: "Budget", value: budget }] : []),
      ...(timeline ? [{ label: "Timeline", value: timeline }] : []),
      { label: "Type", value: is_custom ? "Custom Design" : "Catalog Ring" },
      ...(custom_description ? [{ label: "Description", value: custom_description }] : []),
      ...(client_notes ? [{ label: "Client Notes", value: client_notes }] : []),
      { label: "Requested On", value: createdAt },
    ];

    const detailRowsHtml = detailRows.map(r =>
      `<tr><td style="padding:6px 0;color:#777;font-size:14px;width:130px;">${r.label}</td><td style="padding:6px 0;color:#1a1a1a;font-size:14px;font-weight:500;">${r.value}</td></tr>`
    ).join("");

    const emailHtml = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light only"><style>:root{color-scheme:light only;}@media(prefers-color-scheme:dark){.eh{background-color:#000000!important;}}[data-ogsc] .eh{background-color:#000000!important;}</style></head>
<body style="margin:0;padding:0;background-color:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
  <table role="presentation" style="width:100%;border-collapse:collapse;">
    <tr><td align="center" style="padding:40px 20px;">
      <table role="presentation" style="width:100%;max-width:640px;border-collapse:collapse;background-color:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
        <tr><td class="eh" style="padding:32px 32px 24px;text-align:center;background-color:#000000;">
          <img src="https://vault.jewlx.ai/images/jewelx-email-logo.png" alt="JewlX" style="height:56px;" />
        </td></tr>
        <tr><td style="padding:32px;">
          <h2 style="margin:0 0 16px;color:#1a1a1a;font-size:22px;font-weight:600;">New CAD Design Request</h2>
          <p style="margin:0 0 24px;color:#555;font-size:15px;line-height:1.6;">A client has submitted a new CAD design request.</p>
          <div style="background-color:#f9f9f9;border:1px solid #eee;border-radius:6px;padding:20px;margin-bottom:24px;">
            <p style="margin:0 0 12px;color:#1a1a1a;font-size:13px;font-weight:600;text-transform:uppercase;">Request Details</p>
            <table style="width:100%;border-collapse:collapse;">
              ${detailRowsHtml}
            </table>
          </div>
          <table role="presentation" style="width:100%;border-collapse:collapse;">
            <tr><td align="center" style="padding:16px 0;">
              <a href="https://admin.jewlx.ai/cad-resize-requests" style="display:inline-block;padding:12px 24px;background-color:#0b6e4f;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;border-radius:6px;">View CAD Requests</a>
            </td></tr>
          </table>
        </td></tr>
        <tr><td style="padding:24px 32px;background-color:#fafafa;border-top:1px solid #eee;">
          <p style="margin:0 0 8px;color:#999;font-size:12px;text-align:center;">This is an automated email generated by the system. Please do not reply to this email.</p>
          <p style="margin:0;color:#999;font-size:12px;text-align:center;">
            &copy; ${new Date().getFullYear()} JewlX<br>
            <a href="https://admin.jewlx.ai" style="color:#0b6e4f;text-decoration:none;font-weight:600;">admin.jewlx.ai</a>
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>
    `;

    const subject = `New CAD Request – ${product_name} | ${client_company}`;

    const emailResponse = await resend.emails.send({
      from: FROM_EMAIL,
      to: adminEmails,
      subject,
      html: emailHtml,
      reply_to: REPLY_TO,
    });

    console.log("CAD request notification sent:", emailResponse);

    try {
      await supabase.from("email_logs").insert({
        recipient_email: adminEmails.join(", "),
        email_type: "cad_request_notification",
        subject,
        status: "sent",
        resend_id: emailResponse.data?.id,
        metadata: { client_company, product_name, source, customer_name, metal_type, style, shape, ring_size, carat_size, notified_admins: adminEmails },
      });
    } catch (logError) {
      console.warn("Failed to log email send:", logError);
    }

    return new Response(
      JSON.stringify({ success: true, message: `Notified ${adminEmails.length} admin(s)` }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: any) {
    console.error("Error in notify-cad-request:", error);
    return new Response(
      JSON.stringify({ error: "Failed to notify admins" }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
