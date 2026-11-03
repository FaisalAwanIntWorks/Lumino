ALTER TABLE public.client_grill_config
  ADD COLUMN IF NOT EXISTS enabled_options jsonb;