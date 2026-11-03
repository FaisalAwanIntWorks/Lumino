-- Editable Thank-You + Summary screen copy for the Quote Estimator (DTT) form.
-- Stored as a single JSONB blob so per-client text overrides can grow without
-- further schema changes. NULL / missing keys fall back to the built-in wording
-- (which preserves the existing DTT look exactly).
ALTER TABLE public.client_dtt_form_config
  ADD COLUMN IF NOT EXISTS form_content JSONB;
