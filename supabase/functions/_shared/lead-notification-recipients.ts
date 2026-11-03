// Lead notification recipients (jeweler owner + opted-in staff + extra emails).
//
// Sources:
//   1. clients.email                         — the account owner (always first)
//   2. staff_members (status = 'active') whose permissions.lead_email_notifications === true
//   3. client_notification_preferences(new_lead).recipient_emails — free-form extra emails
//      typed by the client on Settings → Notifications
//
// Addresses are de-duplicated case-insensitively, so a staff member whose email is
// also typed in the extra list (or matches the owner) gets exactly ONE email.

// deno-lint-ignore no-explicit-any
type SupabaseLike = any;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Resend accepts at most 50 recipients (to + cc + bcc) per message.
const MAX_RECIPIENTS = 50;

export interface LeadRecipients {
  /** Primary "to" address (owner email when present). */
  to: string | null;
  /** Everyone else, sent as BCC so recipients don't see each other. */
  bcc: string[];
  /** to + bcc, in send order. */
  all: string[];
}

export async function getLeadNotificationRecipients(
  supabase: SupabaseLike,
  clientId: string,
  ownerEmail: string | null | undefined,
): Promise<LeadRecipients> {
  const seen = new Set<string>();
  const all: string[] = [];

  const add = (raw: unknown) => {
    if (typeof raw !== "string") return;
    const email = raw.trim();
    if (!email || !EMAIL_RE.test(email)) return;
    const key = email.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    all.push(email);
  };

  add(ownerEmail);

  try {
    const { data: staff } = await supabase
      .from("staff_members")
      .select("email, status, permissions")
      .eq("client_id", clientId)
      .eq("status", "active");
    for (const s of staff || []) {
      const perms = (s?.permissions || {}) as Record<string, unknown>;
      if (perms.lead_email_notifications === true || perms.lead_email_notifications === "true") {
        add(s.email);
      }
    }
  } catch (err) {
    console.error("Lead recipients: staff lookup failed (non-fatal):", err);
  }

  try {
    const { data: pref } = await supabase
      .from("client_notification_preferences")
      .select("recipient_emails")
      .eq("client_id", clientId)
      .eq("notification_type", "new_lead")
      .maybeSingle();
    const extras = Array.isArray(pref?.recipient_emails) ? pref.recipient_emails : [];
    for (const e of extras) add(e);
  } catch (err) {
    console.error("Lead recipients: extra emails lookup failed (non-fatal):", err);
  }

  const capped = all.slice(0, MAX_RECIPIENTS);
  return { to: capped[0] ?? null, bcc: capped.slice(1), all: capped };
}
