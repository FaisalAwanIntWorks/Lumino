-- Create system_errors table for centralized error logging
CREATE TABLE public.system_errors (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
  error_source TEXT NOT NULL CHECK (error_source IN ('edge_function', 'frontend', 'database', 'external_api')),
  function_name TEXT NOT NULL,
  error_type TEXT NOT NULL CHECK (error_type IN ('network', 'auth', 'database', 'validation', 'timeout', 'permission', 'unknown')),
  error_message TEXT NOT NULL,
  error_stack TEXT,
  severity TEXT NOT NULL DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  user_id UUID,
  endpoint TEXT,
  request_metadata JSONB DEFAULT '{}',
  resolved BOOLEAN NOT NULL DEFAULT false,
  resolved_by UUID,
  resolved_at TIMESTAMPTZ,
  resolution_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create indexes for efficient querying
CREATE INDEX idx_system_errors_timestamp ON public.system_errors (timestamp DESC);
CREATE INDEX idx_system_errors_unresolved ON public.system_errors (resolved, severity, timestamp DESC) WHERE NOT resolved;
CREATE INDEX idx_system_errors_client ON public.system_errors (client_id, timestamp DESC) WHERE client_id IS NOT NULL;
CREATE INDEX idx_system_errors_function ON public.system_errors (function_name, timestamp DESC);
CREATE INDEX idx_system_errors_severity ON public.system_errors (severity, timestamp DESC);

-- Enable RLS
ALTER TABLE public.system_errors ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Only agency_admin and admin_staff can view/manage errors
CREATE POLICY "Agency admins can view all system errors"
  ON public.system_errors
  FOR SELECT
  USING (public.has_role(auth.uid(), 'agency_admin'));

CREATE POLICY "Agency admins can update system errors"
  ON public.system_errors
  FOR UPDATE
  USING (public.has_role(auth.uid(), 'agency_admin'));

-- Allow inserts from service role (edge functions)
CREATE POLICY "Service role can insert system errors"
  ON public.system_errors
  FOR INSERT
  WITH CHECK (true);

-- Create system_error_alerts table for alert rules
CREATE TABLE public.system_error_alerts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  alert_name TEXT NOT NULL,
  condition_type TEXT NOT NULL CHECK (condition_type IN ('error_count', 'error_rate', 'specific_function', 'specific_client')),
  threshold_value INTEGER NOT NULL DEFAULT 5,
  time_window_minutes INTEGER NOT NULL DEFAULT 15,
  severity_filter TEXT[] DEFAULT ARRAY['critical', 'high'],
  function_filter TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_triggered_at TIMESTAMPTZ,
  notification_channels TEXT[] DEFAULT ARRAY['in_app'],
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.system_error_alerts ENABLE ROW LEVEL SECURITY;

-- RLS Policies for alert rules
CREATE POLICY "Agency admins can manage alert rules"
  ON public.system_error_alerts
  FOR ALL
  USING (public.has_role(auth.uid(), 'agency_admin'));

-- Create trigger for updated_at
CREATE TRIGGER update_system_error_alerts_updated_at
  BEFORE UPDATE ON public.system_error_alerts
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- Insert default alert rules
INSERT INTO public.system_error_alerts (alert_name, condition_type, threshold_value, time_window_minutes, severity_filter)
VALUES 
  ('Critical Error Spike', 'error_count', 3, 15, ARRAY['critical']),
  ('High Error Volume', 'error_count', 10, 60, ARRAY['critical', 'high']),
  ('Delete Function Failures', 'specific_function', 3, 30, ARRAY['critical', 'high']);