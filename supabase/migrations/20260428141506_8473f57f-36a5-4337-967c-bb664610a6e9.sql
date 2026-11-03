-- Ledger of CAD add-on purchases (idempotent on stripe_session_id)
CREATE TABLE public.client_cad_addons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  addon_kind text NOT NULL CHECK (addon_kind IN ('cad_tweak', 'new_cad', 'cad_render')),
  stripe_session_id text NOT NULL UNIQUE,
  stripe_price_id text,
  amount_cents integer NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'usd',
  granted_at timestamptz NOT NULL DEFAULT now(),
  consumed_at timestamptz,
  consumed_by_cad_request_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_client_cad_addons_client_id ON public.client_cad_addons(client_id);
CREATE INDEX IF NOT EXISTS idx_client_cad_addons_unconsumed ON public.client_cad_addons(client_id, addon_kind) WHERE consumed_at IS NULL;

ALTER TABLE public.client_cad_addons ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Clients can view their own CAD add-ons" ON public.client_cad_addons;

CREATE POLICY "Clients can view their own CAD add-ons"
  ON public.client_cad_addons FOR SELECT
  USING (client_id = public.get_user_client_id(auth.uid()));

DROP POLICY IF EXISTS "Staff of client can view CAD add-ons" ON public.client_cad_addons;

CREATE POLICY "Staff of client can view CAD add-ons"
  ON public.client_cad_addons FOR SELECT
  USING (public.is_staff_of_client(auth.uid(), client_id));

DROP POLICY IF EXISTS "Admins can view all CAD add-ons" ON public.client_cad_addons;

CREATE POLICY "Admins can view all CAD add-ons"
  ON public.client_cad_addons FOR SELECT
  USING (public.has_role(auth.uid(), 'agency_admin'));

-- Idempotency ledger for admin billing notifications
CREATE TABLE public.admin_billing_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL,
  stripe_event_id text,
  stripe_object_id text NOT NULL,
  client_id uuid,
  amount_cents integer,
  currency text DEFAULT 'usd',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uniq_admin_billing_event UNIQUE (event_type, stripe_object_id)
);

CREATE INDEX IF NOT EXISTS idx_admin_billing_events_created_at ON public.admin_billing_events(created_at DESC);

ALTER TABLE public.admin_billing_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view all admin billing events" ON public.admin_billing_events;

CREATE POLICY "Admins can view all admin billing events"
  ON public.admin_billing_events FOR SELECT
  USING (public.has_role(auth.uid(), 'agency_admin'));