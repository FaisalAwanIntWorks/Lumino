
-- Add budget column to grill_form_leads
ALTER TABLE public.grill_form_leads ADD COLUMN IF NOT EXISTS budget text;

-- Add budget_options jsonb column to client_grill_config
ALTER TABLE public.client_grill_config ADD COLUMN IF NOT EXISTS budget_options jsonb;
