-- Create client activity logging table
CREATE TABLE public.client_activity_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  user_email TEXT NOT NULL,
  user_name TEXT,
  user_type TEXT NOT NULL CHECK (user_type IN ('owner', 'staff')),
  action_type TEXT NOT NULL,
  action_category TEXT NOT NULL,
  description TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create indexes for efficient querying
CREATE INDEX idx_client_activity_logs_client_id ON public.client_activity_logs(client_id);
CREATE INDEX idx_client_activity_logs_user_id ON public.client_activity_logs(user_id);
CREATE INDEX idx_client_activity_logs_created_at ON public.client_activity_logs(created_at DESC);
CREATE INDEX idx_client_activity_logs_action_type ON public.client_activity_logs(action_type);
CREATE INDEX idx_client_activity_logs_action_category ON public.client_activity_logs(action_category);

-- Enable RLS
ALTER TABLE public.client_activity_logs ENABLE ROW LEVEL SECURITY;

-- Policy: Client owners can view all logs for their client
CREATE POLICY "Client owners can view their activity logs"
ON public.client_activity_logs
FOR SELECT
USING (
  client_id IN (SELECT id FROM public.clients WHERE user_id = auth.uid())
);

-- Policy: Staff members can view logs for their assigned client
CREATE POLICY "Staff members can view their client activity logs"
ON public.client_activity_logs
FOR SELECT
USING (
  client_id IN (SELECT client_id FROM public.staff_members WHERE user_id = auth.uid())
);

-- Policy: Allow insert from authenticated users (for logging their own actions)
CREATE POLICY "Authenticated users can insert activity logs"
ON public.client_activity_logs
FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL);

-- Policy: Service role can do everything (for edge functions)
CREATE POLICY "Service role has full access to activity logs"
ON public.client_activity_logs
FOR ALL
USING (true)
WITH CHECK (true);

-- Add comment for documentation
COMMENT ON TABLE public.client_activity_logs IS 'Tracks all activities performed by clients and their staff members';