
-- Add submission_mode and deposit_amount to custom enquiry config
ALTER TABLE public.client_custom_enquiry_config
  ADD COLUMN IF NOT EXISTS submission_mode text NOT NULL DEFAULT 'contact',
  ADD COLUMN IF NOT EXISTS deposit_amount numeric DEFAULT null;

-- Add submission_mode and deposit_amount to grill config
ALTER TABLE public.client_grill_config
  ADD COLUMN IF NOT EXISTS submission_mode text NOT NULL DEFAULT 'contact',
  ADD COLUMN IF NOT EXISTS deposit_amount numeric DEFAULT null;
