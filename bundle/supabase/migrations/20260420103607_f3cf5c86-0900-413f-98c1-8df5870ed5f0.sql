-- Add Payment Link tracking to subscription_plans
ALTER TABLE public.subscription_plans
  ADD COLUMN IF NOT EXISTS stripe_payment_link_id text,
  ADD COLUMN IF NOT EXISTS stripe_payment_link_url text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_subscription_plans_stripe_payment_link_id
  ON public.subscription_plans(stripe_payment_link_id)
  WHERE stripe_payment_link_id IS NOT NULL;

-- Add Stripe customer linkage + phone + password flag to clients
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS stripe_customer_id text,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS password_set boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS idx_clients_stripe_customer_id
  ON public.clients(stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;