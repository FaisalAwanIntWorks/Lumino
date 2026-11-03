-- Stripe webhook events table (idempotency)
CREATE TABLE IF NOT EXISTS public.stripe_webhook_events (
  id text PRIMARY KEY,
  type text NOT NULL,
  payload jsonb NOT NULL,
  processed_at timestamptz NOT NULL DEFAULT now(),
  processing_error text
);

ALTER TABLE public.stripe_webhook_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view webhook events"
ON public.stripe_webhook_events
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'agency_admin'));

CREATE INDEX IF NOT EXISTS idx_stripe_webhook_events_type ON public.stripe_webhook_events(type);
CREATE INDEX IF NOT EXISTS idx_stripe_webhook_events_processed_at ON public.stripe_webhook_events(processed_at DESC);

-- Client subscriptions cache table (entitlement source-of-truth, written by webhook)
CREATE TABLE IF NOT EXISTS public.client_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL UNIQUE REFERENCES public.clients(id) ON DELETE CASCADE,
  stripe_customer_id text,
  stripe_subscription_id text,
  status text NOT NULL DEFAULT 'none',
  plan_id uuid REFERENCES public.subscription_plans(id),
  plan_name text,
  current_period_end timestamptz,
  trial_end timestamptz,
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  has_license_fee boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.client_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Clients can view own subscription"
ON public.client_subscriptions
FOR SELECT
TO authenticated
USING (client_id = public.get_user_client_id(auth.uid()) OR public.has_role(auth.uid(), 'agency_admin'));

CREATE POLICY "Admins can manage subscriptions"
ON public.client_subscriptions
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'agency_admin'))
WITH CHECK (public.has_role(auth.uid(), 'agency_admin'));

CREATE INDEX IF NOT EXISTS idx_client_subscriptions_stripe_customer ON public.client_subscriptions(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_client_subscriptions_stripe_sub ON public.client_subscriptions(stripe_subscription_id);
CREATE INDEX IF NOT EXISTS idx_client_subscriptions_status ON public.client_subscriptions(status);

CREATE TRIGGER update_client_subscriptions_updated_at
BEFORE UPDATE ON public.client_subscriptions
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Add stripe_customer_id to clients (lookup by id, not email)
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS stripe_customer_id text;
CREATE INDEX IF NOT EXISTS idx_clients_stripe_customer_id ON public.clients(stripe_customer_id);