-- Create audit logs table for tracking all system actions
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  user_email TEXT,
  user_role TEXT,
  action_type TEXT NOT NULL,
  resource_type TEXT,
  resource_id UUID,
  changes JSONB,
  ip_address INET,
  user_agent TEXT,
  severity TEXT DEFAULT 'info',
  metadata JSONB
);

-- Create security events table for tracking security incidents
CREATE TABLE IF NOT EXISTS public.security_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
  event_type TEXT NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  email_attempted TEXT,
  ip_address INET,
  user_agent TEXT,
  details JSONB,
  severity TEXT DEFAULT 'warning',
  resolved BOOLEAN DEFAULT false,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Create impersonation sessions table
CREATE TABLE IF NOT EXISTS public.impersonation_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  duration_seconds INTEGER,
  actions_performed INTEGER DEFAULT 0
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON public.audit_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON public.audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action_type ON public.audit_logs(action_type);
CREATE INDEX IF NOT EXISTS idx_security_events_timestamp ON public.security_events(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_security_events_resolved ON public.security_events(resolved) WHERE resolved = false;
CREATE INDEX IF NOT EXISTS idx_impersonation_sessions_admin ON public.impersonation_sessions(admin_user_id);
CREATE INDEX IF NOT EXISTS idx_impersonation_sessions_client ON public.impersonation_sessions(client_id);

-- Enable RLS
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.security_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.impersonation_sessions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for audit_logs
CREATE POLICY "Admins can view all audit logs"
  ON public.audit_logs
  FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'agency_admin'::app_role));

CREATE POLICY "System can insert audit logs"
  ON public.audit_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- RLS Policies for security_events
CREATE POLICY "Admins can view all security events"
  ON public.security_events
  FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'agency_admin'::app_role));

CREATE POLICY "Admins can update security events"
  ON public.security_events
  FOR UPDATE
  TO authenticated
  USING (has_role(auth.uid(), 'agency_admin'::app_role));

CREATE POLICY "System can insert security events"
  ON public.security_events
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- RLS Policies for impersonation_sessions
CREATE POLICY "Admins can view all impersonation sessions"
  ON public.impersonation_sessions
  FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'agency_admin'::app_role));

CREATE POLICY "Admins can manage impersonation sessions"
  ON public.impersonation_sessions
  FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'agency_admin'::app_role));