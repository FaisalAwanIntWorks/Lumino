/**
 * One place to record an outbound email in `email_logs`.
 *
 * Platform Health counts Resend usage from this table, so every sender has to
 * write here, for failed sends as well as successful ones. Logging never
 * throws: a logging problem must not turn a delivered email into an error.
 */
// deno-lint-ignore-file no-explicit-any

export interface EmailLogInput {
  to: string | string[];
  emailType: string;
  subject: string;
  /** true when Resend accepted the message. */
  ok: boolean;
  resendId?: string | null;
  error?: string | null;
  metadata?: Record<string, unknown>;
}

export async function logEmail(supabase: any, input: EmailLogInput): Promise<void> {
  try {
    const recipients = (Array.isArray(input.to) ? input.to : [input.to]).filter(Boolean);
    await supabase.from("email_logs").insert({
      recipient_email: recipients.join(", "),
      email_type: input.emailType,
      subject: input.subject,
      status: input.ok ? "sent" : "failed",
      resend_id: input.ok ? (input.resendId ?? null) : null,
      error_message: input.ok ? null : String(input.error ?? "send failed").slice(0, 500),
      metadata: input.metadata ?? {},
    });
  } catch (e) {
    console.error("email_logs write failed (non-fatal):", e instanceof Error ? e.message : String(e));
  }
}
