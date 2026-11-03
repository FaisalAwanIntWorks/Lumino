-- Create low-balance alert tracking table
CREATE TABLE public.client_low_balance_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  tier text NOT NULL CHECK (tier IN ('warning', 'critical')),
  last_alerted_at timestamptz NOT NULL DEFAULT now(),
  last_alerted_balance numeric NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id, tier)
);

-- Index for quick lookups
CREATE INDEX IF NOT EXISTS idx_client_low_balance_alerts_client_tier
  ON public.client_low_balance_alerts (client_id, tier);

-- Enable RLS
ALTER TABLE public.client_low_balance_alerts ENABLE ROW LEVEL SECURITY;

-- SELECT: client owner can view their own alerts
DROP POLICY IF EXISTS "Client owners can view their low balance alerts" ON public.client_low_balance_alerts;
CREATE POLICY "Client owners can view their low balance alerts"
  ON public.client_low_balance_alerts
  FOR SELECT
  TO authenticated
  USING (client_id = public.get_user_client_id(auth.uid()));

-- SELECT: active staff can view alerts for their client
DROP POLICY IF EXISTS "Active staff can view client low balance alerts" ON public.client_low_balance_alerts;
CREATE POLICY "Active staff can view client low balance alerts"
  ON public.client_low_balance_alerts
  FOR SELECT
  TO authenticated
  USING (public.is_staff_of_client(auth.uid(), client_id));

-- SELECT: agency admins can view all
DROP POLICY IF EXISTS "Agency admins can view all low balance alerts" ON public.client_low_balance_alerts;
CREATE POLICY "Agency admins can view all low balance alerts"
  ON public.client_low_balance_alerts
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'agency_admin'));

-- Trigger to auto-update updated_at
DROP TRIGGER IF EXISTS update_client_low_balance_alerts_updated_at ON public.client_low_balance_alerts;
CREATE TRIGGER update_client_low_balance_alerts_updated_at
  BEFORE UPDATE ON public.client_low_balance_alerts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();