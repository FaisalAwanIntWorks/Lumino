-- Create admin_activity_logs table for tracking admin dashboard activities
CREATE TABLE public.admin_activity_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id UUID NOT NULL,
  admin_email TEXT NOT NULL,
  admin_name TEXT,
  admin_type TEXT DEFAULT 'admin_staff',
  action_type TEXT NOT NULL,
  action_category TEXT NOT NULL,
  description TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Create index for faster queries
CREATE INDEX idx_admin_activity_logs_admin_user_id ON public.admin_activity_logs(admin_user_id);
CREATE INDEX idx_admin_activity_logs_created_at ON public.admin_activity_logs(created_at DESC);
CREATE INDEX idx_admin_activity_logs_action_category ON public.admin_activity_logs(action_category);

-- Enable RLS
ALTER TABLE public.admin_activity_logs ENABLE ROW LEVEL SECURITY;

-- Policy: Only agency_admin role can view logs
CREATE POLICY "Admin users can view admin activity logs"
  ON public.admin_activity_logs FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'agency_admin'));

-- Policy: Admin users can insert their own logs
CREATE POLICY "Admin users can insert activity logs"
  ON public.admin_activity_logs FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'agency_admin'));