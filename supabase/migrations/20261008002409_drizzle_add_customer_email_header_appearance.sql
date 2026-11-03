-- Copied from drizzle/migrations/0028_add_customer_email_header_appearance.sql (applied directly to the source database, missing from supabase/migrations).
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS customer_email_header_appearance text NOT NULL DEFAULT 'dark';

ALTER TABLE public.clients
  ADD CONSTRAINT clients_customer_email_header_appearance_check
  CHECK (customer_email_header_appearance IN ('dark', 'light'));

COMMENT ON COLUMN public.clients.customer_email_header_appearance IS
  'Controls the solid header background used behind the client logo in customer-facing emails.';