
-- Lead cost estimates table
CREATE TABLE public.lead_cost_estimates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id text NOT NULL,
  lead_source text NOT NULL,
  client_id uuid REFERENCES public.clients(id) ON DELETE CASCADE NOT NULL,
  material_cost numeric,
  labor_estimate numeric,
  suggested_retail_low numeric,
  suggested_retail_high numeric,
  confidence text,
  reasoning text,
  currency text DEFAULT 'USD',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.lead_cost_estimates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Clients can view own estimates" ON public.lead_cost_estimates
  FOR SELECT TO authenticated USING (client_id IN (
    SELECT id FROM public.clients WHERE user_id = auth.uid()
  ));

CREATE POLICY "Staff can view client estimates" ON public.lead_cost_estimates
  FOR SELECT TO authenticated USING (
    public.is_staff_of_client(auth.uid(), client_id)
  );

-- Lead quote history table
CREATE TABLE public.lead_quote_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id text NOT NULL,
  lead_source text NOT NULL,
  client_id uuid REFERENCES public.clients(id) ON DELETE CASCADE NOT NULL,
  customer_email text NOT NULL,
  customer_name text,
  quote_amount numeric NOT NULL,
  currency text DEFAULT 'USD',
  message text,
  sent_at timestamptz DEFAULT now(),
  status text DEFAULT 'sent'
);

ALTER TABLE public.lead_quote_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Clients can manage own quotes" ON public.lead_quote_history
  FOR ALL TO authenticated USING (client_id IN (
    SELECT id FROM public.clients WHERE user_id = auth.uid()
  )) WITH CHECK (client_id IN (
    SELECT id FROM public.clients WHERE user_id = auth.uid()
  ));

CREATE POLICY "Staff can manage client quotes" ON public.lead_quote_history
  FOR ALL TO authenticated USING (
    public.is_staff_of_client(auth.uid(), client_id)
  ) WITH CHECK (
    public.is_staff_of_client(auth.uid(), client_id)
  );
