-- ── Nightly reconciliation cron ───────────────────────────────────────────
-- Calls the admin-reconciliation edge function every night at 02:00 UTC.
-- Requires pg_cron and pg_net extensions (enabled in Supabase by default).
--
-- SETUP REQUIRED: After deploying this migration, insert your project
-- credentials into the cron_config table below:
--
--   update public.cron_config set value = 'https://YOUR_PROJECT_REF.supabase.co'
--     where key = 'supabase_url';
--   update public.cron_config set value = 'YOUR_SERVICE_ROLE_KEY'
--     where key = 'service_role_key';

-- (already created in 20260203062015) create extension if not exists pg_cron;
-- (already created in 20260203062015) create extension if not exists pg_net;

-- Config table for cron credentials
create table if not exists public.cron_config (
  key        text primary key,
  value      text not null,
  updated_at timestamptz default now()
);
-- [bridge] ensure columns
ALTER TABLE public.cron_config
  ADD COLUMN IF NOT EXISTS key text,
  ADD COLUMN IF NOT EXISTS value text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();


insert into public.cron_config (key, value) values
  ('supabase_url',     'https://YOUR_PROJECT_REF.supabase.co'),
  ('service_role_key', 'YOUR_SERVICE_ROLE_KEY_HERE')
on conflict (key) do nothing;

-- ── Reconciliation logs ────────────────────────────────────────────────────
create table if not exists public.reconciliation_logs (
  id               uuid        primary key default gen_random_uuid(),
  run_at           timestamptz not null default now(),
  subscriptions_checked  integer not null default 0,
  mismatches_fixed       integer not null default 0,
  errors                 integer not null default 0,
  details          jsonb,
  duration_ms      integer
);
-- [bridge] ensure columns
ALTER TABLE public.reconciliation_logs
  ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS run_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS subscriptions_checked integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS mismatches_fixed integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS errors integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS details jsonb,
  ADD COLUMN IF NOT EXISTS duration_ms integer;


alter table public.reconciliation_logs enable row level security;

DROP POLICY IF EXISTS "admins_read_reconciliation_logs" ON public.reconciliation_logs;

create policy "admins_read_reconciliation_logs"
  on public.reconciliation_logs for select
  using (
    exists (
      select 1 from public.user_roles
      where user_id = auth.uid() and role = 'agency_admin'
    )
  );

-- ── Schedule the cron ──────────────────────────────────────────────────────
create or replace function public.trigger_stripe_reconciliation()
returns void language plpgsql security definer as $$
declare
  v_url  text;
  v_key  text;
begin
  select value into v_url from public.cron_config where key = 'supabase_url';
  select value into v_key from public.cron_config where key = 'service_role_key';

  if v_url is null or v_url like '%YOUR_PROJECT%' then
    raise notice 'cron_config not configured — skipping reconciliation trigger';
    return;
  end if;

  perform net.http_post(
    url     := v_url || '/functions/v1/admin-reconciliation',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || v_key
    ),
    body    := '{}'::jsonb
  );
end;
$$;

select cron.schedule(
  'nightly-stripe-reconciliation',
  '0 2 * * *',
  'select public.trigger_stripe_reconciliation()'
);
