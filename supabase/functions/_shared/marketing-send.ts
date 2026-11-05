// deno-lint-ignore-file no-explicit-any
/** Resend sending for admin marketing campaigns (separate sender from app emails). */

export const MARKETING_FROM = Deno.env.get("MARKETING_FROM_EMAIL") ?? "Aurezo <onboarding@resend.dev>";
export const MARKETING_REPLY_TO = Deno.env.get("SUPPORT_EMAIL") || undefined;
export const UNSUBSCRIBE_BASE = "https://studio.aurezotech.com/unsubscribe";

export function unsubscribeUrl(token: string) {
  return `${UNSUBSCRIBE_BASE}?token=${encodeURIComponent(token)}`;
}

function oneClickUrl(token: string) {
  return `${Deno.env.get("SUPABASE_URL")}/functions/v1/marketing-unsubscribe?token=${encodeURIComponent(token)}`;
}

export interface OutgoingEmail {
  to: string;
  subject: string;
  html: string;
  token: string;
  tags?: { name: string; value: string }[];
}

function toPayload(e: OutgoingEmail) {
  return {
    from: MARKETING_FROM,
    to: [e.to],
    reply_to: MARKETING_REPLY_TO,
    subject: e.subject,
    html: e.html,
    headers: {
      "List-Unsubscribe": MARKETING_REPLY_TO
        ? `<${oneClickUrl(e.token)}>, <mailto:${MARKETING_REPLY_TO}?subject=unsubscribe>`
        : `<${oneClickUrl(e.token)}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
    tags: e.tags,
  };
}

/** Send up to 100 emails in one Resend batch call. Returns ids in order, or throws "[status]: body". */
export async function sendBatch(emails: OutgoingEmail[]): Promise<(string | null)[]> {
  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) throw new Error("RESEND_API_KEY is not configured");
  const res = await fetch("https://api.resend.com/emails/batch", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(emails.map(toPayload)),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`[${res.status}]: ${text.slice(0, 400)}`);
  const json: any = JSON.parse(text || "{}");
  return (json.data ?? []).map((d: any) => d?.id ?? null);
}
