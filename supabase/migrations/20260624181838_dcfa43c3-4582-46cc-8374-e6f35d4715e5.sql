CREATE TABLE public.admin_action_otp_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  action_type TEXT NOT NULL,
  target_id TEXT,
  otp_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  attempts INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT ALL ON public.admin_action_otp_tokens TO service_role;

ALTER TABLE public.admin_action_otp_tokens ENABLE ROW LEVEL SECURITY;

-- Only service role (via edge functions) reads/writes. No client-side access.
DROP POLICY IF EXISTS "service_role_full_access" ON public.admin_action_otp_tokens;
CREATE POLICY "service_role_full_access" ON public.admin_action_otp_tokens
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_admin_action_otp_lookup ON public.admin_action_otp_tokens(email, action_type, used_at, expires_at);