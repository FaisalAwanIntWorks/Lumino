
ALTER TABLE public.client_grill_config ADD COLUMN IF NOT EXISTS enabled_steps JSONB DEFAULT NULL;
ALTER TABLE public.client_custom_enquiry_config ADD COLUMN IF NOT EXISTS enabled_steps JSONB DEFAULT NULL;
