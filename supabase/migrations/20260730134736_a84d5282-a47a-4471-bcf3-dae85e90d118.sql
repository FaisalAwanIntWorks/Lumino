ALTER TABLE public.client_grill_config
  ADD COLUMN IF NOT EXISTS grill_type_options jsonb,
  ADD COLUMN IF NOT EXISTS metal_order jsonb;