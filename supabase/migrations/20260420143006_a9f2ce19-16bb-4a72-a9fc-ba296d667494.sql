CREATE TABLE IF NOT EXISTS public.login_otp_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  otp_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  used boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
-- [bridge] ensure columns
ALTER TABLE public.login_otp_tokens
  ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS otp_hash text,
  ADD COLUMN IF NOT EXISTS expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS used boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();


CREATE INDEX IF NOT EXISTS idx_login_otp_tokens_email_used ON public.login_otp_tokens (email, used, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_login_otp_tokens_expires_at ON public.login_otp_tokens (expires_at);

ALTER TABLE public.login_otp_tokens ENABLE ROW LEVEL SECURITY;

-- No public policies: only service-role (edge functions) may read/write OTP tokens.
-- This table must never be accessible from client-side code.