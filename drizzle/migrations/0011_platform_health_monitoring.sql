-- ============================================================================
-- Platform Health monitoring: persistent checks, uptime rollups, incidents,
-- quota snapshots, alert log, thresholds, and the crons that drive them.
--
-- Driven by the `platform-health-monitor` edge function (once a day via
-- pg_cron -> pg_net, using the existing cron_config credentials pattern).
-- Daily cadence is deliberate: this runs on the Lovable-managed Supabase
-- project, so it must stay cheap in rows and edge invocations.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Raw check results (one row per component per run). Pruned after 400 days;
--    long-term history lives in platform_health_daily.
-- ----------------------------------------------------------------------------
create table if not exists public.platform_health_checks (
  id          uuid        primary key default gen_random_uuid(),
  run_id      uuid        not null,
  checked_at  timestamptz not null default now(),
  component   text        not null,
  category    text        not null,
  status      text        not null check (status in ('operational', 'degraded', 'down')),
  latency_ms  integer,
  message     text,
  details     jsonb       not null default '{}'::jsonb,
  source      text        not null default 'cron' check (source in ('cron', 'manual'))
);

create index if not exists platform_health_checks_component_time_idx
  on public.platform_health_checks (component, checked_at desc);
create index if not exists platform_health_checks_time_idx
  on public.platform_health_checks (checked_at desc);
create index if not exists platform_health_checks_run_idx
  on public.platform_health_checks (run_id);

alter table public.platform_health_checks enable row level security;
grant select on public.platform_health_checks to authenticated;
grant all    on public.platform_health_checks to service_role;

drop policy if exists "admins_read_platform_health_checks" on public.platform_health_checks;
create policy "admins_read_platform_health_checks"
  on public.platform_health_checks for select to authenticated
  using (public.has_role(auth.uid(), 'agency_admin'));

-- ----------------------------------------------------------------------------
-- 2. Daily rollup per component (permanent). Refreshed for "today" after every
--    monitor run and finalised for "yesterday" by the nightly cron.
-- ----------------------------------------------------------------------------
create table if not exists public.platform_health_daily (
  day             date    not null,
  component       text    not null,
  category        text    not null,
  checks_total    integer not null default 0,
  checks_ok       integer not null default 0,
  checks_degraded integer not null default 0,
  checks_down     integer not null default 0,
  avg_latency_ms  integer,
  p95_latency_ms  integer,
  max_latency_ms  integer,
  uptime_pct      numeric(6,2),   -- % of checks that were not "down"
  healthy_pct     numeric(6,2),   -- % of checks that were fully operational
  updated_at      timestamptz not null default now(),
  primary key (day, component)
);

create index if not exists platform_health_daily_day_idx
  on public.platform_health_daily (day desc);

alter table public.platform_health_daily enable row level security;
grant select on public.platform_health_daily to authenticated;
grant all    on public.platform_health_daily to service_role;

drop policy if exists "admins_read_platform_health_daily" on public.platform_health_daily;
create policy "admins_read_platform_health_daily"
  on public.platform_health_daily for select to authenticated
  using (public.has_role(auth.uid(), 'agency_admin'));

-- ----------------------------------------------------------------------------
-- 3. Incidents: a contiguous stretch of non-operational checks for a component.
-- ----------------------------------------------------------------------------
create table if not exists public.platform_health_incidents (
  id                   uuid        primary key default gen_random_uuid(),
  component            text        not null,
  category             text        not null,
  status               text        not null check (status in ('degraded', 'down')),
  started_at           timestamptz not null default now(),
  resolved_at          timestamptz,
  checks_failed        integer     not null default 1,
  first_message        text,
  last_message         text,
  notified_at          timestamptz,
  resolved_notified_at timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

-- Only one open incident per component at a time.
create unique index if not exists platform_health_incidents_open_component_idx
  on public.platform_health_incidents (component) where resolved_at is null;
create index if not exists platform_health_incidents_started_idx
  on public.platform_health_incidents (started_at desc);

alter table public.platform_health_incidents enable row level security;
grant select on public.platform_health_incidents to authenticated;
grant all    on public.platform_health_incidents to service_role;

drop policy if exists "admins_read_platform_health_incidents" on public.platform_health_incidents;
create policy "admins_read_platform_health_incidents"
  on public.platform_health_incidents for select to authenticated
  using (public.has_role(auth.uid(), 'agency_admin'));

-- ----------------------------------------------------------------------------
-- 4. Quota / usage snapshots (Resend sends, OpenRouter credits, DB size, ...).
--    Written at most hourly per metric (or when the alert level changes).
-- ----------------------------------------------------------------------------
create table if not exists public.platform_quota_snapshots (
  id          uuid        primary key default gen_random_uuid(),
  captured_at timestamptz not null default now(),
  service     text        not null,
  metric      text        not null,
  label       text        not null,
  used        numeric     not null default 0,
  quota_limit numeric,
  pct         numeric(6,2),
  unit        text        not null default '',
  level       text        not null default 'ok' check (level in ('ok', 'warning', 'critical', 'info')),
  details     jsonb       not null default '{}'::jsonb
);

create index if not exists platform_quota_snapshots_metric_time_idx
  on public.platform_quota_snapshots (service, metric, captured_at desc);
create index if not exists platform_quota_snapshots_time_idx
  on public.platform_quota_snapshots (captured_at desc);

alter table public.platform_quota_snapshots enable row level security;
grant select on public.platform_quota_snapshots to authenticated;
grant all    on public.platform_quota_snapshots to service_role;

drop policy if exists "admins_read_platform_quota_snapshots" on public.platform_quota_snapshots;
create policy "admins_read_platform_quota_snapshots"
  on public.platform_quota_snapshots for select to authenticated
  using (public.has_role(auth.uid(), 'agency_admin'));

-- ----------------------------------------------------------------------------
-- 5. Alert log: every email / in-app alert the monitor sent, plus stored
--    monthly reports (alert_type = 'monthly_report', details = report JSON).
-- ----------------------------------------------------------------------------
create table if not exists public.platform_health_alerts (
  id           uuid        primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),
  alert_type   text        not null check (alert_type in (
                 'incident_open', 'incident_resolved', 'quota_warning', 'quota_critical',
                 'monthly_report', 'test_alert')),
  alert_key    text        not null,
  component    text,
  severity     text        not null default 'warning' check (severity in ('info', 'warning', 'critical')),
  title        text        not null,
  message      text,
  recipients   text[]      not null default '{}',
  email_status text        not null default 'skipped' check (email_status in ('sent', 'failed', 'skipped')),
  email_error  text,
  resend_id    text,
  details      jsonb       not null default '{}'::jsonb
);

create index if not exists platform_health_alerts_time_idx
  on public.platform_health_alerts (created_at desc);
create index if not exists platform_health_alerts_key_time_idx
  on public.platform_health_alerts (alert_key, created_at desc);
create index if not exists platform_health_alerts_type_idx
  on public.platform_health_alerts (alert_type, created_at desc);

alter table public.platform_health_alerts enable row level security;
grant select on public.platform_health_alerts to authenticated;
grant all    on public.platform_health_alerts to service_role;

drop policy if exists "admins_read_platform_health_alerts" on public.platform_health_alerts;
create policy "admins_read_platform_health_alerts"
  on public.platform_health_alerts for select to authenticated
  using (public.has_role(auth.uid(), 'agency_admin'));

-- ----------------------------------------------------------------------------
-- 6. Thresholds & limits. Readable by admins, editable by super admins only.
-- ----------------------------------------------------------------------------
create table if not exists public.platform_health_settings (
  key         text        primary key,
  value       jsonb       not null,
  description text,
  updated_at  timestamptz not null default now(),
  updated_by  uuid
);

alter table public.platform_health_settings enable row level security;
grant select, update on public.platform_health_settings to authenticated;
grant all            on public.platform_health_settings to service_role;

drop policy if exists "admins_read_platform_health_settings" on public.platform_health_settings;
create policy "admins_read_platform_health_settings"
  on public.platform_health_settings for select to authenticated
  using (public.has_role(auth.uid(), 'agency_admin'));

drop policy if exists "super_admins_update_platform_health_settings" on public.platform_health_settings;
create policy "super_admins_update_platform_health_settings"
  on public.platform_health_settings for update to authenticated
  using (public.is_super_admin(auth.uid()))
  with check (public.is_super_admin(auth.uid()));

insert into public.platform_health_settings (key, value, description) values
  ('alerts_enabled',            'true',   'Master switch for email + in-app alerts'),
  ('alert_emails',              '[]',     'Extra recipients (super admins always receive alerts)'),
  ('warning_pct',               '80',     'Quota usage % that triggers a warning alert'),
  ('critical_pct',              '95',     'Quota usage % that triggers a critical alert'),
  ('latency_degraded_ms',       '4000',   'A check slower than this is reported as degraded'),
  ('incident_confirm_failures', '1',      'Consecutive failed checks before an outage email is sent (checks run daily)'),
  ('quota_alert_cooldown_hours','24',     'Do not repeat the same quota alert within this window'),
  ('resend_daily_limit',        '100',    'Resend plan: emails per day'),
  ('resend_monthly_limit',      '3000',   'Resend plan: emails per month'),
  ('email_failure_rate_pct',    '20',     'Email failure rate (24h) above this marks Resend degraded'),
  ('openrouter_low_credit_usd', '5',      'Alert when OpenRouter remaining credit drops below this'),
  ('db_size_limit_mb',          '8192',   'Supabase plan database limit in MB (Pro = 8192)'),
  ('storage_limit_mb',          '102400', 'Supabase plan storage limit in MB (Pro = 102400)'),
  ('edge_errors_per_hour',      '25',     'Edge function errors/hour above this marks Edge Functions degraded'),
  ('stripe_failed_webhooks_24h','1',      'Failed Stripe webhook events in 24h at/above this marks Stripe degraded')
on conflict (key) do nothing;

-- ----------------------------------------------------------------------------
-- 7. Helper functions used by the monitor (service role) and the dashboard.
-- ----------------------------------------------------------------------------

-- Database size (bytes) of this project.
create or replace function public.get_platform_db_size_bytes()
returns bigint
language sql stable security definer set search_path = public
as $$ select pg_database_size(current_database()); $$;

-- Total bytes stored in Supabase Storage.
create or replace function public.get_platform_storage_size_bytes()
returns bigint
language sql stable security definer set search_path = public
as $$
  select coalesce(sum((o.metadata->>'size')::bigint), 0)
  from storage.objects o
  where o.metadata ? 'size';
$$;

-- pg_cron health: every job with its last run outcome and 24h failure count.
create or replace function public.get_cron_job_health()
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_result jsonb;
begin
  select coalesce(jsonb_agg(row_to_json(j) order by j.jobname), '[]'::jsonb) into v_result
  from (
    select
      cj.jobid,
      cj.jobname,
      cj.schedule,
      cj.active,
      lr.status      as last_status,
      lr.start_time  as last_run_at,
      lr.return_message as last_message,
      (select count(*) from cron.job_run_details d
        where d.jobid = cj.jobid and d.status = 'failed'
          and d.start_time >= now() - interval '24 hours') as failed_24h
    from cron.job cj
    left join lateral (
      select status, start_time, return_message
      from cron.job_run_details d
      where d.jobid = cj.jobid
      order by start_time desc
      limit 1
    ) lr on true
  ) j;
  return v_result;
exception when others then
  return jsonb_build_object('error', sqlerrm);
end;
$$;

revoke all on function public.get_platform_db_size_bytes()      from public, anon, authenticated;
revoke all on function public.get_platform_storage_size_bytes() from public, anon, authenticated;
revoke all on function public.get_cron_job_health()             from public, anon, authenticated;

-- Roll one day of raw checks into platform_health_daily.
create or replace function public.rollup_platform_health_daily(p_day date)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.platform_health_daily as d (
    day, component, category, checks_total, checks_ok, checks_degraded, checks_down,
    avg_latency_ms, p95_latency_ms, max_latency_ms, uptime_pct, healthy_pct, updated_at
  )
  select
    p_day,
    c.component,
    max(c.category),
    count(*),
    count(*) filter (where c.status = 'operational'),
    count(*) filter (where c.status = 'degraded'),
    count(*) filter (where c.status = 'down'),
    round(avg(c.latency_ms) filter (where c.latency_ms is not null and c.latency_ms > 0))::int,
    (percentile_cont(0.95) within group (order by c.latency_ms)
       filter (where c.latency_ms is not null and c.latency_ms > 0))::int,
    max(c.latency_ms),
    round(100.0 * count(*) filter (where c.status <> 'down') / count(*), 2),
    round(100.0 * count(*) filter (where c.status = 'operational') / count(*), 2),
    now()
  from public.platform_health_checks c
  where c.checked_at >= p_day::timestamptz
    and c.checked_at <  (p_day + 1)::timestamptz
  group by c.component
  on conflict (day, component) do update set
    category        = excluded.category,
    checks_total    = excluded.checks_total,
    checks_ok       = excluded.checks_ok,
    checks_degraded = excluded.checks_degraded,
    avg_latency_ms  = excluded.avg_latency_ms,
    p95_latency_ms  = excluded.p95_latency_ms,
    max_latency_ms  = excluded.max_latency_ms,
    uptime_pct      = excluded.uptime_pct,
    healthy_pct     = excluded.healthy_pct,
    updated_at      = now();
end;
$$;

-- Retention: raw checks and quota snapshots 400 days (a daily run is ~15 rows).
create or replace function public.prune_platform_health_data()
returns void
language plpgsql security definer set search_path = public
as $$
begin
  delete from public.platform_health_checks   where checked_at  < now() - interval '400 days';
  delete from public.platform_quota_snapshots where captured_at < now() - interval '400 days';
end;
$$;

revoke all on function public.rollup_platform_health_daily(date) from public, anon, authenticated;
revoke all on function public.prune_platform_health_data()       from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 8. Dashboard RPCs (admin-only).
-- ----------------------------------------------------------------------------

-- Latest result per component.
create or replace function public.get_platform_health_latest()
returns setof public.platform_health_checks
language plpgsql stable security definer set search_path = public
as $$
begin
  if not public.has_role(auth.uid(), 'agency_admin') then
    raise exception 'Admin access required' using errcode = '42501';
  end if;
  return query
    select distinct on (c.component) c.*
    from public.platform_health_checks c
    where c.checked_at >= now() - interval '7 days'
    order by c.component, c.checked_at desc;
end;
$$;

-- Per-component uptime/latency/incident summary for the last N days.
create or replace function public.get_platform_health_overview(p_days integer default 30)
returns table (
  component        text,
  category         text,
  uptime_pct       numeric,
  healthy_pct      numeric,
  avg_latency_ms   integer,
  p95_latency_ms   integer,
  checks_total     bigint,
  checks_down      bigint,
  checks_degraded  bigint,
  incidents        bigint,
  downtime_seconds bigint
)
language plpgsql stable security definer set search_path = public
as $$
declare
  v_from date := (now() at time zone 'utc')::date - (greatest(p_days, 1) - 1);
begin
  if not public.has_role(auth.uid(), 'agency_admin') then
    raise exception 'Admin access required' using errcode = '42501';
  end if;
  return query
    with agg as (
      select d.component,
             max(d.category)                                   as category,
             sum(d.checks_total)                               as t,
             sum(d.checks_down)                                as dn,
             sum(d.checks_degraded)                            as dg,
             sum(d.checks_ok)                                  as ok,
             sum(coalesce(d.avg_latency_ms, 0) * d.checks_total)
               / nullif(sum(d.checks_total) filter (where d.avg_latency_ms is not null), 0) as avg_l,
             max(d.p95_latency_ms)                             as p95
      from public.platform_health_daily d
      where d.day >= v_from
      group by d.component
    ),
    inc as (
      select i.component,
             count(*) as n,
             coalesce(sum(extract(epoch from coalesce(i.resolved_at, now()) - i.started_at))
                      filter (where i.status = 'down'), 0)::bigint as secs
      from public.platform_health_incidents i
      where i.started_at >= v_from::timestamptz
      group by i.component
    )
    select a.component,
           a.category,
           round(100.0 * (a.t - a.dn) / nullif(a.t, 0), 2),
           round(100.0 * a.ok / nullif(a.t, 0), 2),
           a.avg_l::int,
           a.p95::int,
           a.t::bigint,
           a.dn::bigint,
           a.dg::bigint,
           coalesce(i.n, 0)::bigint,
           coalesce(i.secs, 0)::bigint
    from agg a
    left join inc i on i.component = a.component
    order by a.category, a.component;
end;
$$;

-- Daily trend rows for charts.
create or replace function public.get_platform_health_trend(p_days integer default 30)
returns table (
  day             date,
  component       text,
  category        text,
  uptime_pct      numeric,
  healthy_pct     numeric,
  avg_latency_ms  integer,
  checks_total    integer,
  checks_down     integer,
  checks_degraded integer
)
language plpgsql stable security definer set search_path = public
as $$
begin
  if not public.has_role(auth.uid(), 'agency_admin') then
    raise exception 'Admin access required' using errcode = '42501';
  end if;
  return query
    select d.day, d.component, d.category, d.uptime_pct, d.healthy_pct,
           d.avg_latency_ms, d.checks_total, d.checks_down, d.checks_degraded
    from public.platform_health_daily d
    where d.day >= (now() at time zone 'utc')::date - (greatest(p_days, 1) - 1)
    order by d.day, d.component;
end;
$$;

-- Latest snapshot per quota metric.
create or replace function public.get_platform_quota_latest()
returns setof public.platform_quota_snapshots
language plpgsql stable security definer set search_path = public
as $$
begin
  if not public.has_role(auth.uid(), 'agency_admin') then
    raise exception 'Admin access required' using errcode = '42501';
  end if;
  return query
    select distinct on (q.service, q.metric) q.*
    from public.platform_quota_snapshots q
    where q.captured_at >= now() - interval '30 days'
    order by q.service, q.metric, q.captured_at desc;
end;
$$;

grant execute on function public.get_platform_health_latest()          to authenticated, service_role;
grant execute on function public.get_platform_health_overview(integer) to authenticated, service_role;
grant execute on function public.get_platform_health_trend(integer)    to authenticated, service_role;
grant execute on function public.get_platform_quota_latest()           to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 9. Cron trigger (same cron_config pattern as reconciliation / monthly report).
-- ----------------------------------------------------------------------------
create or replace function public.trigger_platform_health_monitor(p_body jsonb default '{}'::jsonb)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_url text;
  v_key text;
begin
  select value into v_url from public.cron_config where key = 'supabase_url';
  select value into v_key from public.cron_config where key = 'service_role_key';

  if v_url is null or v_key is null or v_url like '%YOUR_PROJECT%' then
    raise notice 'cron_config not configured — skipping platform health monitor';
    return;
  end if;

  perform net.http_post(
    url     := v_url || '/functions/v1/platform-health-monitor',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || v_key
    ),
    body    := coalesce(p_body, '{}'::jsonb),
    timeout_milliseconds := 60000
  );
end;
$$;

revoke all on function public.trigger_platform_health_monitor(jsonb) from public, anon, authenticated;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'platform-health-monitor') then
    perform cron.unschedule('platform-health-monitor');
  end if;
  -- Once a day at 06:00 UTC. Admins can still run an on-demand check from the page.
  perform cron.schedule(
    'platform-health-monitor',
    '0 6 * * *',
    $job$ select public.trigger_platform_health_monitor('{"mode":"run","source":"cron"}'::jsonb); $job$
  );

  if exists (select 1 from cron.job where jobname = 'platform-health-daily-rollup') then
    perform cron.unschedule('platform-health-daily-rollup');
  end if;
  perform cron.schedule(
    'platform-health-daily-rollup',
    '15 0 * * *',
    $job$
      select public.rollup_platform_health_daily(((now() at time zone 'utc')::date - 1));
      select public.prune_platform_health_data();
    $job$
  );

  if exists (select 1 from cron.job where jobname = 'platform-health-monthly-report') then
    perform cron.unschedule('platform-health-monthly-report');
  end if;
  perform cron.schedule(
    'platform-health-monthly-report',
    '0 8 1 * *',
    $job$ select public.trigger_platform_health_monitor('{"mode":"report","period":"monthly"}'::jsonb); $job$
  );
end;
$$;
