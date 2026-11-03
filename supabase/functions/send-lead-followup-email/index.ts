import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  loadCustomerBranding,
  renderEmailHeader,
  renderContactCta,
  POWERED_BY_JEWLX_FOOTER,
} from "../_shared/customer-email-branding.ts";
import { escapeHtml } from "../_shared/security-utils.ts";
import { denyReadOnlyAdmin } from "../_shared/admin-access.ts";

const Resend = (await import("https://esm.sh/resend@2.0.0")).Resend;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Mail can only leave from our verified sending domain, so the client shows up
// as the sender name and every reply goes straight to the client's own inbox.
const SENDER_ADDRESS = "onboarding@resend.dev";
const MAX_MESSAGE_LENGTH = 5000;

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (!resendApiKey) throw new Error("RESEND_API_KEY not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Authentication required" }, 401);
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return json({ error: "Invalid authentication" }, 401);

    const denied = await denyReadOnlyAdmin(req, corsHeaders);
    if (denied) return denied;

    const { leadId, clientId, customerEmail, customerName, message } = await req.json();
    const trimmedMessage = typeof message === "string" ? message.trim() : "";

    if (!leadId || !clientId || !customerEmail || !trimmedMessage) {
      return json({ error: "Missing required fields" }, 400);
    }
    if (trimmedMessage.length > MAX_MESSAGE_LENGTH) {
      return json({ error: `Message is too long (max ${MAX_MESSAGE_LENGTH} characters)` }, 400);
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(customerEmail) || customerEmail.length > 320) {
      return json({ error: "Invalid email format" }, 400);
    }

    // Auth check: user must be admin, client owner, or staff of client
    const { data: isAdmin } = await supabase.rpc("has_role", {
      _user_id: user.id,
      _role: "agency_admin",
    });

    if (!isAdmin) {
      const { data: ownedClient } = await supabase
        .from("clients")
        .select("id")
        .eq("id", clientId)
        .eq("user_id", user.id)
        .maybeSingle();

      if (!ownedClient) {
        const { data: isStaff } = await supabase.rpc("is_staff_of_client", {
          _user_id: user.id,
          _client_id: clientId,
        });
        if (!isStaff) return json({ error: "Forbidden" }, 403);
      }
    }

    const { data: client } = await supabase
      .from("clients")
      .select("company_name, email")
      .eq("id", clientId)
      .maybeSingle();

    if (!client?.email) {
      return json({ error: "This account has no email address to send from" }, 400);
    }

    // Customer-facing email: load branding (logo + Contact CTA + Powered-by)
    const branding = await loadCustomerBranding(supabase, clientId);
    const companyName = branding.companyName || client.company_name || "Your Jeweler";
    const headerCell = renderEmailHeader(branding);
    const ctaButton = renderContactCta(branding);

    // Strip anything that could break out of the From display name
    const senderName = companyName.replace(/[\r\n"<>]/g, "").trim() || "Your Jeweler";
    const subject = `A message from ${senderName}`;

    const safeCompany = escapeHtml(companyName);
    const safeName = escapeHtml((customerName || "").toString().trim()) || "there";
    const safeMessage = escapeHtml(trimmedMessage).replace(/\r?\n/g, "<br/>");
    const safeReplyTo = escapeHtml(client.email);

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light only">
  <meta name="supported-color-schemes" content="light only">
  <style>
    body { margin: 0; padding: 0; background-color: #f5f5f5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
  </style>
</head>
<body style="margin:0;padding:0;background-color:#f5f5f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f5f5f5;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
        <!-- Header -->
        <tr>${headerCell}</tr>

        <!-- Body -->
        <tr><td style="padding:32px;">
          <p style="color:#666;margin:0 0 20px 0;font-size:14px;">Hi ${safeName},</p>

          <div style="background-color:#f9f9f9;border:1px solid #eee;border-radius:8px;padding:16px;margin-bottom:24px;">
            <p style="color:#888;margin:0 0 6px 0;font-size:12px;font-weight:600;">Message from ${safeCompany}:</p>
            <p style="color:#333;margin:0;font-size:14px;line-height:1.6;">${safeMessage}</p>
          </div>

          <table width="100%" cellpadding="0" cellspacing="0">
            <tr><td align="center">
              <a href="mailto:${safeReplyTo}" style="display:inline-block;background-color:#0b6e4f;color:#ffffff;padding:12px 32px;border-radius:6px;text-decoration:none;font-size:14px;font-weight:600;">
                Reply to ${safeCompany}
              </a>
            </td></tr>
          </table>
          ${ctaButton}
        </td></tr>

        <!-- Footer -->
        <tr><td style="padding:16px 32px;background-color:#fafafa;border-top:1px solid #eee;text-align:center;">
          <p style="color:#999;font-size:11px;margin:0;">
            This message was sent by ${safeCompany}. Replies go directly to ${safeReplyTo}.
          </p>
          ${POWERED_BY_JEWLX_FOOTER}
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

    const resend = new Resend(resendApiKey);
    const emailResponse = await resend.emails.send({
      from: `${senderName} <${SENDER_ADDRESS}>`,
      to: [customerEmail],
      subject,
      html,
      text: `Hi ${(customerName || "").toString().trim() || "there"},\n\n${trimmedMessage}\n\n— ${companyName}\nReply to: ${client.email}`,
      reply_to: client.email,
    });

    const sendError = emailResponse?.error;

    // Log email (shows up in the lead's Email History)
    await supabase.from("email_logs").insert({
      recipient_email: customerEmail,
      email_type: "lead_follow_up",
      subject,
      status: sendError ? "failed" : "sent",
      resend_id: emailResponse?.data?.id ?? null,
      error_message: sendError ? (sendError.message || "Email provider rejected the message") : null,
      metadata: { lead_id: leadId, client_id: clientId, reply_to: client.email, sent_by: user.id },
    });

    if (sendError) {
      console.error("send-lead-followup-email resend error:", sendError);
      return json({ error: sendError.message || "Failed to send email" }, 502);
    }

    return json({ success: true, replyTo: client.email }, 200);
  } catch (error: unknown) {
    console.error("send-lead-followup-email error:", error);
    const msg = error instanceof Error ? error.message : "Unknown error";
    return json({ error: msg }, 500);
  }
});
