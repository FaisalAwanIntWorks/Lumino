ALTER TABLE public.client_dtt_form_config
  ADD COLUMN IF NOT EXISTS form_content JSONB;