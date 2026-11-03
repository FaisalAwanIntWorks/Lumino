ALTER TABLE public.client_custom_enquiry_config
  ADD COLUMN IF NOT EXISTS timeline_options text[]
  NOT NULL DEFAULT ARRAY['1-2 Weeks','2-4 Weeks','1-2 Months','3+ Months','No Rush']::text[];