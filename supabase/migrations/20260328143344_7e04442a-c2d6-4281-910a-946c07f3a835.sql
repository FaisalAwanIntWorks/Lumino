
-- Auto-recharge settings table
CREATE TABLE public.client_auto_recharge_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  threshold_amount numeric NOT NULL DEFAULT 5,
  recharge_amount numeric NOT NULL DEFAULT 50,
  stripe_payment_method_id text,
  payment_method_brand text,
  payment_method_last4 text,
  last_recharged_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(client_id)
);

-- RLS
ALTER TABLE public.client_auto_recharge_settings ENABLE ROW LEVEL SECURITY;

-- Clients can read/update their own settings
CREATE POLICY "Clients can read own auto-recharge settings"
  ON public.client_auto_recharge_settings FOR SELECT TO authenticated
  USING (client_id = public.get_user_client_id(auth.uid()));

CREATE POLICY "Clients can insert own auto-recharge settings"
  ON public.client_auto_recharge_settings FOR INSERT TO authenticated
  WITH CHECK (client_id = public.get_user_client_id(auth.uid()));

CREATE POLICY "Clients can update own auto-recharge settings"
  ON public.client_auto_recharge_settings FOR UPDATE TO authenticated
  USING (client_id = public.get_user_client_id(auth.uid()));

-- Staff can read for their client
CREATE POLICY "Staff can read client auto-recharge settings"
  ON public.client_auto_recharge_settings FOR SELECT TO authenticated
  USING (public.is_staff_of_client(auth.uid(), client_id));

-- Admin access
CREATE POLICY "Agency admins can manage auto-recharge settings"
  ON public.client_auto_recharge_settings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'agency_admin'));

-- Updated_at trigger
CREATE TRIGGER update_client_auto_recharge_settings_updated_at
  BEFORE UPDATE ON public.client_auto_recharge_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
