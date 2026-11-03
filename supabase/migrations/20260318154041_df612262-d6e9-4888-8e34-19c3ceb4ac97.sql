-- Admin policies for lead_cost_estimates
CREATE POLICY "Admin can view all estimates" ON public.lead_cost_estimates
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'agency_admin'));

CREATE POLICY "Admin can insert estimates" ON public.lead_cost_estimates
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'agency_admin'));

-- Admin policies for lead_quote_history
CREATE POLICY "Admin can manage all quotes" ON public.lead_quote_history
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'agency_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'agency_admin'));

-- Staff also needs INSERT on lead_cost_estimates (currently only SELECT)
CREATE POLICY "Staff can insert client estimates" ON public.lead_cost_estimates
  FOR INSERT TO authenticated
  WITH CHECK (public.is_staff_of_client(auth.uid(), client_id));

-- Clients need INSERT on lead_cost_estimates too (edge function uses service_role, but in case of direct calls)
CREATE POLICY "Clients can insert own estimates" ON public.lead_cost_estimates
  FOR INSERT TO authenticated
  WITH CHECK (client_id IN (SELECT id FROM public.clients WHERE user_id = auth.uid()));