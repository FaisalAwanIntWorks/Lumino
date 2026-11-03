-- Phase 2A: Backup Logs Table
CREATE TABLE IF NOT EXISTS backup_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  backup_date TIMESTAMPTZ DEFAULT now(),
  backup_type TEXT NOT NULL CHECK (backup_type IN ('daily', 'weekly', 'manual')),
  status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('success', 'failed', 'in_progress')),
  file_path TEXT,
  file_size_mb NUMERIC,
  tables_backed_up TEXT[],
  error_message TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Phase 3B: Performance Logs Table
CREATE TABLE IF NOT EXISTS performance_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  timestamp TIMESTAMPTZ DEFAULT now(),
  endpoint TEXT NOT NULL,
  method TEXT,
  duration_ms INTEGER NOT NULL,
  client_id UUID REFERENCES clients(id),
  status_code INTEGER,
  user_agent TEXT,
  metadata JSONB DEFAULT '{}'::jsonb
);

-- Enable RLS
ALTER TABLE backup_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE performance_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies for backup_logs
CREATE POLICY "Admins can view all backup logs"
  ON backup_logs FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'agency_admin'::app_role));

CREATE POLICY "System can create backup logs"
  ON backup_logs FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- RLS Policies for performance_logs
CREATE POLICY "Admins can view all performance logs"
  ON performance_logs FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'agency_admin'::app_role));

CREATE POLICY "System can create performance logs"
  ON performance_logs FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Phase 3A: Critical Database Indexes
-- Orders performance (most queried table)
CREATE INDEX IF NOT EXISTS idx_orders_client_id ON orders(client_id);
CREATE INDEX IF NOT EXISTS idx_orders_client_status ON orders(client_id, status);
CREATE INDEX IF NOT EXISTS idx_orders_customer_email ON orders(customer_email);

-- Analytics (heavy write/read volume)
CREATE INDEX IF NOT EXISTS idx_analytics_event_type ON analytics_events(event_type);

-- Products & Variations (embed widget queries)
CREATE INDEX IF NOT EXISTS idx_products_status ON products(status) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_products_agency ON products(agency_id, status);
CREATE INDEX IF NOT EXISTS idx_variations_product ON product_variations(product_id, is_active);
CREATE INDEX IF NOT EXISTS idx_client_products_enabled ON client_products(client_id, is_enabled) WHERE is_enabled = true;

-- Saved designs (customer feature)
CREATE INDEX IF NOT EXISTS idx_saved_designs_customer ON saved_designs(customer_email);
CREATE INDEX IF NOT EXISTS idx_saved_designs_client ON saved_designs(client_id);

-- Usage monitoring
CREATE INDEX IF NOT EXISTS idx_usage_snapshots_client_date ON usage_snapshots(client_id, snapshot_date DESC);

-- Audit logs (security dashboard)
CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(user_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action_type, timestamp DESC);

-- Security events
CREATE INDEX IF NOT EXISTS idx_security_events_unresolved ON security_events(resolved, timestamp DESC) WHERE resolved = false;
CREATE INDEX IF NOT EXISTS idx_security_events_type ON security_events(event_type, timestamp DESC);

-- Impersonation tracking
CREATE INDEX IF NOT EXISTS idx_impersonation_admin ON impersonation_sessions(admin_user_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_impersonation_client ON impersonation_sessions(client_id, started_at DESC);

-- Performance logs indexes
CREATE INDEX IF NOT EXISTS idx_perf_endpoint_time ON performance_logs(endpoint, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_perf_slow_queries ON performance_logs(duration_ms DESC) WHERE duration_ms > 1000;