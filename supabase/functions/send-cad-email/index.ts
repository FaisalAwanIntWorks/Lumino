import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { logEmail } from "../_shared/email-log.ts";
import {
  getRequiredSecret,
  sanitizeErrorForClient,
  corsHeaders,
} from "../_shared/secrets-validation.ts";
import {
  loadCustomerBranding,
  renderEmailHeader,
  renderContactCta,
  POWERED_BY_AUREZO_FOOTER,
} from "../_shared/customer-email-branding.ts";

const Resend = (await import("https://esm.sh/resend@2.0.0")).Resend;

let resend: any;
try {
  const resendApiKey = getRequiredSecret("RESEND_API_KEY");
  resend = new Resend(resendApiKey);
} catch {
  console.error("RESEND_API_KEY not configured");
}

const FROM_EMAIL = "Aurezo <onboarding@resend.dev>";
const DEFAULT_REPLY_TO = Deno.env.get("SUPPORT_EMAIL") || undefined;

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    if (!resend) {
      return new Response(
        JSON.stringify({ error: "Email service not configured" }),
        { status: 503, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const supabaseUrl = getRequiredSecret("SUPABASE_URL");
    const supabaseServiceKey = getRequiredSecret("SUPABASE_SERVICE_ROLE_KEY");
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Require auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Authentication required" }),
        { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Invalid authentication" }),
        { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Check role
    const { data: role } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .in("role", ["agency_admin", "client", "staff"])
      .single();

    if (!role) {
      return new Response(
        JSON.stringify({ error: "Access denied" }),
        { status: 403, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const { emails, message, cad_file_url, order_number, product_name, ring_size } = await req.json();

    // Validate
    if (!emails || !Array.isArray(emails) || emails.length === 0) {
      return new Response(
        JSON.stringify({ error: "At least one email address is required" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    if (emails.length > 10) {
      return new Response(
        JSON.stringify({ error: "Maximum 10 email addresses allowed" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    for (const email of emails) {
      if (!emailRegex.test(email) || email.length > 320) {
        return new Response(
          JSON.stringify({ error: `Invalid email: ${email}` }),
          { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }
    }

    if (!cad_file_url) {
      return new Response(
        JSON.stringify({ error: "CAD file URL is required" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    if (message && message.length > 2000) {
      return new Response(
        JSON.stringify({ error: "Message exceeds maximum length" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Get sender info
    const { data: clientData } = await supabase
      .from("clients")
      .select("id, company_name, logo_url")
      .eq("user_id", user.id)
      .single();

    // If not a client owner, check staff
    let clientId: string | null = clientData?.id || null;
    let companyName = clientData?.company_name || "Aurezo";

    if (!clientData) {
      const { data: staffData } = await supabase
        .from("staff_members")
        .select("client_id, clients(id, company_name, logo_url)")
        .eq("user_id", user.id)
        .single();
      if (staffData?.clients) {
        const c = staffData.clients as any;
        clientId = c.id || staffData.client_id || null;
        companyName = c.company_name || "Aurezo";
      }
    }

    // Customer-facing email: load branding (logo + CTA + Powered-by)
    const branding = await loadCustomerBranding(supabase, clientId);
    if (branding.companyName) companyName = branding.companyName;
    const headerCell = renderEmailHeader(branding);
    const ctaButton = renderContactCta(branding);

    const sanitizedMessage = message
      ? message.replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br/>")
      : "";


    const displayOrder = order_number || "N/A";
    const displayProduct = product_name || "Ring";
    const displayRingSize = ring_size || "6";

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <meta name="color-scheme" content="light only"/>
  <meta name="supported-color-schemes" content="light only"/>
  <style>
    body { margin: 0; padding: 0; background-color: #f5f5f5; font-family: Arial, sans-serif; }
    [data-ogsc] .header-bg, .header-bg { background-color: #000000 !important; }
  </style>
</head>
<body style="margin:0;padding:0;background-color:#f5f5f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f5f5f5;padding:32px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:8px;overflow:hidden;">
        <!-- Header -->
        <tr>
          ${headerCell}
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:32px 24px;">
            <h1 style="margin:0 0 16px;font-size:22px;color:#000000;">Manufacture CAD File</h1>
            <p style="color:#55575d;font-size:14px;line-height:1.6;margin:0 0 16px;">
              You have been sent a manufacture CAD file from <strong>${companyName}</strong> for the following order:
            </p>
            <table width="100%" cellpadding="12" cellspacing="0" style="background-color:#f9f9f9;border:1px solid #eee;border-radius:6px;margin-bottom:20px;">
              <tr>
                <td style="color:#55575d;font-size:13px;border-bottom:1px solid #eee;">Order</td>
                <td style="font-weight:600;font-size:13px;border-bottom:1px solid #eee;">#${displayOrder}</td>
              </tr>
              <tr>
                <td style="color:#55575d;font-size:13px;border-bottom:1px solid #eee;">Product</td>
                <td style="font-weight:600;font-size:13px;border-bottom:1px solid #eee;">${displayProduct}</td>
              </tr>
              <tr>
                <td style="color:#55575d;font-size:13px;">Order Ring Size</td>
                <td style="font-weight:600;font-size:13px;">${displayRingSize}</td>
              </tr>
            </table>
            <div style="background-color:#fff8e1;border:1px solid #ffe082;border-radius:6px;padding:14px 16px;margin-bottom:20px;">
              <p style="margin:0;font-size:13px;color:#6d4c00;line-height:1.5;">
                <strong>Important:</strong> The ring size on this given CAD file is standardized at <strong>6</strong> and the carat size is standardized at <strong>3</strong>.
                If your order requires a different ring size, please contact us${DEFAULT_REPLY_TO ? ` at
                <a href="mailto:${DEFAULT_REPLY_TO}" style="color:#0b6e4f;font-weight:600;">${DEFAULT_REPLY_TO}</a>` : ""}
                to request a modification.
              </p>
            </div>
            ${sanitizedMessage ? `
            <div style="background-color:#f9f9f9;border:1px solid #eee;border-radius:6px;padding:16px;margin-bottom:20px;">
              <p style="margin:0 0 4px;font-size:12px;color:#888;font-weight:600;">MESSAGE:</p>
              <p style="margin:0;font-size:14px;color:#333;line-height:1.5;">${sanitizedMessage}</p>
            </div>` : ""}
            <table cellpadding="0" cellspacing="0" style="margin:0 auto;">
              <tr>
                <td style="background-color:#0b6e4f;border-radius:6px;padding:14px 32px;text-align:center;">
                  <a href="${cad_file_url}" target="_blank" style="color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;">
                    Download CAD File
                  </a>
                </td>
              </tr>
            </table>
            ${ctaButton}
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="padding:16px 24px;border-top:1px solid #eee;text-align:center;">
            <p style="margin:0;font-size:11px;color:#999;">
              This is an automated email generated by the system. Please do not reply to this email.
            </p>
            ${POWERED_BY_AUREZO_FOOTER}
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

    const subject = `Manufacture CAD File – Order #${displayOrder} | ${companyName}`;

    // Send to all recipients
    const results = [];
    for (const to of emails) {
      try {
        const res = await resend.emails.send({
          from: FROM_EMAIL,
          to: [to],
          subject,
          html,
          reply_to: branding.replyTo || DEFAULT_REPLY_TO,
        });
        // The SDK reports an API rejection in `error` instead of throwing.
        const accepted = !res.error && !!res.data?.id;
        results.push({ email: to, success: accepted, id: res.data?.id });
        await logEmail(supabase, {
          to, emailType: "cad_file_email", subject, ok: accepted,
          resendId: res.data?.id ?? null,
          error: res.error ? String((res.error as { message?: string }).message ?? res.error) : null,
          metadata: { order: displayOrder },
        });
      } catch (e) {
        console.error(`Failed to send to ${to.substring(0, 3)}***`);
        results.push({ email: to, success: false });
        await logEmail(supabase, {
          to, emailType: "cad_file_email", subject, ok: false,
          error: e instanceof Error ? e.message : String(e),
          metadata: { order: displayOrder },
        });
      }
    }

    console.log("CAD emails sent:", { count: emails.length, order: displayOrder });

    return new Response(
      JSON.stringify({ success: true, results }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: unknown) {
    const safeMessage = sanitizeErrorForClient(error, "Failed to send CAD file email");
    return new Response(
      JSON.stringify({ error: safeMessage }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
});
