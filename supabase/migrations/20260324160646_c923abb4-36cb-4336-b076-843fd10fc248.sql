ALTER TABLE public.lead_cost_estimates ADD COLUMN IF NOT EXISTS feedback text DEFAULT NULL;

CREATE POLICY "Clients can update own estimates" ON public.lead_cost_estimates
  FOR UPDATE TO authenticated USING (client_id IN (SELECT id FROM public.clients WHERE user_id = auth.uid()));

CREATE POLICY "Staff can update client estimates" ON public.lead_cost_estimates
  FOR UPDATE TO authenticated USING (public.is_staff_of_client(auth.uid(), client_id));