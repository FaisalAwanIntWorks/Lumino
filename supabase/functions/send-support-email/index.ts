import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.45.0";
import { logEmail } from "../_shared/email-log.ts";

// Set once the request handler has a client, so sendEmail can record sends.
// deno-lint-ignore no-explicit-any
let emailLogClient: any = null;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const FROM_EMAIL = "Aurezo Support <onboarding@resend.dev>";
const REPLY_TO = Deno.env.get("SUPPORT_EMAIL") || undefined;
// Used when no agency_admin email is found. Empty when neither secret is set.
const ADMIN_INBOX_FALLBACK: string[] = [Deno.env.get("SUPPORT_ADMIN_INBOX") || Deno.env.get("SUPPORT_EMAIL") || ""].filter(Boolean);

async function getAllAdminEmails(supabase: any): Promise<string[]> {
  try {
    const { data: roles } = await supabase
      .from("user_roles")
      .select("user_id")
      .eq("role", "agency_admin");
    const ids = (roles || []).map((r: any) => r.user_id).filter(Boolean);
    if (!ids.length) return ADMIN_INBOX_FALLBACK;
    const emails = new Set<string>();
    for (const id of ids) {
      const { data: u } = await supabase.auth.admin.getUserById(id);
      const e = u?.user?.email;
      if (e) emails.add(e);
    }
    if (!emails.size) return ADMIN_INBOX_FALLBACK;
    return Array.from(emails);
  } catch (e) {
    console.error("getAllAdminEmails failed", e);
    return ADMIN_INBOX_FALLBACK;
  }
}
const LOGO_URL = "https://studio.aurezotech.com/images/aurezo-email-logo.png";
const ADMIN_QUERIES_URL = "https://studioadmin.aurezotech.com/admin/client-queries";
const CLIENT_HELP_URL = "https://studio.aurezotech.com/dashboard/help-center";

interface Payload {
  ticket_id: string;
  type: "submitted" | "admin_reply" | "client_reply";
  reply_body?: string;
}

function escape(s: string): string {
  return (s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}

function nl2br(s: string): string {
  return escape(s).replace(/\n/g, "<br>");
}

interface Section { label: string; rows: Array<[string, string]> }

function shell(opts: {
  heading: string;
  intro: string;
  sections?: Section[];
  quoteLabel?: string;
  quoteBody?: string;
  ctaLabel?: string;
  ctaUrl?: string;
  footerNote?: string;
}): string {
  const { heading, intro, sections = [], quoteLabel, quoteBody, ctaLabel, ctaUrl, footerNote } = opts;

  const sectionHtml = sections.map((s) => `
    <div style="padding: 16px; background-color: #f9f9f9; border-radius: 6px; border: 1px solid #eeeeee; margin-bottom: 16px;">
      <p style="margin: 0 0 10px; color: #1a1a1a; font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">${escape(s.label)}</p>
      <table role="presentation" style="width: 100%; border-collapse: collapse;">
        ${s.rows.map(([k, v]) => `<tr><td style="padding: 4px 0; color: #777777; font-size: 14px; width: 110px; vertical-align: top;">${escape(k)}</td><td style="padding: 4px 0; color: #1a1a1a; font-size: 14px;">${v}</td></tr>`).join("")}
      </table>
    </div>`).join("");

  const quoteHtml = quoteBody ? `
    <div style="padding: 16px; background-color: #f9f9f9; border-left: 3px solid #0b6e4f; border-radius: 4px; margin-bottom: 24px;">
      ${quoteLabel ? `<p style="margin: 0 0 8px; color: #1a1a1a; font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">${escape(quoteLabel)}</p>` : ""}
      <p style="margin: 0; color: #1a1a1a; font-size: 14px; line-height: 1.6;">${nl2br(quoteBody)}</p>
    </div>` : "";

  const ctaHtml = ctaLabel && ctaUrl ? `
    <table role="presentation" style="width: 100%; border-collapse: collapse;">
      <tr>
        <td align="center" style="padding: 8px 0;">
          <a href="${ctaUrl}" style="display: inline-block; padding: 14px 32px; background-color: #0b6e4f; color: #ffffff; text-decoration: none; font-size: 15px; font-weight: 600; border-radius: 6px;">
            ${escape(ctaLabel)}
          </a>
        </td>
      </tr>
    </table>` : "";

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light only">
  <meta name="supported-color-schemes" content="light only">
  <title>${escape(heading)} - Aurezo</title>
  <style>
    :root { color-scheme: light only; }
    @media (prefers-color-scheme: dark) {
      .email-header { background-color: #000000 !important; }
    }
    [data-ogsc] .email-header { background-color: #000000 !important; }
  </style>
</head>
<body style="margin: 0; padding: 0; background-color: #f5f5f5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" style="width: 100%; max-width: 560px; border-collapse: collapse; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.08);">
          <tr>
            <td class="email-header" style="padding: 32px 40px 24px; text-align: center; background-color: #000000;">
              <img src="${LOGO_URL}" alt="Aurezo" style="height: 56px;" />
            </td>
          </tr>
          <tr>
            <td style="padding: 40px;">
              <h2 style="margin: 0 0 12px; color: #1a1a1a; font-size: 22px; font-weight: 600;">${escape(heading)}</h2>
              <p style="margin: 0 0 24px; color: #555555; font-size: 15px; line-height: 1.6;">${intro}</p>
              ${sectionHtml}
              ${quoteHtml}
              ${ctaHtml}
              ${footerNote ? `<p style="margin: 24px 0 0; color: #999999; font-size: 12px; line-height: 1.5;">${footerNote}</p>` : ""}
            </td>
          </tr>
          <tr>
            <td style="padding: 20px 40px; background-color: #fafafa; border-top: 1px solid #eeeeee;">
              <p style="margin: 0; color: #999999; font-size: 12px; text-align: center;">
                Automated notification from Aurezo.<br>&copy; ${new Date().getFullYear()} Aurezo. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

async function sendEmail(to: string | string[], subject: string, html: string) {
  const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
  if (!RESEND_API_KEY) {
    console.error("RESEND_API_KEY missing — cannot send support email");
    return { ok: false, error: "no_api_key" };
  }
  const recipients = Array.isArray(to) ? to : [to];
  if (!recipients.length) return { ok: false, error: "no_recipients" };
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${RESEND_API_KEY}`,
    },
    body: JSON.stringify({ from: FROM_EMAIL, to: recipients, reply_to: REPLY_TO, subject, html }),
  });
  if (!res.ok) {
    const t = await res.text();
    console.error("Resend error", res.status, t);
    if (emailLogClient) {
      await logEmail(emailLogClient, { to: recipients, emailType: "support_email", subject, ok: false, error: `HTTP ${res.status}: ${t}` });
    }
    return { ok: false, error: t };
  }
  let resendId: string | null = null;
  try { resendId = (await res.json())?.id ?? null; } catch { /* body not JSON */ }
  if (emailLogClient) {
    await logEmail(emailLogClient, { to: recipients, emailType: "support_email", subject, ok: true, resendId });
  }
  return { ok: true };
}

function categoryLabel(c: string): string {
  const map: Record<string, string> = {
    general: "General Question",
    bug: "Bug / Technical Issue",
    billing: "Billing",
    feature_request: "Feature Request",
    integration: "Integration / Embed",
    account: "Account / Access",
  };
  return map[c] || c.replace(/_/g, " ");
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const body = (await req.json()) as Payload;
    if (!body?.ticket_id || !body?.type) {
      return new Response(JSON.stringify({ error: "missing_fields" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    emailLogClient = supabase;

    const { data: ticket, error: tErr } = await supabase
      .from("support_tickets")
      .select("*, clients:client_id(company_name)")
      .eq("id", body.ticket_id)
      .maybeSingle();
    if (tErr || !ticket) {
      return new Response(JSON.stringify({ error: "ticket_not_found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const company = (ticket as any).clients?.company_name || "your account";
    const firstName = (ticket.created_by_name || "").split(" ")[0] || "there";
    const ADMIN_INBOX = await getAllAdminEmails(supabase);
    console.log("Support email admin recipients:", ADMIN_INBOX.length);

    if (body.type === "submitted") {
      // Acknowledgement to the client/staff who submitted
      await sendEmail(
        ticket.created_by_email,
        `We received your query: ${ticket.subject}`,
        shell({
          heading: "Your query has been received",
          intro: `Hi ${escape(firstName)}, thank you for reaching out. The <strong>Aurezo Technical Team</strong> will respond to your request within 24 hours.`,
          sections: [{
            label: "Query Details",
            rows: [
              ["Subject:", escape(ticket.subject)],
              ["Category:", escape(categoryLabel(ticket.category))],
              ["Reference:", `<span style="font-family: monospace; font-size: 12px;">${escape(ticket.id)}</span>`],
            ],
          }],
          quoteLabel: "Your message",
          quoteBody: ticket.initial_message,
          ctaLabel: "View in Help Center",
          ctaUrl: CLIENT_HELP_URL,
          footerNote: REPLY_TO
            ? `Reply to this email or contact <a href="mailto:${REPLY_TO}" style="color: #0b6e4f; text-decoration: none;">${REPLY_TO}</a> for further assistance.`
            : "Visit the Help Center for further assistance.",
        }),
      );
      // Notify admin inbox
      await sendEmail(
        ADMIN_INBOX,
        `[Support] New query from ${company}: ${ticket.subject}`,
        shell({
          heading: "New client query received",
          intro: `<strong>${escape(company)}</strong> just submitted a new support query through the Help Center.`,
          sections: [
            {
              label: "Submitted by",
              rows: [
                ["Name:", escape(ticket.created_by_name || "—")],
                ["Email:", escape(ticket.created_by_email)],
                ["Company:", escape(company)],
              ],
            },
            {
              label: "Query Details",
              rows: [
                ["Subject:", escape(ticket.subject)],
                ["Category:", escape(categoryLabel(ticket.category))],
                ["Priority:", escape(ticket.priority || "normal")],
              ],
            },
          ],
          quoteLabel: "Message",
          quoteBody: ticket.initial_message,
          ctaLabel: "Open in Admin",
          ctaUrl: ADMIN_QUERIES_URL,
        }),
      );
    } else if (body.type === "admin_reply") {
      await sendEmail(
        ticket.created_by_email,
        `Reply to your query: ${ticket.subject}`,
        shell({
          heading: "Aurezo Technical Team has replied",
          intro: `Hi ${escape(firstName)}, our team has responded to your support query <strong>"${escape(ticket.subject)}"</strong>.`,
          quoteLabel: "Reply from Aurezo",
          quoteBody: body.reply_body || "",
          ctaLabel: "View Full Conversation",
          ctaUrl: CLIENT_HELP_URL,
          footerNote: `Reference ID: <span style="font-family: monospace;">${escape(ticket.id)}</span>`,
        }),
      );
    } else if (body.type === "client_reply") {
      await sendEmail(
        ADMIN_INBOX,
        `[Support] New reply from ${company}: ${ticket.subject}`,
        shell({
          heading: "Client replied on a support ticket",
          intro: `<strong>${escape(ticket.created_by_name || ticket.created_by_email)}</strong> from <strong>${escape(company)}</strong> added a new reply to their query <strong>"${escape(ticket.subject)}"</strong>.`,
          quoteLabel: "Client reply",
          quoteBody: body.reply_body || "",
          ctaLabel: "Open in Admin",
          ctaUrl: ADMIN_QUERIES_URL,
        }),
      );
    }

    return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("send-support-email error", e);
    return new Response(JSON.stringify({ error: "internal_error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
