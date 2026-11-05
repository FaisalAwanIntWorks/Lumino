import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { escapeHtml } from "../_shared/security-utils.ts";
import {
  loadCustomerBranding,
  renderEmailHeader,
  renderContactCta,
  POWERED_BY_AUREZO_FOOTER,
} from "../_shared/customer-email-branding.ts";

const Resend = (await import("https://esm.sh/resend@2.0.0")).Resend;
const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DEFAULT_REPLY_TO = Deno.env.get("SUPPORT_EMAIL") || undefined;

const FORM_TYPE_LABELS: Record<string, string> = {
  ring_builder: "Ring Builder",
  grillz: "Grillz Builder",
  custom_enquiry: "Custom Enquiry",
  widget: "Design",
  order: "Order & Deposit",
  instant_quote: "Instant Quote",
};

interface CustomerConfirmationRequest {
  client_id: string;
  form_type: "ring_builder" | "grillz" | "custom_enquiry" | "widget" | "order" | "instant_quote";
  customer_name: string;
  customer_email: string;
  details: Record<string, string>;
  /** Optional pre-formatted headline figure (e.g. "$4,250") shown as an estimate block. */
  estimate_amount?: string | null;
  /** Quote Estimator diamond picker: the exact stone the customer chose, with its certificate. */
  selected_diamond?: SelectedDiamondBlock | null;
  /** Quote Estimator V3 gemstone picker: the exact gemstone the customer chose, with its details. */
  selected_gemstone?: SelectedGemstoneBlock | null;
}

interface SelectedGemstoneBlock {
  /** e.g. "1.83 ct Blue Aquamarine · Emerald · Faceted" */
  label: string;
  /** Already formatted, e.g. "$320" */
  price?: string | null;
  /** Label → value rows (Carat, Color, Clarity, Cut, Shape, Origin, Treatment, Lab, Measurements, Report No, Stock ID). */
  details?: Record<string, string> | null;
  /** Stone picture URL. */
  image?: string | null;
  /** 360° video URL. */
  video?: string | null;
  /** Certificate PDF URL. */
  pdf?: string | null;
}

interface SelectedDiamondBlock {
  /** e.g. "Natural · 1.51 ct L Color VS1" */
  label: string;
  /** Already formatted, e.g. "$2,057" */
  price?: string | null;
  /** e.g. "GIA 1234567890" */
  certificate?: string | null;
  lab?: string | null;
  report_no?: string | null;
  /** Certificate PDF URL. */
  pdf?: string | null;
}

/** Block for the exact diamond picked on the Quote Estimator. The stone price is exact, so it is shown for natural and lab alike. */
function buildSelectedDiamondBlock(d: SelectedDiamondBlock | null | undefined, showPrice = true): string {
  if (!d || !d.label) return "";
  const pdfHref = typeof d.pdf === "string" && /^https?:\/\//i.test(d.pdf) ? escapeHtml(d.pdf) : "";
  const certificate = d.certificate || [d.lab, d.report_no].filter(Boolean).join(" ");
  return `<div style="background-color:#f9f9f9;border:1px solid #eee;border-radius:6px;padding:20px;margin-bottom:20px;">
           <p style="margin:0 0 12px;color:#1a1a1a;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Your Selected Diamond</p>
           <table style="width:100%;border-collapse:collapse;">
             <tr><td style="padding:6px 0;color:#777;font-size:14px;width:140px;vertical-align:top;">Diamond</td><td style="padding:6px 0;color:#1a1a1a;font-size:14px;font-weight:600;">${escapeHtml(d.label)}</td></tr>
             ${showPrice && d.price ? `<tr><td style="padding:6px 0;color:#777;font-size:14px;vertical-align:top;">Diamond Price</td><td style="padding:6px 0;color:#1a1a1a;font-size:14px;font-weight:600;">${escapeHtml(String(d.price))}</td></tr>` : ""}
             ${certificate ? `<tr><td style="padding:6px 0;color:#777;font-size:14px;vertical-align:top;">Certificate</td><td style="padding:6px 0;color:#1a1a1a;font-size:14px;font-weight:500;">${escapeHtml(certificate)}</td></tr>` : ""}
             ${pdfHref ? `<tr><td style="padding:6px 0;color:#777;font-size:14px;vertical-align:top;">Certificate PDF</td><td style="padding:6px 0;font-size:14px;"><a href="${pdfHref}" target="_blank" rel="noopener noreferrer" style="color:#0b6e4f;text-decoration:underline;font-weight:600;">View certificate</a></td></tr>` : ""}
           </table>
         </div>`;
}

const safeHttpUrl = (u: unknown) => (typeof u === "string" && /^https?:\/\//i.test(u) ? escapeHtml(u) : "");

function buildSelectedGemstoneBlock(g: SelectedGemstoneBlock | null | undefined, showPrice = true): string {
  if (!g || !g.label) return "";
  const image = safeHttpUrl(g.image);
  const video = safeHttpUrl(g.video);
  const pdf = safeHttpUrl(g.pdf);
  const rows = Object.entries(g.details || {})
    .filter(([k, v]) => k && typeof v === "string" && v.trim())
    .map(([k, v]) => `<tr><td style="padding:5px 0;color:#777;font-size:13px;width:120px;vertical-align:top;">${escapeHtml(k)}</td><td style="padding:5px 0;color:#1a1a1a;font-size:13px;font-weight:500;">${escapeHtml(v)}</td></tr>`)
    .join("");
  const links = [
    video ? `<a href="${video}" target="_blank" rel="noopener noreferrer" style="color:#0b6e4f;text-decoration:underline;font-weight:600;">View video</a>` : "",
    pdf ? `<a href="${pdf}" target="_blank" rel="noopener noreferrer" style="color:#0b6e4f;text-decoration:underline;font-weight:600;">View certificate</a>` : "",
  ].filter(Boolean).join("&nbsp;&middot;&nbsp;");
  return `<div style="background-color:#f9f9f9;border:1px solid #eee;border-radius:6px;padding:20px;margin-bottom:20px;">
           <p style="margin:0 0 12px;color:#1a1a1a;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Your Selected Gemstone</p>
           <table style="width:100%;border-collapse:collapse;">
             <tr>
               ${image ? `<td style="width:96px;padding:0 14px 0 0;vertical-align:top;"><img src="${image}" alt="" width="96" height="96" style="display:block;width:96px;height:96px;object-fit:cover;border-radius:6px;border:1px solid #eee;" /></td>` : ""}
               <td style="vertical-align:top;">
                 <p style="margin:0 0 4px;color:#1a1a1a;font-size:15px;font-weight:600;">${escapeHtml(g.label)}</p>
                 ${showPrice && g.price ? `<p style="margin:0 0 8px;color:#1a1a1a;font-size:14px;font-weight:600;">${escapeHtml(String(g.price))}</p>` : ""}
                 ${rows ? `<table style="width:100%;border-collapse:collapse;">${rows}</table>` : ""}
                 ${links ? `<p style="margin:8px 0 0;font-size:13px;">${links}</p>` : ""}
               </td>
             </tr>
           </table>
         </div>`;
}

function renderValueWithImageLinks(value: string): string {
  const urlRegex = /https?:\/\/[^\s,]+/gi;
  const urls = value.match(urlRegex) || [];
  const nonUrlText = value.replace(urlRegex, "").replace(/[,\s]+/g, " ").trim();
  if (urls.length === 0) return escapeHtml(value);
  const linkLabel = "Uploaded Inspiration Image";
  const links = urls
    .map((u, i) => {
      const safeHref = escapeHtml(u);
      const label = urls.length > 1 ? `${linkLabel} ${i + 1}` : linkLabel;
      return `<a href="${safeHref}" target="_blank" rel="noopener noreferrer" style="color:#0b6e4f;text-decoration:underline;font-weight:600;">${label}</a>`;
    })
    .join("&nbsp;&middot;&nbsp;");
  return nonUrlText ? `${escapeHtml(nonUrlText)} ${links}` : links;
}

function buildDetailRows(details: Record<string, string>): string {
  return Object.entries(details)
    .filter(([_, v]) => v && v.trim())
    .map(
      ([key, value]) =>
        `<tr><td style="padding:6px 0;color:#777;font-size:14px;width:140px;vertical-align:top;">${escapeHtml(key)}</td><td style="padding:6px 0;color:#1a1a1a;font-size:14px;font-weight:500;">${renderValueWithImageLinks(value)}</td></tr>`
    )
    .join("");
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
      form_type,
      customer_name,
      customer_email,
      details,
      estimate_amount,
      diamond_type,
      selected_diamond,
      selected_gemstone,
    }: CustomerConfirmationRequest & { diamond_type?: string | null } = await req.json();

    if (!customer_email || !form_type) {
      return new Response(
        JSON.stringify({ error: "customer_email and form_type are required" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Client-controlled switch: jewelers whose CRM already emails the customer
    // can turn the Aurezo confirmation off. Default is ON when no row exists.
    if (client_id) {
      const { data: pref } = await supabase
        .from("client_notification_preferences")
        .select("is_enabled")
        .eq("client_id", client_id)
        .eq("notification_type", "customer_confirmation_email")
        .maybeSingle();
      if (pref && pref.is_enabled === false) {
        console.log("Customer confirmation disabled by client, skipping.");
        return new Response(
          JSON.stringify({ success: true, message: "Skipped (disabled by client)" }),
          { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }

      // Granular per-form switch: e.g. customer_confirmation_instant_quote.
      // Falls back to the master switch above when no form-specific row exists.
      const formKey = `customer_confirmation_${form_type}`;
      const { data: formPref } = await supabase
        .from("client_notification_preferences")
        .select("is_enabled")
        .eq("client_id", client_id)
        .eq("notification_type", formKey)
        .maybeSingle();
      if (formPref && formPref.is_enabled === false) {
        console.log(`Customer confirmation disabled for form ${form_type}, skipping.`);
        return new Response(
          JSON.stringify({ success: true, message: "Skipped (disabled for this form)" }),
          { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }
    }

    // Load client branding (logo + Contact CTA) for customer-facing email
    const branding = await loadCustomerBranding(supabase, client_id);

    const companyName = branding.companyName || "Your Jeweler";
    const formLabel = FORM_TYPE_LABELS[form_type] || form_type;
    const firstName = customer_name ? customer_name.split(" ")[0] : "there";
    // G1: escape user-controlled values before HTML interpolation
    const safeCompanyName = escapeHtml(companyName);
    const safeFirstName = escapeHtml(firstName);

    const detailRows = buildDetailRows(details);
    const hasDetails = detailRows.length > 0;
    const estimateBlock = diamond_type !== "natural" && estimate_amount && String(estimate_amount).trim()
      ? `<div style="background-color:#0b6e4f;border-radius:6px;padding:18px 20px;margin-bottom:20px;text-align:center;">
           <p style="margin:0 0 4px;color:#cdeade;font-size:12px;text-transform:uppercase;letter-spacing:1px;">Your Estimate</p>
           <p style="margin:0;color:#ffffff;font-size:28px;font-weight:700;">${escapeHtml(String(estimate_amount))}</p>
           <p style="margin:6px 0 0;color:#cdeade;font-size:11px;">Indicative only — final pricing is confirmed by our team.</p>
         </div>`
      : "";
    const headerCell = renderEmailHeader(branding);
    const ctaButton = renderContactCta(branding);


    const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light only">
  <meta name="supported-color-schemes" content="light only">
  <style>
    :root { color-scheme: light only; }
    @media (prefers-color-scheme: dark) {
      .email-header-dark { background-color: #000000 !important; }
      .email-header-light { background-color: #ffffff !important; }
      .email-wrapper { background-color: #f5f5f5 !important; }
      .email-card { background-color: #ffffff !important; }
    }
    [data-ogsc] .email-header-dark { background-color: #000000 !important; }
    [data-ogsc] .email-header-light { background-color: #ffffff !important; }
  </style>
</head>
<body style="margin:0;padding:0;background-color:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
  <table role="presentation" style="width:100%;border-collapse:collapse;">
    <tr>
      <td align="center" style="padding:40px 20px;">
        <table role="presentation" style="width:100%;max-width:560px;border-collapse:collapse;background-color:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
          <tr>
            ${headerCell}
          </tr>
          <tr>
            <td style="padding:32px 24px;">
              <h2 style="margin:0 0 8px;color:#1a1a1a;font-size:22px;font-weight:600;">We've Received Your ${formLabel} Request</h2>
              <p style="margin:0 0 24px;color:#555;font-size:15px;line-height:1.6;">
                Hi ${safeFirstName}, thank you for submitting your ${formLabel.toLowerCase()} enquiry with <strong>${safeCompanyName}</strong>. Your request has been received and our team will review it shortly.
              </p>
              <p style="margin:0 0 24px;color:#555;font-size:15px;line-height:1.6;">
                A member of our team will be in touch with you soon to discuss the next steps.
              </p>
              ${estimateBlock}
              ${buildSelectedDiamondBlock(selected_diamond)}
              ${buildSelectedGemstoneBlock(selected_gemstone)}
              ${hasDetails ? `
              <!-- Submission Summary -->
              <div style="background-color:#f9f9f9;border:1px solid #eee;border-radius:6px;padding:20px;margin-bottom:20px;">
                <p style="margin:0 0 12px;color:#1a1a1a;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Your Submission Summary</p>
                <table style="width:100%;border-collapse:collapse;">${detailRows}</table>
              </div>` : ""}
              ${ctaButton}
              <p style="margin:16px 0 0;color:#777;font-size:13px;text-align:center;">This is an automated email generated by the system. Please do not reply to this email.</p>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 24px;background-color:#fafafa;border-top:1px solid #eee;">
              <p style="margin:0;color:#999;font-size:12px;text-align:center;">
                This is an automated confirmation from ${safeCompanyName}.<br>&copy; ${new Date().getFullYear()} ${safeCompanyName}. All rights reserved.
              </p>
              ${POWERED_BY_AUREZO_FOOTER}

            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `;

    const subject = `Your ${formLabel} Request Has Been Received — ${companyName}`;
    const fromEmail = `${companyName} via Aurezo <onboarding@resend.dev>`;

    const emailResponse = await resend.emails.send({
      from: fromEmail,
      to: [customer_email],
      subject,
      html: emailHtml,
      reply_to: branding.replyTo || DEFAULT_REPLY_TO,
    });

    console.log("Customer confirmation email sent:", emailResponse);

    await supabase.from("email_logs").insert({
      recipient_email: customer_email,
      email_type: "customer_confirmation",
      subject,
      status: "sent",
      resend_id: emailResponse.data?.id,
      metadata: { client_id, form_type, customer_name },
    });

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: any) {
    console.error("Error in notify-customer-confirmation:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Failed to send confirmation" }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
