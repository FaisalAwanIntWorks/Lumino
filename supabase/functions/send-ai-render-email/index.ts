import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  loadCustomerBranding,
  renderEmailHeader,
  renderContactCta,
  POWERED_BY_AUREZO_FOOTER,
} from '../_shared/customer-email-branding.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const {
      client_id,
      customer_email,
      customer_name,
      image_urls,
      form_type,
    } = await req.json();

    if (!client_id || !customer_email || !image_urls?.length) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Check if client has explicitly disabled ai_render_email (default: ON)
    const { data: prefData } = await supabase
      .from('client_notification_preferences')
      .select('is_enabled')
      .eq('client_id', client_id)
      .eq('notification_type', 'ai_render_email')
      .maybeSingle();

    // Only skip if explicitly disabled (record exists and is_enabled === false)
    if (prefData && prefData.is_enabled === false) {
      return new Response(JSON.stringify({ skipped: true, reason: 'ai_render_email disabled' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Load client branding (logo + Contact CTA) for customer-facing email
    const branding = await loadCustomerBranding(supabase, client_id);
    const companyName = branding.companyName || 'Our Team';
    const firstName = customer_name?.split(' ')[0] || 'there';
    const headerCell = renderEmailHeader(branding);
    const ctaButton = renderContactCta(branding);

    // Build image rows
    const imageHtml = image_urls
      .map(
        (url: string, i: number) => `
        <tr>
          <td style="padding: 0 0 16px 0;">
            <img src="${url}" alt="AI Design Preview ${i + 1}" 
              style="width: 100%; max-width: 576px; border-radius: 8px; display: block;" />
          </td>
        </tr>`
      )
      .join('');

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="color-scheme" content="light only" />
  <meta name="supported-color-schemes" content="light only" />
  <title>Your AI Design Preview</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f5f5f5; font-family: Arial, Helvetica, sans-serif; -webkit-text-size-adjust: 100%;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f5;">
    <tr>
      <td align="center" style="padding: 24px 16px;">
        <table role="presentation" width="640" cellpadding="0" cellspacing="0" style="max-width: 640px; width: 100%; background-color: #ffffff; border-radius: 8px; overflow: hidden;">
          
          <!-- Brand Header (client logo) -->
          <tr>
            ${headerCell}
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding: 32px;">
              <h1 style="margin: 0 0 4px 0; font-size: 22px; font-weight: 800; color: #000000; text-align: center;">
                Your AI Design Preview
              </h1>
              <p style="margin: 0 0 24px 0; font-size: 14px; color: #666666; text-align: center;">
                from ${companyName}
              </p>

              <p style="margin: 0 0 24px 0; font-size: 15px; color: #333333; line-height: 1.5;">
                Hi ${firstName}, here's a preview of your custom design. Our team will be in touch shortly.
              </p>

              <!-- AI Images -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                ${imageHtml}
              </table>

              ${ctaButton}

              <p style="margin: 16px 0 0 0; font-size: 12px; color: #999999; text-align: center; font-style: italic;">
                These are rough AI-generated drafts. The final piece may differ.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 20px 32px; background-color: #fafafa; border-top: 1px solid #eeeeee;">
              <p style="margin: 0; font-size: 11px; color: #999999; text-align: center; line-height: 1.5;">
                Automated notification from ${companyName}.<br />
                This is an automated email generated by the system. Please do not reply to this email.
              </p>
              ${POWERED_BY_AUREZO_FOOTER}
            </td>
          </tr>


        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    // Send via Resend
    if (!resendApiKey) {
      console.error('RESEND_API_KEY not set');
      return new Response(JSON.stringify({ error: 'Email service not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const emailRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${resendApiKey}`,
      },
      body: JSON.stringify({
        from: `${companyName} <onboarding@resend.dev>`,
        to: [customer_email],
        subject: `Your AI Design Preview from ${companyName}`,
        html,
        reply_to: branding.replyTo || Deno.env.get("SUPPORT_EMAIL") || undefined,
      }),
    });

    const emailResult = await emailRes.json();

    if (!emailRes.ok) {
      console.error('Resend error:', emailResult);
      return new Response(JSON.stringify({ error: 'Failed to send email', details: emailResult }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Log to email_logs if table exists
    try {
      await supabase.from('email_logs').insert({
        client_id,
        recipient_email: customer_email,
        recipient_name: customer_name || null,
        email_type: 'ai_render_preview',
        template_name: 'ai-render-email',
        status: 'sent',
        metadata: { form_type, image_count: image_urls.length, resend_id: emailResult.id },
      });
    } catch (logErr) {
      console.warn('Email log insert failed (table may not exist):', logErr);
    }

    return new Response(JSON.stringify({ success: true, id: emailResult.id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('send-ai-render-email error:', err);
    return new Response(JSON.stringify({ error: 'Internal error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
