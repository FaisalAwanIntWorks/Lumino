-- ============================================================
-- Stripe Webhook Infrastructure
-- ============================================================

-- 1. Add stripe_customer_id to clients for O(1) customer lookup
--    (replaces fragile email-based customers.list query)
ALTER TABLE clients ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;
CREATE INDEX IF NOT EXISTS idx_clients_stripe_customer_id
  ON clients(stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;

-- ============================================================
-- 2. Webhook event log — idempotency & dead-letter visibility
-- ============================================================
CREATE TABLE IF NOT EXISTS stripe_webhook_events (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_event_id  TEXT        UNIQUE NOT NULL,
  event_type       TEXT        NOT NULL,
  status           TEXT        NOT NULL DEFAULT 'processing'
                               CHECK (status IN ('processing', 'processed', 'failed')),
  error_message    TEXT,
  processed_at     TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE stripe_webhook_events ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_stripe_webhook_events_event_id
  ON stripe_webhook_events(stripe_event_id);

-- Fast query for dead-letter review
CREATE INDEX IF NOT EXISTS idx_stripe_webhook_events_failed
  ON stripe_webhook_events(created_at DESC)
  WHERE status = 'failed';

-- ============================================================
-- 3. Client subscriptions cache — entitlement table
--    Written exclusively by the webhook handler.
--    check-subscription reads from here instead of polling Stripe.
-- ============================================================
CREATE TABLE IF NOT EXISTS client_subscriptions (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id             UUID        NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  stripe_customer_id    TEXT        NOT NULL,
  stripe_subscription_id TEXT       UNIQUE,
  status                TEXT        NOT NULL DEFAULT 'trialing'
                                    CHECK (status IN (
                                      'trialing', 'active', 'past_due',
                                      'canceled', 'unpaid', 'incomplete',
                                      'incomplete_expired', 'paused'
                                    )),
  plan_name             TEXT,
  plan_id               UUID        REFERENCES subscription_plans(id) ON DELETE SET NULL,
  current_period_end    TIMESTAMPTZ,
  trial_end             TIMESTAMPTZ,
  has_license_fee       BOOLEAN     NOT NULL DEFAULT FALSE,
  cancel_at_period_end  BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE client_subscriptions ENABLE ROW LEVEL SECURITY;

-- One subscription record per client (upsert target)
CREATE UNIQUE INDEX IF NOT EXISTS idx_client_subscriptions_client_id
  ON client_subscriptions(client_id);

CREATE INDEX IF NOT EXISTS idx_client_subscriptions_stripe_customer_id
  ON client_subscriptions(stripe_customer_id);

CREATE INDEX IF NOT EXISTS idx_client_subscriptions_stripe_subscription_id
  ON client_subscriptions(stripe_subscription_id)
  WHERE stripe_subscription_id IS NOT NULL;

-- Authenticated clients can read their own subscription data
CREATE POLICY "Clients can view own subscription"
  ON client_subscriptions FOR SELECT
  USING (
    client_id IN (
      SELECT id FROM clients WHERE user_id = auth.uid()
    )
  );
