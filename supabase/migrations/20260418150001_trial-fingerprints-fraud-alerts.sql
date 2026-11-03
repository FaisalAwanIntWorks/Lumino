-- ── Trial abuse fingerprints ──────────────────────────────────────────────
-- Stores normalized email and Stripe card fingerprints for used trials.
-- Checked in create-checkout (email) and stripe-webhook (card) to block abuse.
create table if not exists public.trial_used_fingerprints (
  id                     uuid        primary key default gen_random_uuid(),
  fingerprint_type       text        not null check (fingerprint_type in ('email', 'card')),
  fingerprint_value      text        not null,
  client_id              uuid        references public.clients(id) on delete set null,
  stripe_subscription_id text,
  created_at             timestamptz not null default now(),
  unique (fingerprint_type, fingerprint_value)
);
-- [bridge] ensure columns
ALTER TABLE public.trial_used_fingerprints
  ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS fingerprint_type text,
  ADD COLUMN IF NOT EXISTS fingerprint_value text,
  ADD COLUMN IF NOT EXISTS client_id uuid,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id text,
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();


create index if not exists trial_used_fingerprints_lookup_idx
  on public.trial_used_fingerprints (fingerprint_type, fingerprint_value);

alter table public.trial_used_fingerprints enable row level security;

-- Only agency admins can view fingerprint data (service role bypasses RLS)
DROP POLICY IF EXISTS "admins_read_trial_fingerprints" ON public.trial_used_fingerprints;
create policy "admins_read_trial_fingerprints"
  on public.trial_used_fingerprints for select
  using (
    exists (
      select 1 from public.user_roles
      where user_id = auth.uid() and role = 'agency_admin'
    )
  );

-- ── Radar / fraud alerts ──────────────────────────────────────────────────
-- Logs Stripe Radar early fraud warnings and duplicate-trial-card detections.
create table if not exists public.fraud_alerts (
  id                 uuid        primary key default gen_random_uuid(),
  alert_type         text        not null,
  stripe_customer_id text,
  client_id          uuid        references public.clients(id) on delete set null,
  stripe_object_id   text,
  amount             integer,
  reason             text,
  action_taken       text        not null default 'logged',
  raw_payload        jsonb,
  created_at         timestamptz not null default now()
);
-- [bridge] ensure columns
ALTER TABLE public.fraud_alerts
  ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS alert_type text,
  ADD COLUMN IF NOT EXISTS stripe_customer_id text,
  ADD COLUMN IF NOT EXISTS client_id uuid,
  ADD COLUMN IF NOT EXISTS stripe_object_id text,
  ADD COLUMN IF NOT EXISTS amount integer,
  ADD COLUMN IF NOT EXISTS reason text,
  ADD COLUMN IF NOT EXISTS action_taken text DEFAULT 'logged',
  ADD COLUMN IF NOT EXISTS raw_payload jsonb,
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();


create index if not exists fraud_alerts_client_idx on public.fraud_alerts (client_id);
create index if not exists fraud_alerts_type_idx   on public.fraud_alerts (alert_type);

alter table public.fraud_alerts enable row level security;

DROP POLICY IF EXISTS "admins_read_fraud_alerts" ON public.fraud_alerts;

create policy "admins_read_fraud_alerts"
  on public.fraud_alerts for select
  using (
    exists (
      select 1 from public.user_roles
      where user_id = auth.uid() and role = 'agency_admin'
    )
  );
