-- ============================================================================
-- Platform Health accuracy pass.
--
--  1. Cron trigger authenticates the way this project actually supports
--     (anon bearer + x-trigger-secret). cron_config.service_role_key is a
--     placeholder here, so the original trigger was rejected with 401 and the
--     daily run never executed.
--  2. Incidents record the bounds of what a daily check can actually know:
--     prev_ok_at (last passing check before the failure) and last_failed_at.
--  3. Email usage is counted per recipient (how Resend bills) and failures are
--     derived from rows Resend never accepted.
--  4. DB -> edge function HTTP results (pg_net) are exposed so a cron that
--     "succeeds" in SQL but gets a 401/500 from its function is visible.
--  5. Plan limits nobody verified are no longer presented as facts.
--  6. History written by the two buggy probes (CDN 403, Resend 401) and by
--     the Unkey probe that tested the wrong host is corrected.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Cron trigger
-- ----------------------------------------------------------------------------
create or replace function public.trigger_platform_health_monitor(p_body jsonb default '{}'::jsonb)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_url     text;
  v_key     text;
  v_anon    text;
  v_secret  text;
  v_headers jsonb := jsonb_build_object('Content-Type', 'application/json');
begin
  select value into v_url    from public.cron_config where key = 'supabase_url';
  select value into v_key    from public.cron_config where key = 'service_role_key';
  select value into v_anon   from public.cron_config where key = 'anon_key';
  select value into v_secret from public.cron_config where key = 'dtt_ghl_trigger_secret';

  if v_url is null or v_url like '%YOUR_PROJECT%' then
    raise notice 'cron_config.supabase_url not configured — skipping platform health monitor';
    return;
  end if;

  if v_secret is not null and v_secret <> '' then
    v_headers := v_headers || jsonb_build_object(
      'Authorization',    'Bearer ' || coalesce(v_anon, ''),
      'x-trigger-secret', v_secret
    );
  elsif v_key is not null and v_key <> '' and v_key not like '%YOUR_%' then
    v_headers := v_headers || jsonb_build_object('Authorization', 'Bearer ' || v_key);
  else
    raise notice 'cron_config has no usable credential — skipping platform health monitor';
    return;
  end if;

  perform net.http_post(
    url     := v_url || '/functions/v1/platform-health-monitor',
    headers := v_headers,
    body    := coalesce(p_body, '{}'::jsonb),
    timeout_milliseconds := 60000
  );
end;
$$;

revoke all on function public.trigger_platform_health_monitor(jsonb) from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 2. Incident bounds
-- ----------------------------------------------------------------------------
alter table public.platform_health_incidents
  add column if not exists prev_ok_at     timestamptz,
  add column if not exists last_failed_at timestamptz;

comment on column public.platform_health_incidents.prev_ok_at is
  'Last passing check before this incident. The failure began somewhere between prev_ok_at and started_at.';
comment on column public.platform_health_incidents.last_failed_at is
  'Last failing check. The recovery happened somewhere between last_failed_at and resolved_at.';

-- ----------------------------------------------------------------------------
-- 3. Email usage, counted the way Resend counts it
-- ----------------------------------------------------------------------------
create or replace function public.get_platform_email_stats(p_from timestamptz, p_to timestamptz)
returns jsonb
language sql stable security definer set search_path = public
as $$
  with classified as (
    select
      greatest(1, coalesce(array_length(
        array_remove(regexp_split_to_array(coalesce(l.recipient_email, ''), '\s*[,;]\s*'), ''), 1), 1)) as recipients,
      case
        -- Never handed to Resend at all.
        when l.status like 'skipped%' or l.status = 'dry_run' then 'skipped'
        when l.status = 'failed' then 'failed'
        -- Logged as sent but Resend returned no id: the API call was rejected.
        when l.status = 'sent' and l.resend_id is null then 'failed'
        -- Inserted as pending before the send and never updated: the send threw.
        when l.status = 'pending' and l.created_at < now() - interval '5 minutes' then 'failed'
        when l.status = 'pending' then 'skipped'
        else 'sent'
      end as outcome
    from public.email_logs l
    where l.created_at >= p_from and l.created_at < p_to
  )
  select jsonb_build_object(
    'sent_calls',        count(*) filter (where outcome = 'sent'),
    'sent_recipients',   coalesce(sum(recipients) filter (where outcome = 'sent'), 0),
    'failed_calls',      count(*) filter (where outcome = 'failed'),
    'failed_recipients', coalesce(sum(recipients) filter (where outcome = 'failed'), 0),
    'skipped_calls',     count(*) filter (where outcome = 'skipped')
  )
  from classified;
$$;

revoke all on function public.get_platform_email_stats(timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.get_platform_email_stats(timestamptz, timestamptz) to service_role;

create index if not exists idx_email_logs_created_at on public.email_logs (created_at desc);

-- ----------------------------------------------------------------------------
-- 4. Results of HTTP calls the database made (pg_net keeps ~6 hours)
-- ----------------------------------------------------------------------------
create or replace function public.get_db_http_health()
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_result jsonb;
begin
  select jsonb_build_object(
    'available',    true,
    'oldest',       min(r.created),
    'total',        count(*),
    'ok',           count(*) filter (where r.status_code between 200 and 399),
    'auth_failed',  count(*) filter (where r.status_code in (401, 403)),
    'client_error', count(*) filter (where r.status_code between 400 and 499 and r.status_code not in (401, 403)),
    'server_error', count(*) filter (where r.status_code >= 500),
    'timed_out',    count(*) filter (where r.timed_out is true),
    'no_response',  count(*) filter (where r.status_code is null and r.timed_out is not true)
  )
  into v_result
  from net._http_response r;
  return v_result;
exception when others then
  return jsonb_build_object('available', false, 'error', sqlerrm);
end;
$$;

revoke all on function public.get_db_http_health() from public, anon, authenticated;
grant execute on function public.get_db_http_health() to service_role;

-- ----------------------------------------------------------------------------
-- 5. Settings: stop presenting unverified plan limits as facts
-- ----------------------------------------------------------------------------
-- Database/storage limits were seeded with Supabase Pro numbers. This project
-- is Lovable-managed and nobody confirmed them, so they become "not set"
-- unless a super admin already changed them.
update public.platform_health_settings
   set value = 'null'::jsonb,
       description = 'Database size limit of your plan in MB. Leave empty if unknown.',
       updated_at = now()
 where key = 'db_size_limit_mb' and value = '8192'::jsonb;

update public.platform_health_settings
   set value = 'null'::jsonb,
       description = 'Storage limit of your plan in MB. Leave empty if unknown.',
       updated_at = now()
 where key = 'storage_limit_mb' and value = '102400'::jsonb;

update public.platform_health_settings
   set description = 'Resend plan: emails per day (free plan = 100, paid plans have no daily limit: leave empty)'
 where key = 'resend_daily_limit';

update public.platform_health_settings
   set description = 'Resend plan: emails per month (free plan = 3000). Each recipient counts as one email.'
 where key = 'resend_monthly_limit';

delete from public.platform_health_settings where key = 'edge_errors_per_hour';

insert into public.platform_health_settings (key, value, description) values
  ('edge_errors_per_day',  '100',   'Logged edge function errors per 24h above this marks Edge Functions degraded'),
  ('plan_limits_verified', 'false', 'Turn on once the plan limits below match your real Resend / database / storage plans')
on conflict (key) do nothing;

-- ----------------------------------------------------------------------------
-- 6. Correct history written by faulty probes
-- ----------------------------------------------------------------------------

-- 6a. CDN roots answer 403 by design; Resend answers 401 to a sending-only key.
--     Neither was an outage.
delete from public.platform_health_checks
 where (component in ('Product Images CDN', 'UI Assets CDN') and message like 'API key rejected (HTTP 403)%')
    or (component = 'Resend' and message like 'API key rejected (HTTP 401)%');

update public.platform_health_alerts a
   set details = coalesce(a.details, '{}'::jsonb) || jsonb_build_object(
         'false_positive', true,
         'false_positive_reason', 'Probe bug fixed 2026-09-22: the service was healthy.')
 where a.alert_type in ('incident_open', 'incident_resolved')
   and a.component in ('Product Images CDN', 'UI Assets CDN', 'Resend')
   and exists (
     select 1 from public.platform_health_incidents i
      where i.id::text = a.details->>'incident_id'
        and (i.first_message like 'API key rejected (HTTP 403)%' or i.first_message like 'API key rejected (HTTP 401)%')
   );

delete from public.platform_health_incidents
 where (component in ('Product Images CDN', 'UI Assets CDN') and first_message like 'API key rejected (HTTP 403)%')
    or (component = 'Resend' and first_message like 'API key rejected (HTTP 401)%');

-- 6b. The Unkey probe tested api.unkey.com/v2 while the platform code calls
--     api.unkey.dev/v1, which does not resolve. Those green rows were wrong.
update public.platform_health_checks
   set status  = 'down',
       message = 'Platform code calls api.unkey.dev/v1, which is unreachable (Unkey itself is up)',
       details = coalesce(details, '{}'::jsonb) || jsonb_build_object('corrected', true)
 where component = 'Unkey'
   and status = 'operational'
   and details->>'api' = 'v2';

-- 6c. Usage snapshots taken with the old counting rules.
delete from public.platform_quota_snapshots
 where service = 'resend'
    or (service = 'edge' and metric = 'errors_last_hour');

update public.platform_quota_snapshots
   set quota_limit = null, pct = null, level = 'info'
 where service = 'supabase'
   and ((metric = 'db_size_mb' and quota_limit = 8192) or (metric = 'storage_size_mb' and quota_limit = 102400));

-- 6d. Backfill incident bounds for whatever incidents remain.
update public.platform_health_incidents i
   set prev_ok_at = (
         select max(c.checked_at) from public.platform_health_checks c
          where c.component = i.component and c.status = 'operational' and c.checked_at < i.started_at),
       last_failed_at = coalesce((
         select max(c.checked_at) from public.platform_health_checks c
          where c.component = i.component and c.status <> 'operational'
            and c.checked_at >= i.started_at
            and c.checked_at <= coalesce(i.resolved_at, now())), i.started_at)
 where i.last_failed_at is null;

-- 6e. Rebuild every daily rollup from the corrected raw checks.
do $$
declare
  d date;
begin
  delete from public.platform_health_daily where true;
  for d in
    select distinct (c.checked_at at time zone 'utc')::date
    from public.platform_health_checks c
    order by 1
  loop
    perform public.rollup_platform_health_daily(d);
  end loop;
end;
$$;

-- ----------------------------------------------------------------------------
-- 7. Overview RPC: report the downtime range, not a single made-up number
-- ----------------------------------------------------------------------------
drop function if exists public.get_platform_health_overview(integer);

create function public.get_platform_health_overview(p_days integer default 30)
returns table (
  component            text,
  category             text,
  uptime_pct           numeric,
  healthy_pct          numeric,
  avg_latency_ms       integer,
  p95_latency_ms       integer,
  checks_total         bigint,
  checks_ok            bigint,
  checks_down          bigint,
  checks_degraded      bigint,
  incidents            bigint,
  downtime_min_seconds bigint,
  downtime_max_seconds bigint
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
             max(d.category)        as category,
             sum(d.checks_total)    as t,
             sum(d.checks_down)     as dn,
             sum(d.checks_degraded) as dg,
             sum(d.checks_ok)       as ok,
             sum(d.avg_latency_ms * d.checks_total) filter (where d.avg_latency_ms is not null)
               / nullif(sum(d.checks_total) filter (where d.avg_latency_ms is not null), 0) as avg_l,
             max(d.p95_latency_ms)  as p95
      from public.platform_health_daily d
      where d.day >= v_from
      group by d.component
    ),
    inc as (
      select i.component,
             count(*) as n,
             coalesce(sum(extract(epoch from
               coalesce(i.last_failed_at, i.started_at) - i.started_at)), 0)::bigint as min_secs,
             coalesce(sum(extract(epoch from
               coalesce(i.resolved_at, now()) - coalesce(i.prev_ok_at, i.started_at))), 0)::bigint as max_secs
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
           a.ok::bigint,
           a.dn::bigint,
           a.dg::bigint,
           coalesce(i.n, 0)::bigint,
           coalesce(i.min_secs, 0)::bigint,
           coalesce(i.max_secs, 0)::bigint
    from agg a
    left join inc i on i.component = a.component
    order by a.category, a.component;
end;
$$;

grant execute on function public.get_platform_health_overview(integer) to authenticated, service_role;
