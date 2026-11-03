-- Create account_lockouts table for tracking locked accounts
CREATE TABLE IF NOT EXISTS public.account_lockouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  locked_until TIMESTAMP WITH TIME ZONE NOT NULL,
  requires_email_unlock BOOLEAN DEFAULT true,
  failed_attempts INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create index for efficient lookups
CREATE INDEX IF NOT EXISTS idx_account_lockouts_email ON public.account_lockouts(email);
CREATE INDEX IF NOT EXISTS idx_account_lockouts_locked_until ON public.account_lockouts(locked_until);

-- Enable RLS
ALTER TABLE public.account_lockouts ENABLE ROW LEVEL SECURITY;

-- Only service role can access this table (no public access)
CREATE POLICY "Service role only" ON public.account_lockouts
  FOR ALL USING (false);

-- Add index to failed_login_attempts for faster queries
CREATE INDEX IF NOT EXISTS idx_failed_login_attempts_email_time 
  ON public.failed_login_attempts(email, attempted_at DESC);