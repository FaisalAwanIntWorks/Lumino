
-- Add follow_up_status to diamond_form_leads
ALTER TABLE public.diamond_form_leads ADD COLUMN IF NOT EXISTS follow_up_status TEXT DEFAULT 'new';

-- Add follow_up_status to grill_form_leads
ALTER TABLE public.grill_form_leads ADD COLUMN IF NOT EXISTS follow_up_status TEXT DEFAULT 'new';

-- Add follow_up_status to custom_enquiry_leads
ALTER TABLE public.custom_enquiry_leads ADD COLUMN IF NOT EXISTS follow_up_status TEXT DEFAULT 'new';
