ALTER TABLE public.diamond_form_leads
  ADD COLUMN IF NOT EXISTS claim_phone text,
  ADD COLUMN IF NOT EXISTS claim_phone_at timestamptz;

COMMENT ON COLUMN public.diamond_form_leads.claim_phone IS 'E.164 mobile number confirmed on the Quote Estimator claim screen.';
COMMENT ON COLUMN public.diamond_form_leads.claim_phone_at IS 'When the claim screen mobile number was confirmed.';