ALTER TABLE public.client_custom_enquiry_config
  ADD COLUMN IF NOT EXISTS design_option_catalog jsonb,
  ADD COLUMN IF NOT EXISTS design_option_notes jsonb;

COMMENT ON COLUMN public.client_custom_enquiry_config.design_option_catalog IS 'Full ordered option list per design section: { metal_color: string[], karat: string[], diamond_quality: string[], diamond_setup: string[] }. Null = fall back to platform master lists.';
COMMENT ON COLUMN public.client_custom_enquiry_config.design_option_notes IS 'Customer-facing note per option: { section: { optionValue: note } }.';