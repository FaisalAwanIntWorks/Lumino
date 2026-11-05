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

interface OrderUpdateRequest {
  client_id: string;
  event_type: "new_order" | "status_change" | "fulfillment_update";
  order_id: string;
  customer_name: string;
  customer_email: string;
  product_name?: string;
  total_amount?: number;
  old_status?: string;
  new_status?: string;
  currency?: string;
  order_number?: string;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body: OrderUpdateRequest = await req.json();
    const { client_id, event_type, order_id, customer_name, customer_email, product_name, total_amount, old_status, new_status, currency, order_number } = body;

    if (!client_id || !event_type || !order_id) {
      return new Response(
        JSON.stringify({ error: "client_id, event_type, and order_id are required" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const { data: notifPref } = await supabase
      .from("client_notification_preferences").select("is_enabled")
      .eq("client_id", client_id).eq("notification_type", "order_updates").maybeSingle();

    if (notifPref && notifPref.is_enabled === false) {
      return new Response(JSON.stringify({ success: true, message: "Notification skipped (disabled by client)" }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } });
    }

    const { data: client, error: clientError } = await supabase
      .from("clients").select("email, company_name").eq("id", client_id).maybeSingle();

    if (clientError || !client) {
      return new Response(JSON.stringify({ error: "Client not found" }),
        { status: 404, headers: { "Content-Type": "application/json", ...corsHeaders } });
    }

    const currentDate = new Date().toLocaleDateString("en-US", {
      weekday: "long", year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit",
    });

    const formattedAmount = total_amount ? `${currency || "USD"} $${total_amount.toFixed(2)}` : "";

    let headerTitle = "";
    let subject = "";
    let detailRows = "";

    switch (event_type) {
      case "new_order":
        headerTitle = "New Order Received";
        subject = `🛍️ New Order from ${customer_name}`;
        detailRows = `
          <tr><td style="padding:6px 0;color:#777;font-size:14px;width:100px;">Customer</td><td style="padding:6px 0;color:#1a1a1a;font-size:14px;font-weight:600;">${customer_name}</td></tr>
          <tr><td style="padding:6px 0;color:#777;font-size:14px;">Email</td><td style="padding:6px 0;"><a href="mailto:${customer_email}" style="color:#0b6e4f;text-decoration:none;font-size:14px;">${customer_email}</a></td></tr>
          ${product_name ? `<tr><td style="padding:6px 0;color:#777;font-size:14px;">Product</td><td style="padding:6px 0;color:#1a1a1a;font-size:14px;font-weight:600;">${product_name}</td></tr>` : ""}
          ${formattedAmount ? `<tr><td style="padding:6px 0;color:#777;font-size:14px;">Total</td><td style="padding:6px 0;color:#1a1a1a;font-size:18px;font-weight:700;">${formattedAmount}</td></tr>` : ""}
          ${order_number ? `<tr><td style="padding:6px 0;color:#777;font-size:14px;">Order #</td><td style="padding:6px 0;color:#1a1a1a;font-size:14px;">#${order_number}</td></tr>` : ""}`;
        break;
      case "status_change":
        headerTitle = "Order Status Updated";
        subject = `📦 Order Status: ${old_status} → ${new_status}`;
        detailRows = `
          <tr><td style="padding:6px 0;color:#777;font-size:14px;width:100px;">Customer</td><td style="padding:6px 0;color:#1a1a1a;font-size:14px;font-weight:600;">${customer_name}</td></tr>
          <tr><td style="padding:6px 0;color:#777;font-size:14px;">Previous</td><td style="padding:6px 0;color:#1a1a1a;font-size:14px;">${old_status}</td></tr>
          <tr><td style="padding:6px 0;color:#777;font-size:14px;">New Status</td><td style="padding:6px 0;color:#1a1a1a;font-size:14px;font-weight:600;">${new_status}</td></tr>
          ${formattedAmount ? `<tr><td style="padding:6px 0;color:#777;font-size:14px;">Total</td><td style="padding:6px 0;color:#1a1a1a;font-size:14px;font-weight:600;">${formattedAmount}</td></tr>` : ""}`;
        break;
      case "fulfillment_update":
        headerTitle = "Fulfillment Update";
        subject = `✅ Fulfillment Update: ${customer_name}'s order`;
        detailRows = `
          <tr><td style="padding:6px 0;color:#777;font-size:14px;width:100px;">Customer</td><td style="padding:6px 0;color:#1a1a1a;font-size:14px;font-weight:600;">${customer_name}</td></tr>
          <tr><td style="padding:6px 0;color:#777;font-size:14px;">Status</td><td style="padding:6px 0;color:#1a1a1a;font-size:14px;font-weight:600;">${new_status || "updated"}</td></tr>
          ${formattedAmount ? `<tr><td style="padding:6px 0;color:#777;font-size:14px;">Total</td><td style="padding:6px 0;color:#1a1a1a;font-size:14px;font-weight:600;">${formattedAmount}</td></tr>` : ""}`;
        break;
    }

    const emailHtml = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
  <table role="presentation" style="width:100%;border-collapse:collapse;">
    <tr><td align="center" style="padding:40px 20px;">
      <table role="presentation" style="width:100%;max-width:560px;border-collapse:collapse;background-color:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
        <tr><td style="padding:32px 40px 24px;text-align:center;background-color:#000000;">
          <img src="https://studio.aurezotech.com/images/aurezo-email-logo.png" alt="Aurezo" style="height:56px;" />
        </td></tr>
        <tr><td style="padding:40px;">
          <h2 style="margin:0 0 8px;color:#1a1a1a;font-size:22px;font-weight:600;">${headerTitle}</h2>
          <p style="margin:0 0 24px;color:#777;font-size:13px;">${currentDate}</p>
          <div style="background-color:#f9f9f9;border:1px solid #eee;border-radius:6px;padding:20px;margin-bottom:24px;">
            <p style="margin:0 0 12px;color:#1a1a1a;font-size:13px;font-weight:600;text-transform:uppercase;">Order Details</p>
            <table style="width:100%;border-collapse:collapse;">${detailRows}</table>
          </div>
          <table role="presentation" style="width:100%;border-collapse:collapse;">
            <tr><td align="center" style="padding:16px 0;">
              <a href="https://studio.aurezotech.com/orders" style="display:inline-block;padding:12px 24px;background-color:#0b6e4f;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;border-radius:6px;">View Orders</a>
            </td></tr>
          </table>
        </td></tr>
        <tr><td style="padding:24px 40px;background-color:#fafafa;border-top:1px solid #eee;">
          <p style="margin:0;color:#999;font-size:12px;text-align:center;">
            This is an automated notification from Aurezo.<br>&copy; ${new Date().getFullYear()} Aurezo. All rights reserved.<br>
            <a href="https://studio.aurezotech.com" style="color:#0b6e4f;text-decoration:none;font-weight:600;">studio.aurezotech.com</a>
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

    const emailResponse = await resend.emails.send({ from: FROM_EMAIL, to: [client.email], subject, html: emailHtml, reply_to: REPLY_TO });

    console.log("Order update email sent:", { type: event_type, recipient: client.email.substring(0, 3) + "***" });

    await supabase.from("email_logs").insert({
      recipient_email: client.email, email_type: `order_${event_type}`, subject, status: "sent",
      resend_id: emailResponse.data?.id, metadata: { client_id, order_id, event_type },
    });

    return new Response(JSON.stringify({ success: true, message: "Order notification sent" }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } });
  } catch (error: any) {
    console.error("Error in notify-order-update:", error);
    return new Response(JSON.stringify({ error: error.message || "Failed to send order notification" }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } });
  }
};

serve(handler);