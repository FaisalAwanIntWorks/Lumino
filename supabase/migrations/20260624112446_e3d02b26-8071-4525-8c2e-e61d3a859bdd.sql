GRANT INSERT ON public.diamond_form_leads TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.diamond_form_leads TO authenticated;
GRANT ALL ON public.diamond_form_leads TO service_role;

GRANT SELECT ON public.client_ghl_integrations TO authenticated;
GRANT ALL ON public.client_ghl_integrations TO service_role;

GRANT SELECT ON public.client_ghl_field_mappings TO authenticated;
GRANT ALL ON public.client_ghl_field_mappings TO service_role;

GRANT SELECT ON public.ghl_sync_logs TO authenticated;
GRANT ALL ON public.ghl_sync_logs TO service_role;