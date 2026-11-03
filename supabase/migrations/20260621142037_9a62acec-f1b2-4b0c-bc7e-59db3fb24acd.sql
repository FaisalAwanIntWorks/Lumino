
CREATE TABLE public.client_ghl_integrations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL UNIQUE REFERENCES public.clients(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT false,
  location_id TEXT,
  pipeline_id TEXT,
  stage_id TEXT,
  opportunity_name_template TEXT NOT NULL DEFAULT 'Diamond Form — {customer_name}',
  opportunity_status TEXT NOT NULL DEFAULT 'open',
  value_source TEXT NOT NULL DEFAULT 'estimated_total',
  fixed_value NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_ghl_integrations TO authenticated;
GRANT ALL ON public.client_ghl_integrations TO service_role;
ALTER TABLE public.client_ghl_integrations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Clients manage their own GHL integration" ON public.client_ghl_integrations;
CREATE POLICY "Clients manage their own GHL integration"
  ON public.client_ghl_integrations FOR ALL
  TO authenticated
  USING (client_id = auth.uid())
  WITH CHECK (client_id = auth.uid());

CREATE TABLE public.client_ghl_field_mappings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  question_key TEXT NOT NULL,
  ghl_custom_field_id TEXT NOT NULL,
  label TEXT,
  display_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (client_id, question_key)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_ghl_field_mappings TO authenticated;
GRANT ALL ON public.client_ghl_field_mappings TO service_role;
ALTER TABLE public.client_ghl_field_mappings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Clients manage their own GHL field mappings" ON public.client_ghl_field_mappings;
CREATE POLICY "Clients manage their own GHL field mappings"
  ON public.client_ghl_field_mappings FOR ALL
  TO authenticated
  USING (client_id = auth.uid())
  WITH CHECK (client_id = auth.uid());
CREATE INDEX IF NOT EXISTS idx_ghl_field_mappings_client ON public.client_ghl_field_mappings(client_id);

CREATE TABLE public.ghl_sync_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL,
  lead_id UUID,
  stage TEXT NOT NULL,
  status TEXT NOT NULL,
  ghl_contact_id TEXT,
  ghl_response JSONB,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.ghl_sync_logs TO authenticated;
GRANT ALL ON public.ghl_sync_logs TO service_role;
ALTER TABLE public.ghl_sync_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Clients view their own GHL sync logs" ON public.ghl_sync_logs;
CREATE POLICY "Clients view their own GHL sync logs"
  ON public.ghl_sync_logs FOR SELECT
  TO authenticated
  USING (client_id = auth.uid());
CREATE INDEX IF NOT EXISTS idx_ghl_sync_logs_client_created ON public.ghl_sync_logs(client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ghl_sync_logs_lead ON public.ghl_sync_logs(lead_id);

DROP TRIGGER IF EXISTS update_client_ghl_integrations_updated_at ON public.client_ghl_integrations;

CREATE TRIGGER update_client_ghl_integrations_updated_at
  BEFORE UPDATE ON public.client_ghl_integrations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_client_ghl_field_mappings_updated_at ON public.client_ghl_field_mappings;

CREATE TRIGGER update_client_ghl_field_mappings_updated_at
  BEFORE UPDATE ON public.client_ghl_field_mappings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
