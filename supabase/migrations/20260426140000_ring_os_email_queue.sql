-- F3: Email queue table for reliable lead-notification delivery.
-- Rows are inserted when the form submits and processed by a Supabase cron
-- job (pg_cron) that retries failed sends up to max_attempts times over 24h.
-- If all retries fail the row status becomes 'failed' and can be alerting on.

CREATE TABLE IF NOT EXISTS email_queue (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id       uuid        REFERENCES clients(id) ON DELETE CASCADE,
  to_email        text        NOT NULL,
  subject         text        NOT NULL,
  html_body       text        NOT NULL,
  email_type      text        NOT NULL,
  metadata        jsonb       NOT NULL DEFAULT '{}',
  attempt_count   int         NOT NULL DEFAULT 0,
  max_attempts    int         NOT NULL DEFAULT 3,
  status          text        NOT NULL DEFAULT 'pending'
                              CHECK (status IN ('pending', 'processing', 'sent', 'failed')),
  last_attempted_at timestamptz,
  next_attempt_at   timestamptz NOT NULL DEFAULT now(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
-- [bridge] ensure columns
ALTER TABLE public.email_queue
  ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS client_id uuid,
  ADD COLUMN IF NOT EXISTS to_email text,
  ADD COLUMN IF NOT EXISTS subject text,
  ADD COLUMN IF NOT EXISTS html_body text,
  ADD COLUMN IF NOT EXISTS email_type text,
  ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS attempt_count int DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_attempts int DEFAULT 3,
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS last_attempted_at timestamptz,
  ADD COLUMN IF NOT EXISTS next_attempt_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();


-- Partial index: only pending rows need to be polled.
CREATE INDEX IF NOT EXISTS idx_email_queue_pending
  ON email_queue (next_attempt_at)
  WHERE status = 'pending';

-- Admin / audit index.
CREATE INDEX IF NOT EXISTS idx_email_queue_client_created
  ON email_queue (client_id, created_at DESC);

-- Auto-update updated_at.
CREATE OR REPLACE FUNCTION set_email_queue_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_email_queue_updated_at ON email_queue;
CREATE TRIGGER trg_email_queue_updated_at
  BEFORE UPDATE ON email_queue
  FOR EACH ROW EXECUTE FUNCTION set_email_queue_updated_at();

-- RLS: service role can read/write; clients can only see their own rows.
ALTER TABLE email_queue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_full_access" ON email_queue;

CREATE POLICY "service_role_full_access" ON email_queue
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "client_read_own" ON email_queue;

CREATE POLICY "client_read_own" ON email_queue
  FOR SELECT USING (
    client_id IN (SELECT id FROM clients WHERE user_id = auth.uid())
  );

-- G7 (placeholder): TODO — once Supabase Vault is enabled, migrate
-- customer_email + customer_phone in design_requests to encrypted columns.
-- At that point also encrypt the to_email column in this table.
-- Reference: https://supabase.com/docs/guides/database/vault
