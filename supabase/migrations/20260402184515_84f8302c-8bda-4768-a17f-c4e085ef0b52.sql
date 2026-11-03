
CREATE TABLE public.metal_price_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  gold_price numeric NOT NULL,
  silver_price numeric NOT NULL,
  platinum_price numeric NOT NULL,
  source text NOT NULL DEFAULT 'live',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_metal_price_snapshots_client ON public.metal_price_snapshots(client_id, created_at DESC);

ALTER TABLE public.metal_price_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Clients read own snapshots" ON public.metal_price_snapshots
  FOR SELECT TO authenticated USING (
    client_id = public.get_user_client_id(auth.uid())
    OR public.has_role(auth.uid(), 'agency_admin')
    OR public.is_staff_of_client(auth.uid(), client_id)
  );

CREATE POLICY "Service role can insert snapshots" ON public.metal_price_snapshots
  FOR INSERT TO authenticated WITH CHECK (
    public.has_role(auth.uid(), 'agency_admin')
  );
