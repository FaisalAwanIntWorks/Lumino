ALTER TABLE public.client_dtt_form_config
  ADD COLUMN IF NOT EXISTS welcome_title TEXT,
  ADD COLUMN IF NOT EXISTS welcome_subtitle TEXT;