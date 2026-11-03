-- Bridge: tables that exist in the source project (docs/FULL_MIGRATION.sql) but were never created
-- in the migration history. Definitions, RLS, policies and indexes copied from that snapshot.

CREATE TABLE IF NOT EXISTS public.admin_staff_client_access (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  admin_staff_id UUID NOT NULL REFERENCES public.admin_staff_members(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (admin_staff_id, client_id)
);

CREATE TABLE IF NOT EXISTS public.admin_logging_information (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  admin_user_id UUID NOT NULL,
  admin_email TEXT NOT NULL,
  admin_name TEXT,
  action_category TEXT NOT NULL,
  action_type TEXT NOT NULL,
  description TEXT NOT NULL,
  resource_type TEXT,
  resource_id TEXT,
  target_client_id UUID REFERENCES public.clients(id),
  target_client_name TEXT,
  ip_address TEXT,
  user_agent TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ring_configured_by_client (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID REFERENCES public.clients(id),
  session_id TEXT,
  style_id TEXT,
  style_name TEXT,
  style_price NUMERIC DEFAULT 0,
  shank_id TEXT,
  shank_name TEXT,
  shank_price NUMERIC DEFAULT 0,
  visual_color_id TEXT,
  visual_color_name TEXT,
  visual_color_price NUMERIC DEFAULT 0,
  shape_id TEXT,
  shape_name TEXT,
  shape_price NUMERIC DEFAULT 0,
  metal_id TEXT,
  metal_name TEXT,
  metal_price NUMERIC DEFAULT 0,
  carat_value TEXT,
  carat_price NUMERIC DEFAULT 0,
  size TEXT,
  size_price NUMERIC DEFAULT 0,
  engraving_text TEXT,
  engraving_price NUMERIC DEFAULT 0,
  stone_type TEXT,
  stone_name TEXT,
  stone_price NUMERIC DEFAULT 0,
  total_price NUMERIC DEFAULT 0,
  customer_name TEXT,
  customer_email TEXT,
  customer_phone TEXT,
  customer_notes TEXT,
  master_db_id UUID,
  image_url TEXT,
  status TEXT DEFAULT 'configured',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE public.admin_logging_information IS 'Tracks all admin dashboard activities for monitoring and audit purposes';
ALTER TABLE public.admin_logging_information ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_staff_client_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ring_configured_by_client ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Agency admins can view all admin logs" ON public.admin_logging_information;
CREATE POLICY "Agency admins can view all admin logs" ON public.admin_logging_information FOR SELECT USING (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'agency_admin'));
DROP POLICY IF EXISTS "Authenticated admins can insert logs" ON public.admin_logging_information;
CREATE POLICY "Authenticated admins can insert logs" ON public.admin_logging_information FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'agency_admin'));
DROP POLICY IF EXISTS "Agency admins can manage client access" ON public.admin_staff_client_access;
CREATE POLICY "Agency admins can manage client access" ON public.admin_staff_client_access FOR ALL TO authenticated USING (has_role(auth.uid(), 'agency_admin')) WITH CHECK (has_role(auth.uid(), 'agency_admin'));
DROP POLICY IF EXISTS "Allow public read access" ON public.ring_configured_by_client;
CREATE POLICY "Allow public read access" ON public.ring_configured_by_client FOR SELECT USING (true);
DROP POLICY IF EXISTS "Allow public insert access" ON public.ring_configured_by_client;
CREATE POLICY "Allow public insert access" ON public.ring_configured_by_client FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "Allow public update access" ON public.ring_configured_by_client;
CREATE POLICY "Allow public update access" ON public.ring_configured_by_client FOR UPDATE USING (true);
CREATE INDEX IF NOT EXISTS idx_admin_logging_created_at ON public.admin_logging_information(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_logging_admin_user_id ON public.admin_logging_information(admin_user_id);
CREATE INDEX IF NOT EXISTS idx_admin_logging_action_type ON public.admin_logging_information(action_type);
CREATE INDEX IF NOT EXISTS idx_admin_logging_target_client ON public.admin_logging_information(target_client_id);
CREATE INDEX IF NOT EXISTS idx_admin_staff_client_access_admin ON public.admin_staff_client_access(admin_staff_id);
CREATE INDEX IF NOT EXISTS idx_admin_staff_client_access_client ON public.admin_staff_client_access(client_id);
CREATE INDEX IF NOT EXISTS idx_ring_configured_client_id ON public.ring_configured_by_client(client_id);
CREATE INDEX IF NOT EXISTS idx_ring_configured_session_id ON public.ring_configured_by_client(session_id);
