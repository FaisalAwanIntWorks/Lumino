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

interface DeliveryRequest {
  cad_request_id: string;
  client_id: string;
  customer_name?: string;
  product_name?: string;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body: DeliveryRequest = await req.json();
    const { cad_request_id, client_id, customer_name, product_name } = body;

    if (!cad_request_id || !client_id) {
      return new Response(
        JSON.stringify({ error: "cad_request_id and client_id are required" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Get client email
    const { data: clientData } = await supabase
      .from("clients")
      .select("email, company_name, user_id")
      .eq("id", client_id)
      .single();

    if (!clientData?.email) {
      return new Response(
        JSON.stringify({ success: true, message: "No client email found" }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Also get staff emails for this client
    const recipientEmails: string[] = [clientData.email];
    const { data: staffMembers } = await supabase
      .from("staff_members")
      .select("email")
      .eq("client_id", client_id)
      .eq("status", "active");
    if (staffMembers) {
      for (const s of staffMembers) {
        if (s.email && !recipientEmails.includes(s.email)) {
          recipientEmails.push(s.email);
        }
      }
    }

    const deliveredAt = new Date().toLocaleString("en-US", {
      weekday: "long", year: "numeric", month: "long", day: "numeric",
      hour: "2-digit", minute: "2-digit", timeZoneName: "short",
    });

    const emailHtml = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light only"><style>:root{color-scheme:light only;}@media(prefers-color-scheme:dark){.eh{background-color:#000000!important;}}[data-ogsc] .eh{background-color:#000000!important;}</style></head>
<body style="margin:0;padding:0;background-color:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
  <table role="presentation" style="width:100%;border-collapse:collapse;">
    <tr><td align="center" style="padding:40px 20px;">
      <table role="presentation" style="width:100%;max-width:640px;border-collapse:collapse;background-color:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
        <tr><td class="eh" style="padding:32px 32px 24px;text-align:center;background-color:#000000;">
          <img src="https://studio.aurezotech.com/images/aurezo-email-logo.png" alt="Aurezo" style="height:56px;" />
        </td></tr>
        <tr><td style="padding:32px;">
          <h2 style="margin:0 0 16px;color:#1a1a1a;font-size:22px;font-weight:600;">CAD Design Ready</h2>
          <p style="margin:0 0 24px;color:#555;font-size:15px;line-height:1.6;">
            The custom CAD you requested${customer_name ? ` for <strong>${customer_name}</strong>` : ""}${product_name ? ` (${product_name})` : ""} is now uploaded on your account.
          </p>
          <div style="background-color:#f9f9f9;border:1px solid #eee;border-radius:6px;padding:20px;margin-bottom:24px;">
            <p style="margin:0 0 8px;color:#1a1a1a;font-size:13px;font-weight:600;text-transform:uppercase;">Delivery Details</p>
            <table style="width:100%;border-collapse:collapse;">
              ${customer_name ? `<tr><td style="padding:6px 0;color:#777;font-size:14px;width:130px;">Customer</td><td style="padding:6px 0;color:#1a1a1a;font-size:14px;font-weight:500;">${customer_name}</td></tr>` : ""}
              ${product_name ? `<tr><td style="padding:6px 0;color:#777;font-size:14px;width:130px;">Product</td><td style="padding:6px 0;color:#1a1a1a;font-size:14px;font-weight:500;">${product_name}</td></tr>` : ""}
              <tr><td style="padding:6px 0;color:#777;font-size:14px;width:130px;">Delivered On</td><td style="padding:6px 0;color:#1a1a1a;font-size:14px;font-weight:500;">${deliveredAt}</td></tr>
            </table>
          </div>
          <table role="presentation" style="width:100%;border-collapse:collapse;">
            <tr><td align="center" style="padding:16px 0;">
              <a href="https://studioadmin.aurezotech.com/dashboard/saved-designs" style="display:inline-block;padding:12px 24px;background-color:#0b6e4f;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;border-radius:6px;">View Your Leads</a>
            </td></tr>
          </table>
        </td></tr>
        <tr><td style="padding:24px 32px;background-color:#fafafa;border-top:1px solid #eee;">
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

    const subject = `CAD Design Ready – ${product_name || "Your Request"} | Aurezo`;

    const emailResponse = await resend.emails.send({
      from: FROM_EMAIL,
      to: recipientEmails,
      subject,
      html: emailHtml,
      reply_to: REPLY_TO,
    });

    console.log("CAD delivery notification sent:", emailResponse);

    try {
      await supabase.from("email_logs").insert({
        recipient_email: recipientEmails.join(", "),
        email_type: "cad_delivery_notification",
        subject,
        status: "sent",
        resend_id: emailResponse.data?.id,
        metadata: { cad_request_id, client_id, customer_name, product_name },
      });
    } catch (logError) {
      console.warn("Failed to log email send:", logError);
    }

    return new Response(
      JSON.stringify({ success: true, message: `Notified ${recipientEmails.length} recipient(s)` }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: any) {
    console.error("Error in notify-cad-delivery:", error);
    return new Response(
      JSON.stringify({ error: "Failed to notify client" }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
