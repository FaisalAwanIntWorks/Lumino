import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getLeadNotificationRecipients } from "../_shared/lead-notification-recipients.ts";

const Resend = (await import("https://esm.sh/resend@2.0.0")).Resend;
const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// A6: From / Reply-To are now derived per-jeweler. Defaults preserve current
// behaviour when client.company_name / client.email are missing.
const DEFAULT_FROM_NAME = "Aurezo";
const FROM_ADDRESS = "onboarding@resend.dev";
const DEFAULT_REPLY_TO = Deno.env.get("SUPPORT_EMAIL") || undefined;

// G1: Escape user-supplied strings before embedding in HTML to prevent
// HTML-injection in email clients that do render markup.
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

function escapeFromName(name: string): string {
  // Strip characters that would break the RFC 5322 display-name format.
  return name.replace(/["\\<>]/g, "").trim();
}

function buildFromHeader(companyName?: string | null): string {
  const trimmed = companyName ? escapeFromName(companyName) : "";
  const display = trimmed ? `${trimmed} via ${DEFAULT_FROM_NAME}` : DEFAULT_FROM_NAME;
  return `${display} <${FROM_ADDRESS}>`;
}

// G4: Aurezo-internal hosts are always trusted regardless of allowed_domains.
const AUREZO_TRUSTED_HOSTS = [
  "studio.aurezotech.com",
  "studioadmin.aurezotech.com",
  "widget.aurezotech.com",
  "aurezotech.com",
  "localhost",
];

/**
 * Validates the request Origin/Referer against the client's allowed_domains.
 * Non-blocking: if no allowed_domains are configured the request passes through
 * so existing clients aren't broken. Returns a 403 Response when a configured
 * domain list actively rejects the origin; returns null to allow.
 */
async function validateRequestOrigin(
  supabase: any,
  clientId: string,
  req: Request,
  corsHeaders: Record<string, string>,
): Promise<Response | null> {
  const origin = req.headers.get("origin") || req.headers.get("referer") || "";
  if (!origin) return null; // no origin header — allow (server-to-server calls)

  let originHost = "";
  try { originHost = new URL(origin).hostname; } catch { return null; }

  if (AUREZO_TRUSTED_HOSTS.some(h => originHost === h || originHost.endsWith(`.${h}`))) {
    return null;
  }

  const { data: brandingData, error: brandingError } = await supabase
    .from("client_branding")
    .select("allowed_domains")
    .eq("id", clientId)
    .maybeSingle();

  // Fail closed: a failed lookup must not be read as "no restrictions configured".
  if (brandingError) {
    console.error(`notify-form-lead: branding lookup failed for client ${clientId}`, brandingError);
    return new Response(
      JSON.stringify({ error: "Unable to verify allowed domains" }),
      { status: 503, headers: { "Content-Type": "application/json", ...corsHeaders } },
    );
  }

  const allowedDomains: string[] = (brandingData?.allowed_domains as string[] | null) || [];
  if (allowedDomains.length === 0) return null; // no list configured — passthrough

  const isAllowed = allowedDomains.some((d) => {
    try {
      const domainHost = new URL(d.startsWith("http") ? d : `https://${d}`).hostname;
      return originHost === domainHost || originHost.endsWith(`.${domainHost}`);
    } catch { return false; }
  });

  if (!isAllowed) {
    console.warn(`notify-form-lead: origin '${origin}' not in allowed_domains for client ${clientId}`);
    return new Response(
      JSON.stringify({ error: "Unauthorized origin" }),
      { status: 403, headers: { "Content-Type": "application/json", ...corsHeaders } },
    );
  }
  return null;
}

const FORM_TYPE_LABELS: Record<string, string> = {
  ring_builder: "Ring Builder",
  grillz: "Grillz Builder",
  custom_enquiry: "Custom Enquiry",
  instant_quote: "Instant Quote",
};

interface FormLeadRequest {
  client_id: string;
  form_type: "ring_builder" | "grillz" | "custom_enquiry" | "instant_quote";
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  details: Record<string, string>;
  /** Optional headline figure (already formatted, e.g. "$4,250") shown as a highlighted estimate block. */
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

/** Highlighted block for the exact diamond picked on the Quote Estimator. */
function buildSelectedDiamondBlock(d: SelectedDiamondBlock | null | undefined): string {
  if (!d || !d.label) return "";
  const pdfHref = typeof d.pdf === "string" && /^https?:\/\//i.test(d.pdf) ? escapeHtml(d.pdf) : "";
  const certificate = d.certificate || [d.lab, d.report_no].filter(Boolean).join(" ");
  return `<div style="background-color:#f9f9f9;border:1px solid #eee;border-radius:6px;padding:20px;margin-bottom:20px;">
           <p style="margin:0 0 12px;color:#1a1a1a;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Selected Diamond</p>
           <table style="width:100%;border-collapse:collapse;">
             <tr><td style="padding:6px 0;color:#777;font-size:14px;width:120px;vertical-align:top;">Diamond</td><td style="padding:6px 0;color:#1a1a1a;font-size:14px;font-weight:600;">${escapeHtml(d.label)}</td></tr>
             ${d.price ? `<tr><td style="padding:6px 0;color:#777;font-size:14px;vertical-align:top;">Diamond Price</td><td style="padding:6px 0;color:#1a1a1a;font-size:14px;font-weight:600;">${escapeHtml(String(d.price))}</td></tr>` : ""}
             ${certificate ? `<tr><td style="padding:6px 0;color:#777;font-size:14px;vertical-align:top;">Certificate</td><td style="padding:6px 0;color:#1a1a1a;font-size:14px;font-weight:500;">${escapeHtml(certificate)}</td></tr>` : ""}
             ${pdfHref ? `<tr><td style="padding:6px 0;color:#777;font-size:14px;vertical-align:top;">Certificate PDF</td><td style="padding:6px 0;font-size:14px;"><a href="${pdfHref}" target="_blank" rel="noopener noreferrer" style="color:#0b6e4f;text-decoration:underline;font-weight:600;">View certificate</a></td></tr>` : ""}
           </table>
         </div>`;
}

const safeHttpUrl = (u: unknown) => (typeof u === "string" && /^https?:\/\//i.test(u) ? escapeHtml(u) : "");

function buildSelectedGemstoneBlock(g: SelectedGemstoneBlock | null | undefined): string {
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
           <p style="margin:0 0 12px;color:#1a1a1a;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Selected Gemstone</p>
           <table style="width:100%;border-collapse:collapse;">
             <tr>
               ${image ? `<td style="width:96px;padding:0 14px 0 0;vertical-align:top;"><img src="${image}" alt="" width="96" height="96" style="display:block;width:96px;height:96px;object-fit:cover;border-radius:6px;border:1px solid #eee;" /></td>` : ""}
               <td style="vertical-align:top;">
                 <p style="margin:0 0 4px;color:#1a1a1a;font-size:15px;font-weight:600;">${escapeHtml(g.label)}</p>
                 ${g.price ? `<p style="margin:0 0 8px;color:#1a1a1a;font-size:14px;font-weight:600;">${escapeHtml(String(g.price))}</p>` : ""}
                 ${rows ? `<table style="width:100%;border-collapse:collapse;">${rows}</table>` : ""}
                 ${links ? `<p style="margin:8px 0 0;font-size:13px;">${links}</p>` : ""}
               </td>
             </tr>
           </table>
         </div>`;
}

// Detects http(s) URLs (single URL value or comma/whitespace-separated list)
// and renders them as opaque "Your Inspiration Image" links so the raw storage
// URL is never exposed in the email body.
function renderValueWithImageLinks(key: string, value: string): string {
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
        `<tr><td style="padding:6px 0;color:#777;font-size:14px;width:120px;vertical-align:top;">${escapeHtml(key)}</td><td style="padding:6px 0;color:#1a1a1a;font-size:14px;font-weight:500;">${renderValueWithImageLinks(key, value)}</td></tr>`
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
      customer_phone,
      details,
      estimate_amount,
      selected_diamond,
      selected_gemstone,
    }: FormLeadRequest = await req.json();

    if (!client_id || !form_type || !customer_name || !customer_email) {
      return new Response(
        JSON.stringify({ error: "client_id, form_type, customer_name, and customer_email are required" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Get client details
    const { data: client, error: clientError } = await supabase
      .from("clients")
      .select("email, company_name")
      .eq("id", client_id)
      .maybeSingle();

    if (clientError || !client) {
      console.error("Error fetching client:", clientError);
      return new Response(
        JSON.stringify({ error: "Client not found" }),
        { status: 404, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // G4: Validate request origin against client's allowed_domains (non-blocking
    // when no domains are configured so existing clients aren't broken).
    const originBlock = await validateRequestOrigin(supabase, client_id, req, corsHeaders);
    if (originBlock) return originBlock;

    // Check notification preferences
    const { data: notifPref } = await supabase
      .from("client_notification_preferences")
      .select("is_enabled")
      .eq("client_id", client_id)
      .eq("notification_type", "new_lead")
      .maybeSingle();

    const jewelerOptedOut = !!notifPref && notifPref.is_enabled === false;
    if (jewelerOptedOut) {
      console.log("Client has disabled new_lead notifications, skipping email.");
      return new Response(
        JSON.stringify({ success: true, message: "Notification skipped (disabled by client)" }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }


    const formLabel = FORM_TYPE_LABELS[form_type] || form_type;
    // G1: Escape all user-supplied display values used inside the HTML email body.
    const safeCustomerName = escapeHtml(customer_name);
    const safeCustomerEmail = escapeHtml(customer_email);
    const safeCustomerPhone = customer_phone ? escapeHtml(customer_phone) : "Not provided";

    const currentDate = new Date().toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

    const detailRows = buildDetailRows(details);
    const hasDetails = detailRows.length > 0;

    // Highlighted estimate block (Instant Quote and any future form that sends one).
    const estimateBlock = estimate_amount && String(estimate_amount).trim()
      ? `<div style="background-color:#0b6e4f;border-radius:6px;padding:18px 20px;margin-bottom:20px;text-align:center;">
           <p style="margin:0 0 4px;color:#cdeade;font-size:12px;text-transform:uppercase;letter-spacing:1px;">Quote Estimate</p>
           <p style="margin:0;color:#ffffff;font-size:28px;font-weight:700;">${escapeHtml(String(estimate_amount))}</p>
         </div>`
      : "";

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
      .email-header { background-color: #000000 !important; }
      .email-wrapper { background-color: #f5f5f5 !important; }
      .email-card { background-color: #ffffff !important; }
    }
    [data-ogsc] .email-header { background-color: #000000 !important; }
  </style>
</head>
<body style="margin:0;padding:0;background-color:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
  <table role="presentation" style="width:100%;border-collapse:collapse;">
    <tr>
      <td align="center" style="padding:40px 20px;">
        <table role="presentation" style="width:100%;max-width:560px;border-collapse:collapse;background-color:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
          <tr>
            <td class="email-header" style="padding:28px 24px 20px;text-align:center;background-color:#000000;">
              <img src="https://studio.aurezotech.com/images/aurezo-email-logo.png" alt="Aurezo" style="height:56px;" />
            </td>
          </tr>
          <tr>
            <td style="padding:32px 24px;">
              <h2 style="margin:0 0 8px;color:#1a1a1a;font-size:22px;font-weight:600;">New ${formLabel} Lead</h2>
              <p style="margin:0 0 24px;color:#777;font-size:13px;">${currentDate}</p>
              <p style="margin:0 0 24px;color:#555;font-size:15px;line-height:1.6;">
                A customer just submitted a ${formLabel.toLowerCase()} enquiry on your widget.
              </p>
              ${estimateBlock}
              ${buildSelectedDiamondBlock(selected_diamond)}
              ${buildSelectedGemstoneBlock(selected_gemstone)}
              <!-- Customer Info -->
              <div style="background-color:#f9f9f9;border:1px solid #eee;border-radius:6px;padding:20px;margin-bottom:20px;">
                <p style="margin:0 0 12px;color:#1a1a1a;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Customer Information</p>
                <table style="width:100%;border-collapse:collapse;">
                  <tr><td style="padding:6px 0;color:#777;font-size:14px;width:80px;">Name</td><td style="padding:6px 0;color:#1a1a1a;font-size:14px;font-weight:600;">${safeCustomerName}</td></tr>
                  <tr><td style="padding:6px 0;color:#777;font-size:14px;">Email</td><td style="padding:6px 0;"><a href="mailto:${safeCustomerEmail}" style="color:#0b6e4f;text-decoration:none;font-size:14px;">${safeCustomerEmail}</a></td></tr>
                  <tr><td style="padding:6px 0;color:#777;font-size:14px;">Phone</td><td style="padding:6px 0;color:#1a1a1a;font-size:14px;">${safeCustomerPhone}</td></tr>
                </table>
              </div>
              ${hasDetails ? `
              <!-- Design Details -->
              <div style="background-color:#f9f9f9;border:1px solid #eee;border-radius:6px;padding:20px;margin-bottom:20px;">
                <p style="margin:0 0 12px;color:#1a1a1a;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">${formLabel} Details</p>
                <table style="width:100%;border-collapse:collapse;">${detailRows}</table>
              </div>` : ""}
              <!-- Button -->
              <table role="presentation" style="width:100%;border-collapse:collapse;">
                <tr>
                  <td align="center" style="padding:16px 0;">
                    <a href="https://studio.aurezotech.com/saved-designs" style="display:inline-block;padding:12px 24px;background-color:#0b6e4f;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;border-radius:6px;">
                      View All Leads
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin:16px 0 0;color:#777;font-size:13px;text-align:center;">Respond quickly to increase your conversion rate.</p>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 24px;background-color:#fafafa;border-top:1px solid #eee;">
              <p style="margin:0;color:#999;font-size:12px;text-align:center;">
                This is an automated notification from Aurezo.<br>&copy; ${new Date().getFullYear()} Aurezo. All rights reserved.<br>
                <a href="https://studio.aurezotech.com" style="color:#0b6e4f;text-decoration:none;font-weight:600;">studio.aurezotech.com</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `;

    // customer_name in subject is plain-text (email subjects are not HTML), so no escaping needed there.
    const subject = `New ${formLabel} Lead: ${customer_name}`;

    // FROM uses the jeweler's company name so the inbox preview reads as
    // "{Jeweler} via Aurezo". Reply-To is the customer so the jeweler can hit
    // reply directly from this lead notification.
    const fromHeader = buildFromHeader(client.company_name);
    const replyTo = customer_email || DEFAULT_REPLY_TO;

    // Owner + opted-in staff + extra notification emails, de-duplicated.
    const recipients = await getLeadNotificationRecipients(supabase, client_id, client.email);

    let emailResponse: any = null;
    if (!jewelerOptedOut && recipients.to) {
      emailResponse = await resend.emails.send({
        from: fromHeader,
        to: [recipients.to],
        ...(recipients.bcc.length > 0 ? { bcc: recipients.bcc } : {}),
        subject,
        html: emailHtml,
        reply_to: replyTo,
      });

      console.log("Form lead notification email sent:", emailResponse?.data?.id);

      // J12: Wrap email_logs insert so a transient DB error doesn't return 500
      // after Resend has already delivered the email.
      try {
        await supabase.from("email_logs").insert(recipients.all.map((recipient) => ({
          recipient_email: recipient,
          email_type: "form_lead_notification",
          subject,
          status: "sent",
          resend_id: emailResponse?.data?.id,
          metadata: { client_id, form_type, customer_name, customer_email },
        })));
      } catch (logErr) {
        console.error("Failed to write email_logs (non-fatal):", logErr);
      }
    } else {
      console.log("Jeweler copy skipped (disabled or no recipients).");
    }



    return new Response(
      JSON.stringify({ success: true, message: `${formLabel} lead notification sent` }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: any) {
    console.error("Error in notify-form-lead:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Failed to send form lead notification" }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
