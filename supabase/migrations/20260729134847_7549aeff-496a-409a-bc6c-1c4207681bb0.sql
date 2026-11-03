create table if not exists public.monthly_report_runs (
  id              uuid        primary key default gen_random_uuid(),
  client_id       uuid        not null references public.clients(id) on delete cascade,
  period_month    date        not null,
  status          text        not null,
  recipient_email text,
  resend_id       text,
  metrics         jsonb,
  error_message   text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint monthly_report_runs_client_period_key unique (client_id, period_month)
);
-- [bridge] ensure columns
ALTER TABLE public.monthly_report_runs
  ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS client_id uuid,
  ADD COLUMN IF NOT EXISTS period_month date,
  ADD COLUMN IF NOT EXISTS status text,
  ADD COLUMN IF NOT EXISTS recipient_email text,
  ADD COLUMN IF NOT EXISTS resend_id text,
  ADD COLUMN IF NOT EXISTS metrics jsonb,
  ADD COLUMN IF NOT EXISTS error_message text,
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();


grant select on public.monthly_report_runs to authenticated;
grant all on public.monthly_report_runs to service_role;

create index if not exists monthly_report_runs_period_idx
  on public.monthly_report_runs (period_month desc);

alter table public.monthly_report_runs enable row level security;

drop policy if exists "admins_read_monthly_report_runs" on public.monthly_report_runs;
create policy "admins_read_monthly_report_runs"
  on public.monthly_report_runs for select
  to authenticated
  using (
    exists (
      select 1 from public.user_roles
      where user_id = auth.uid() and role = 'agency_admin'
    )
  );

drop policy if exists "clients_read_own_monthly_report_runs" on public.monthly_report_runs;
create policy "clients_read_own_monthly_report_runs"
  on public.monthly_report_runs for select
  to authenticated
  using (
    exists (
      select 1 from public.clients c
      where c.id = monthly_report_runs.client_id
        and c.user_id = auth.uid()
    )
  );

create or replace function public.trigger_monthly_client_report()
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_url text;
  v_key text;
begin
  select value into v_url from public.cron_config where key = 'supabase_url';
  select value into v_key from public.cron_config where key = 'service_role_key';

  if v_url is null or v_key is null or v_url like '%YOUR_PROJECT%' then
    raise notice 'cron_config not configured — skipping monthly client report';
    return;
  end if;

  perform net.http_post(
    url     := v_url || '/functions/v1/send-monthly-report',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || v_key
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 150000
  );
end;
$$;

revoke all on function public.trigger_monthly_client_report() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'monthly-client-report') then
    perform cron.unschedule('monthly-client-report');
  end if;

  perform cron.schedule(
    'monthly-client-report',
    '0 13-18 1 * *',
    'select public.trigger_monthly_client_report()'
  );
end;
$$;