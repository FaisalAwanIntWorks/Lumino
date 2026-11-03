-- ============================================================
-- Migration 1: Ring OS hot-path composite indexes
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_ring_questions_lookup
  ON client_ring_form_questions(client_id, is_enabled, display_order);

CREATE INDEX IF NOT EXISTS idx_ring_form_config_client
  ON client_ring_form_config(client_id);

CREATE INDEX IF NOT EXISTS idx_design_requests_client_created
  ON design_requests(client_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ring_preview_images_lead
  ON ring_preview_images(lead_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_analytics_events_client_time
  ON analytics_events(client_id, created_at DESC);

-- ============================================================
-- Migration 2: Default ring_form_config row for every client
-- ============================================================
CREATE OR REPLACE FUNCTION create_default_ring_form_config()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO client_ring_form_config (
    client_id,
    onboarding_completed,
    submission_mode,
    ai_image_enabled
  )
  VALUES (NEW.id, false, 'contact', false)
  ON CONFLICT (client_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_new_client_ring_form_config ON clients;

CREATE TRIGGER trg_new_client_ring_form_config
  AFTER INSERT ON clients
  FOR EACH ROW
  EXECUTE FUNCTION create_default_ring_form_config();

INSERT INTO client_ring_form_config (client_id, onboarding_completed, submission_mode, ai_image_enabled)
SELECT id, false, 'contact', false
FROM clients
WHERE id NOT IN (SELECT client_id FROM client_ring_form_config WHERE client_id IS NOT NULL)
ON CONFLICT (client_id) DO NOTHING;

-- ============================================================
-- Migration 3: Email queue table for reliable lead notifications
-- ============================================================
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


CREATE INDEX IF NOT EXISTS idx_email_queue_pending
  ON email_queue (next_attempt_at)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_email_queue_client_created
  ON email_queue (client_id, created_at DESC);

CREATE OR REPLACE FUNCTION set_email_queue_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_email_queue_updated_at ON email_queue;
CREATE TRIGGER trg_email_queue_updated_at
  BEFORE UPDATE ON email_queue
  FOR EACH ROW EXECUTE FUNCTION set_email_queue_updated_at();

ALTER TABLE email_queue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_full_access" ON email_queue;
CREATE POLICY "service_role_full_access" ON email_queue
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "client_read_own" ON email_queue;
CREATE POLICY "client_read_own" ON email_queue
  FOR SELECT USING (
    client_id IN (SELECT id FROM clients WHERE user_id = auth.uid())
  );