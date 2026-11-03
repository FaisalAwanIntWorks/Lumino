-- Make the Quote Estimator welcome screen wording client-editable.
--
-- The intro screen shipped with hardcoded copy ("Let's build your Ring!" /
-- "Get An Instant Quote"). These two columns let each client set their own
-- from the Configure tab. Both are nullable: when null the widget falls back
-- to the original strings, so every existing client (DTT included) looks
-- exactly the same until someone types a replacement.
ALTER TABLE public.client_dtt_form_config
  ADD COLUMN IF NOT EXISTS welcome_title TEXT,
  ADD COLUMN IF NOT EXISTS welcome_subtitle TEXT;
