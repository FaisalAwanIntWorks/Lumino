CREATE TABLE IF NOT EXISTS public.reconciliation_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  subscriptions_checked INTEGER NOT NULL DEFAULT 0,
  mismatches_fixed INTEGER NOT NULL DEFAULT 0,
  errors INTEGER NOT NULL DEFAULT 0,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  duration_ms INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- [bridge] ensure columns
ALTER TABLE public.reconciliation_logs
  ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS subscriptions_checked INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS mismatches_fixed INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS errors INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS details JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS duration_ms INTEGER,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();


GRANT SELECT ON public.reconciliation_logs TO authenticated;
GRANT ALL ON public.reconciliation_logs TO service_role;

ALTER TABLE public.reconciliation_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view reconciliation logs" ON public.reconciliation_logs;

CREATE POLICY "Admins can view reconciliation logs"
  ON public.reconciliation_logs FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'agency_admin'));

CREATE INDEX IF NOT EXISTS idx_reconciliation_logs_created_at
  ON public.reconciliation_logs(created_at DESC);