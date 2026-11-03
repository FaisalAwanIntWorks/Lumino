-- Create failed_login_attempts table for security auditing
CREATE TABLE public.failed_login_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  failure_reason TEXT,
  attempted_at TIMESTAMPTZ DEFAULT now()
);

-- Add indexes for efficient querying
CREATE INDEX idx_failed_login_email ON public.failed_login_attempts(email);
CREATE INDEX idx_failed_login_timestamp ON public.failed_login_attempts(attempted_at);

-- Enable RLS - only service role can access
ALTER TABLE public.failed_login_attempts ENABLE ROW LEVEL SECURITY;

-- No public access - only edge functions with service role can insert/read
-- This ensures sensitive security data is protected
CREATE POLICY "Service role only for failed_login_attempts" 
ON public.failed_login_attempts
FOR ALL USING (false);