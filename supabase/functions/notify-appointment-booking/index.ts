import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getLeadNotificationRecipients } from "../_shared/lead-notification-recipients.ts";

const Resend = (await import("https://esm.sh/resend@2.0.0")).Resend;
const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const FROM_EMAIL = "Aurezo <onboarding@resend.dev>";
const REPLY_TO = Deno.env.get("SUPPORT_EMAIL") || undefined;

interface BookingNotificationRequest {
  client_id: string;
  customer_name: string;
  customer_email: string;
  customer_phone?: string;
  preferred_date?: string;
  preferred_time?: string;
  message?: string;
  // 'metal_iq' when booked from the Metal IQ form; absent for the Ring OS widget.
  source?: string;
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
      preferred_date,
      preferred_time,
      message,
      source,
    }: BookingNotificationRequest = await req.json();

    const isMetalIq = source === "metal_iq";

    if (!client_id || !customer_name || !customer_email) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get client info
    const { data: client, error: clientError } = await supabase
      .from("clients")
      .select("email, company_name")
      .eq("id", client_id)
      .single();

    if (clientError || !client) {
      console.error("Client not found:", clientError);
      return new Response(
        JSON.stringify({ error: "Client not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Master "New Lead Notifications" switch also covers appointment booking emails.
    const { data: notifPref } = await supabase
      .from("client_notification_preferences")
      .select("is_enabled")
      .eq("client_id", client_id)
      .eq("notification_type", "new_lead")
      .maybeSingle();

    if (notifPref && notifPref.is_enabled === false) {
      console.log("Client has disabled new_lead notifications, skipping booking email.");
      return new Response(
        JSON.stringify({ success: true, message: "Notification skipped (disabled by client)" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const formattedDate = preferred_date || "Not specified";
    const formattedTime = preferred_time || "Not specified";

    const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
          <!-- Header -->
          <tr>
            <td style="background-color:#000000;padding:32px 40px 24px;text-align:center;">
              <img src="https://studio.aurezotech.com/images/aurezo-email-logo.png" alt="Aurezo" style="height:56px;" />
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:40px;">
              <h2 style="margin:0 0 12px;color:#1a1a1a;font-size:22px;font-weight:600;">${isMetalIq ? "New Metal IQ Appointment Booking" : "New Appointment Booking"}</h2>
              <p style="color:#555;font-size:15px;margin:0 0 24px;line-height:1.6;">Hi <strong style="color:#1a1a1a;">${client.company_name}</strong>, a customer has requested an appointment through your ${isMetalIq ? "Metal IQ form" : "widget"}.</p>

              <div style="padding:16px;background-color:#f9f9f9;border-radius:6px;border:1px solid #eee;margin-bottom:24px;">
                <p style="margin:0 0 10px;color:#1a1a1a;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Customer Details</p>
                <table style="width:100%;border-collapse:collapse;">
                  ${isMetalIq ? `<tr><td style="padding:6px 0;color:#777;font-size:14px;width:120px;">Source:</td><td style="padding:6px 0;color:#1a1a1a;font-size:14px;font-weight:500;">Metal IQ</td></tr>` : ""}
                  <tr><td style="padding:6px 0;color:#777;font-size:14px;width:120px;">Name:</td><td style="padding:6px 0;color:#1a1a1a;font-size:14px;font-weight:500;">${customer_name}</td></tr>
                  <tr><td style="padding:6px 0;color:#777;font-size:14px;">Email:</td><td style="padding:6px 0;color:#1a1a1a;font-size:14px;">${customer_email}</td></tr>
                  <tr><td style="padding:6px 0;color:#777;font-size:14px;">Phone:</td><td style="padding:6px 0;color:#1a1a1a;font-size:14px;">${customer_phone || "Not provided"}</td></tr>
                  <tr><td style="padding:6px 0;color:#777;font-size:14px;">Date:</td><td style="padding:6px 0;color:#1a1a1a;font-size:14px;font-weight:500;">${formattedDate}</td></tr>
                  <tr><td style="padding:6px 0;color:#777;font-size:14px;">Time:</td><td style="padding:6px 0;color:#1a1a1a;font-size:14px;font-weight:500;">${formattedTime}</td></tr>
                  ${message ? `<tr><td style="padding:6px 0;color:#777;font-size:14px;vertical-align:top;">Message:</td><td style="padding:6px 0;color:#1a1a1a;font-size:14px;">${message}</td></tr>` : ""}
                </table>
              </div>

              <p style="color:#555;font-size:14px;margin:0 0 24px;">Please reach out to the customer to confirm the appointment.</p>

              <table role="presentation" style="width:100%;border-collapse:collapse;">
                <tr>
                  <td align="center" style="padding:8px 0;">
                    <a href="https://studio.aurezotech.com/leads" style="display:inline-block;padding:14px 28px;background-color:#0b6e4f;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;border-radius:6px;">
                      View Appointments
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:20px 40px;background-color:#fafafa;border-top:1px solid #eee;text-align:center;">
              <p style="color:#999;font-size:12px;margin:0;">Automated notification from Aurezo.<br>&copy; ${new Date().getFullYear()} Aurezo. All rights reserved.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    const subjectText = isMetalIq
      ? `New Metal IQ Appointment: ${customer_name} wants to book an appraisal`
      : `New Appointment: ${customer_name} wants to book a consultation`;

    // Owner + staff with Lead Email Notifications on + extra notification emails, de-duplicated.
    const recipients = await getLeadNotificationRecipients(supabase, client_id, client.email);
    if (!recipients.to) {
      console.log("No appointment notification recipients, skipping email.");
      return new Response(
        JSON.stringify({ success: true, message: "Notification skipped (no recipients)" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const emailResponse = await resend.emails.send({
      from: FROM_EMAIL,
      to: [recipients.to],
      ...(recipients.bcc.length > 0 ? { bcc: recipients.bcc } : {}),
      reply_to: REPLY_TO,
      subject: `📅 ${subjectText}`,
      html: emailHtml,
    });

    // Log the email
    await supabase.from("email_logs").insert(recipients.all.map((recipient) => ({
      to_email: recipient,
      email_type: "appointment_booking",
      subject: subjectText,
      status: "sent",
      resend_id: emailResponse.data?.id,
      metadata: { client_id, customer_name, customer_email, preferred_date, preferred_time, ...(isMetalIq ? { source } : {}) },
    })));

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
};

serve(handler);
