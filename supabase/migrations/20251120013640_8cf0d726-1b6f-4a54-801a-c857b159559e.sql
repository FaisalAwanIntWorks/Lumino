-- Create usage snapshots table for daily rollup of metrics
CREATE TABLE IF NOT EXISTS public.usage_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
  snapshot_date DATE NOT NULL,
  database_size_mb NUMERIC DEFAULT 0,
  database_rows INT DEFAULT 0,
  storage_size_mb NUMERIC DEFAULT 0,
  storage_files_count INT DEFAULT 0,
  function_invocations INT DEFAULT 0,
  bandwidth_mb NUMERIC DEFAULT 0,
  analytics_events_count INT DEFAULT 0,
  ai_tokens_used INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(client_id, snapshot_date)
);

-- Create usage alerts table
CREATE TABLE IF NOT EXISTS public.usage_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
  alert_type TEXT NOT NULL CHECK (alert_type IN ('database', 'storage', 'functions', 'bandwidth', 'ai')),
  threshold_percentage INT NOT NULL CHECK (threshold_percentage IN (50, 75, 90)),
  current_usage NUMERIC NOT NULL,
  limit_value NUMERIC NOT NULL,
  message TEXT,
  severity TEXT DEFAULT 'info' CHECK (severity IN ('info', 'warning', 'critical')),
  triggered_at TIMESTAMPTZ DEFAULT now(),
  acknowledged BOOLEAN DEFAULT false,
  acknowledged_at TIMESTAMPTZ
);

-- Create data retention policies table
CREATE TABLE IF NOT EXISTS public.retention_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
  table_name TEXT NOT NULL,
  retention_days INT NOT NULL DEFAULT 90,
  auto_cleanup BOOLEAN DEFAULT true,
  last_cleanup_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(client_id, table_name)
);

-- Enable RLS
ALTER TABLE public.usage_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usage_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.retention_policies ENABLE ROW LEVEL SECURITY;

-- RLS Policies for usage_snapshots
CREATE POLICY "Clients can view their own usage snapshots"
  ON public.usage_snapshots FOR SELECT
  USING (client_id = get_user_client_id(auth.uid()));

CREATE POLICY "Admins can view all usage snapshots"
  ON public.usage_snapshots FOR SELECT
  USING (has_role(auth.uid(), 'agency_admin'));

CREATE POLICY "System can insert usage snapshots"
  ON public.usage_snapshots FOR INSERT
  WITH CHECK (true);

-- RLS Policies for usage_alerts
CREATE POLICY "Clients can view their own alerts"
  ON public.usage_alerts FOR SELECT
  USING (client_id = get_user_client_id(auth.uid()));

CREATE POLICY "Clients can acknowledge their own alerts"
  ON public.usage_alerts FOR UPDATE
  USING (client_id = get_user_client_id(auth.uid()));

CREATE POLICY "Admins can view all alerts"
  ON public.usage_alerts FOR SELECT
  USING (has_role(auth.uid(), 'agency_admin'));

CREATE POLICY "System can create alerts"
  ON public.usage_alerts FOR INSERT
  WITH CHECK (true);

-- RLS Policies for retention_policies
CREATE POLICY "Clients can manage their own retention policies"
  ON public.retention_policies FOR ALL
  USING (client_id = get_user_client_id(auth.uid()));

CREATE POLICY "Admins can manage all retention policies"
  ON public.retention_policies FOR ALL
  USING (has_role(auth.uid(), 'agency_admin'));

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_usage_snapshots_client_date ON public.usage_snapshots(client_id, snapshot_date DESC);
CREATE INDEX IF NOT EXISTS idx_usage_alerts_client_unack ON public.usage_alerts(client_id, acknowledged) WHERE acknowledged = false;
CREATE INDEX IF NOT EXISTS idx_retention_policies_client ON public.retention_policies(client_id);

-- Create trigger for updating retention_policies updated_at
CREATE TRIGGER update_retention_policies_updated_at
  BEFORE UPDATE ON public.retention_policies
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default retention policies for existing clients
INSERT INTO public.retention_policies (client_id, table_name, retention_days, auto_cleanup)
SELECT id, 'analytics_events', 90, true FROM public.clients
ON CONFLICT (client_id, table_name) DO NOTHING;

INSERT INTO public.retention_policies (client_id, table_name, retention_days, auto_cleanup)
SELECT id, 'ai_chat_messages', 60, true FROM public.clients
ON CONFLICT (client_id, table_name) DO NOTHING;

INSERT INTO public.retention_policies (client_id, table_name, retention_days, auto_cleanup)
SELECT id, 'saved_designs', 180, false FROM public.clients
ON CONFLICT (client_id, table_name) DO NOTHING;