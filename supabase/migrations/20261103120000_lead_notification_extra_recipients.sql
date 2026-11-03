-- Extra recipient emails per notification type (used by the `new_lead` row).
-- Lead notification functions (notify-new-lead, notify-form-lead, notify-metal-iq-lead)
-- send to: owner email + active staff with permissions.lead_email_notifications = true
-- + these emails, de-duplicated case-insensitively. Existing RLS on the table already
-- scopes reads/writes to the client (and staff read), so no policy change is needed.
ALTER TABLE public.client_notification_preferences
  ADD COLUMN IF NOT EXISTS recipient_emails text[] NOT NULL DEFAULT '{}'::text[];
