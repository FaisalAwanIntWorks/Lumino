ALTER TABLE public.client_onboarding_preferences 
  ADD COLUMN IF NOT EXISTS widget_pricing_mode text NOT NULL DEFAULT 'estimates',
  ADD COLUMN IF NOT EXISTS widget_deposit_amount numeric DEFAULT 0;