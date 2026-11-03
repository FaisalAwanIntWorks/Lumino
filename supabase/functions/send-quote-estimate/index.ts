import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  loadCustomerBranding,
  renderEmailHeader,
  renderContactCta,
  POWERED_BY_JEWLX_FOOTER,
} from "../_shared/customer-email-branding.ts";

const Resend = (await import("https://esm.sh/resend@2.0.0")).Resend;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const FROM_EMAIL = "JewlX <onboarding@resend.dev>";
const REPLY_TO = Deno.env.get("SUPPORT_EMAIL") || undefined;

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
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Authentication required" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Invalid authentication" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { leadId, leadSource, clientId, customerEmail, customerName, quoteAmount, currency = 'USD', message } = await req.json();

    if (!leadId || !clientId || !customerEmail || !quoteAmount) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validate email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(customerEmail) || customerEmail.length > 320) {
      return new Response(JSON.stringify({ error: "Invalid email format" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch client branding
    const { data: client } = await supabase
      .from('clients')
      .select('company_name, logo_url, email')
      .eq('id', clientId)
      .maybeSingle();

    // Customer-facing email: load branding (logo + Contact CTA + Powered-by)
    const branding = await loadCustomerBranding(supabase, clientId);
    const companyName = branding.companyName || client?.company_name || 'Your Jeweler';
    const replyTo = client?.email || REPLY_TO;
    const headerCell = renderEmailHeader(branding);
    const ctaButton = renderContactCta(branding);

    const formattedAmount = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      minimumFractionDigits: 0,
    }).format(Number(quoteAmount));

    // Build email HTML
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
          <h2 style="color:#333;margin:0 0 8px 0;font-size:20px;">Your Custom Quote</h2>
          <p style="color:#666;margin:0 0 24px 0;font-size:14px;">
            Hi ${customerName || 'there'},<br/>
            Thank you for your interest! Here's your personalized quote estimate:
          </p>
          
          <!-- Amount Box -->
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
            <tr><td style="background-color:#f9f9f9;border:1px solid #eee;border-radius:8px;padding:24px;text-align:center;">
              <p style="color:#888;margin:0 0 4px 0;font-size:12px;text-transform:uppercase;letter-spacing:1px;">Estimated Quote</p>
              <p style="color:#0b6e4f;margin:0;font-size:36px;font-weight:700;">${formattedAmount}</p>
            </td></tr>
          </table>

          ${message ? `
          <div style="background-color:#f9f9f9;border:1px solid #eee;border-radius:8px;padding:16px;margin-bottom:24px;">
            <p style="color:#888;margin:0 0 6px 0;font-size:12px;font-weight:600;">Message from ${companyName}:</p>
            <p style="color:#333;margin:0;font-size:14px;line-height:1.5;">${message}</p>
          </div>
          ` : ''}

          <p style="color:#666;font-size:13px;line-height:1.5;margin:0 0 24px 0;">
            This is an estimate based on your custom design preferences. Final pricing may vary based on current material costs and design complexity. Please reply to this email or contact us to discuss further.
          </p>

          <table width="100%" cellpadding="0" cellspacing="0">
            <tr><td align="center">
              <a href="mailto:${replyTo}" style="display:inline-block;background-color:#0b6e4f;color:#ffffff;padding:12px 32px;border-radius:6px;text-decoration:none;font-size:14px;font-weight:600;">
                Reply to ${companyName}
              </a>
            </td></tr>
          </table>
          ${ctaButton}
        </td></tr>

        <!-- Footer -->
        <tr><td style="padding:16px 32px;background-color:#fafafa;border-top:1px solid #eee;text-align:center;">
          <p style="color:#999;font-size:11px;margin:0;">
            This quote was sent by ${companyName}. This is an automated email — please do not reply directly to this address.
          </p>
          ${POWERED_BY_JEWLX_FOOTER}
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

    // Send email
    const resend = new Resend(resendApiKey);
    const emailResponse = await resend.emails.send({
      from: FROM_EMAIL,
      to: [customerEmail],
      subject: `Your Quote Estimate from ${companyName} — ${formattedAmount}`,
      html,
      reply_to: replyTo,
    });

    // Log the quote
    const { data: quoteData } = await supabase.from('lead_quote_history').insert({
      lead_id: leadId,
      lead_source: leadSource || 'unknown',
      client_id: clientId,
      customer_email: customerEmail,
      customer_name: customerName,
      quote_amount: quoteAmount,
      currency,
      message: message || null,
      status: 'sent',
    }).select('id').single();

    // Log email
    await supabase.from('email_logs').insert({
      recipient_email: customerEmail,
      email_type: 'quote_estimate',
      subject: `Your Quote Estimate from ${companyName}`,
      status: 'sent',
      resend_id: emailResponse?.data?.id,
      metadata: { lead_id: leadId, quote_amount: quoteAmount, currency },
    });

    return new Response(JSON.stringify({ success: true, quoteId: quoteData?.id }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    console.error("send-quote-estimate error:", error);
    const msg = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
