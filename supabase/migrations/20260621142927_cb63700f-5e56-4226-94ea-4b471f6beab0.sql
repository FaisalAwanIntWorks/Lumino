
-- client_ghl_integrations
DROP POLICY IF EXISTS "Clients manage their own GHL integration" ON public.client_ghl_integrations;

DROP POLICY IF EXISTS "Client owners manage own GHL integration" ON public.client_ghl_integrations;

CREATE POLICY "Client owners manage own GHL integration"
  ON public.client_ghl_integrations FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.clients c WHERE c.id = client_ghl_integrations.client_id AND c.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.clients c WHERE c.id = client_ghl_integrations.client_id AND c.user_id = auth.uid()));

DROP POLICY IF EXISTS "Agency admins manage all GHL integrations" ON public.client_ghl_integrations;

CREATE POLICY "Agency admins manage all GHL integrations"
  ON public.client_ghl_integrations FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'agency_admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'agency_admin'::public.app_role));

DROP POLICY IF EXISTS "Staff manage assigned client GHL integration" ON public.client_ghl_integrations;

CREATE POLICY "Staff manage assigned client GHL integration"
  ON public.client_ghl_integrations FOR ALL TO authenticated
  USING (public.is_staff_of_client(auth.uid(), client_id))
  WITH CHECK (public.is_staff_of_client(auth.uid(), client_id));

-- client_ghl_field_mappings
DROP POLICY IF EXISTS "Clients manage their own GHL field mappings" ON public.client_ghl_field_mappings;

DROP POLICY IF EXISTS "Client owners manage own GHL field mappings" ON public.client_ghl_field_mappings;

CREATE POLICY "Client owners manage own GHL field mappings"
  ON public.client_ghl_field_mappings FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.clients c WHERE c.id = client_ghl_field_mappings.client_id AND c.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.clients c WHERE c.id = client_ghl_field_mappings.client_id AND c.user_id = auth.uid()));

DROP POLICY IF EXISTS "Agency admins manage all GHL field mappings" ON public.client_ghl_field_mappings;

CREATE POLICY "Agency admins manage all GHL field mappings"
  ON public.client_ghl_field_mappings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'agency_admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'agency_admin'::public.app_role));

DROP POLICY IF EXISTS "Staff manage assigned client GHL field mappings" ON public.client_ghl_field_mappings;

CREATE POLICY "Staff manage assigned client GHL field mappings"
  ON public.client_ghl_field_mappings FOR ALL TO authenticated
  USING (public.is_staff_of_client(auth.uid(), client_id))
  WITH CHECK (public.is_staff_of_client(auth.uid(), client_id));

-- ghl_sync_logs (read only for non-service-role)
DROP POLICY IF EXISTS "Clients view their own GHL sync logs" ON public.ghl_sync_logs;

DROP POLICY IF EXISTS "Client owners view own GHL sync logs" ON public.ghl_sync_logs;

CREATE POLICY "Client owners view own GHL sync logs"
  ON public.ghl_sync_logs FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.clients c WHERE c.id = ghl_sync_logs.client_id AND c.user_id = auth.uid()));

DROP POLICY IF EXISTS "Agency admins view all GHL sync logs" ON public.ghl_sync_logs;

CREATE POLICY "Agency admins view all GHL sync logs"
  ON public.ghl_sync_logs FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'agency_admin'::public.app_role));

DROP POLICY IF EXISTS "Staff view assigned client GHL sync logs" ON public.ghl_sync_logs;

CREATE POLICY "Staff view assigned client GHL sync logs"
  ON public.ghl_sync_logs FOR SELECT TO authenticated
  USING (public.is_staff_of_client(auth.uid(), client_id));
