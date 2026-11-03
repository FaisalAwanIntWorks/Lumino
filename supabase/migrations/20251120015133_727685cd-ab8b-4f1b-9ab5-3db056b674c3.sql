-- Create client health metrics table
CREATE TABLE IF NOT EXISTS public.client_health_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  snapshot_date DATE NOT NULL DEFAULT CURRENT_DATE,
  health_score INTEGER NOT NULL DEFAULT 50,
  activity_score INTEGER NOT NULL DEFAULT 0,
  growth_rate NUMERIC DEFAULT 0,
  churn_risk_score INTEGER NOT NULL DEFAULT 0,
  last_activity_date TIMESTAMPTZ,
  orders_count_30d INTEGER DEFAULT 0,
  designs_count_30d INTEGER DEFAULT 0,
  usage_efficiency NUMERIC DEFAULT 0,
  engagement_level TEXT DEFAULT 'medium',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(client_id, snapshot_date)
);

-- Create data cleanup logs table
CREATE TABLE IF NOT EXISTS public.data_cleanup_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  executed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  table_name TEXT NOT NULL,
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  records_deleted INTEGER NOT NULL DEFAULT 0,
  retention_days INTEGER NOT NULL,
  execution_time_ms INTEGER,
  status TEXT DEFAULT 'completed',
  error_message TEXT
);

-- Create GDPR requests table
CREATE TABLE IF NOT EXISTS public.gdpr_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  request_type TEXT NOT NULL,
  customer_email TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  data_exported_url TEXT,
  notes TEXT
);

-- Create custom alert rules table
CREATE TABLE IF NOT EXISTS public.custom_alert_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  rule_name TEXT NOT NULL,
  metric_type TEXT NOT NULL,
  threshold_value NUMERIC NOT NULL,
  threshold_percentage INTEGER,
  severity TEXT DEFAULT 'warning',
  notification_enabled BOOLEAN DEFAULT true,
  notification_emails TEXT[],
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_client_health_metrics_client ON public.client_health_metrics(client_id);
CREATE INDEX IF NOT EXISTS idx_client_health_metrics_date ON public.client_health_metrics(snapshot_date DESC);
CREATE INDEX IF NOT EXISTS idx_data_cleanup_logs_executed ON public.data_cleanup_logs(executed_at DESC);
CREATE INDEX IF NOT EXISTS idx_gdpr_requests_status ON public.gdpr_requests(status) WHERE status != 'completed';
CREATE INDEX IF NOT EXISTS idx_custom_alert_rules_client ON public.custom_alert_rules(client_id);
CREATE INDEX IF NOT EXISTS idx_custom_alert_rules_active ON public.custom_alert_rules(is_active) WHERE is_active = true;

-- Enable RLS
ALTER TABLE public.client_health_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.data_cleanup_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gdpr_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.custom_alert_rules ENABLE ROW LEVEL SECURITY;

-- RLS Policies for client_health_metrics
CREATE POLICY "Admins can view all health metrics"
  ON public.client_health_metrics
  FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'agency_admin'::app_role));

CREATE POLICY "System can manage health metrics"
  ON public.client_health_metrics
  FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'agency_admin'::app_role));

-- RLS Policies for data_cleanup_logs
CREATE POLICY "Admins can view cleanup logs"
  ON public.data_cleanup_logs
  FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'agency_admin'::app_role));

CREATE POLICY "System can create cleanup logs"
  ON public.data_cleanup_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- RLS Policies for gdpr_requests
CREATE POLICY "Admins can view all GDPR requests"
  ON public.gdpr_requests
  FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'agency_admin'::app_role));

CREATE POLICY "Admins can manage GDPR requests"
  ON public.gdpr_requests
  FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'agency_admin'::app_role));

-- RLS Policies for custom_alert_rules
CREATE POLICY "Admins can view all alert rules"
  ON public.custom_alert_rules
  FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'agency_admin'::app_role));

CREATE POLICY "Admins can manage alert rules"
  ON public.custom_alert_rules
  FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'agency_admin'::app_role));

CREATE POLICY "Clients can view their alert rules"
  ON public.custom_alert_rules
  FOR SELECT
  TO authenticated
  USING (client_id = get_user_client_id(auth.uid()));

-- Create trigger for updated_at
CREATE OR REPLACE FUNCTION update_custom_alert_rules_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_custom_alert_rules_updated_at
  BEFORE UPDATE ON public.custom_alert_rules
  FOR EACH ROW
  EXECUTE FUNCTION update_custom_alert_rules_updated_at();