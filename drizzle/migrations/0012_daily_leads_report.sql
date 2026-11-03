-- =====================================================================
-- Daily Leads Report (email to JewlX super admins)
--
-- Every night at 00:00 Pakistan time (19:00 UTC) pg_cron calls the
-- `daily-leads-report` edge function, which emails how many leads each
-- client account received on each form during the day that just ended.
--
--   get_daily_leads_report(p_start, p_end)   exact per-client, per-form
--                                            counts for [p_start, p_end)
--   trigger_daily_leads_report(p_body)       pg_net call to the function
--   cron 'daily-leads-report'                0 19 * * *
-- =====================================================================

create or replace function public.get_daily_leads_report(
  p_start timestamptz,
  p_end   timestamptz
)
returns table (client_id uuid, source text, lead_count bigint)
language sql
stable
security definer
set search_path to 'public'
as $$
  with leads as (
    select 'diamond_form_leads'::text as source, client_id, created_at from diamond_form_leads
    union all
    select 'design_requests', client_id, created_at from design_requests
    union all
    select 'grill_form_leads', client_id, created_at from grill_form_leads
    union all
    select 'custom_enquiry_leads', client_id, created_at from custom_enquiry_leads
    union all
    select 'metal_buying_leads', client_id, created_at from metal_buying_leads
    union all
    select 'saved_designs', client_id, created_at from saved_designs
    union all
    select 'appointment_bookings', client_id, created_at from appointment_bookings
  )
  select l.client_id, l.source, count(*) as lead_count
  from leads l
  where l.client_id is not null
    and l.created_at >= p_start
    and l.created_at <  p_end
  group by l.client_id, l.source;
$$;

revoke all on function public.get_daily_leads_report(timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.get_daily_leads_report(timestamptz, timestamptz) to service_role;

create or replace function public.trigger_daily_leads_report(p_body jsonb default '{}'::jsonb)
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
    raise notice 'cron_config not configured — skipping daily leads report';
    return;
  end if;

  perform net.http_post(
    url     := v_url || '/functions/v1/daily-leads-report',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || v_key
    ),
    body    := coalesce(p_body, '{}'::jsonb),
    timeout_milliseconds := 60000
  );
end;
$$;

revoke all on function public.trigger_daily_leads_report(jsonb) from public, anon, authenticated;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'daily-leads-report') then
    perform cron.unschedule('daily-leads-report');
  end if;
  -- 19:00 UTC = 00:00 Asia/Karachi (no DST): the Pakistan day has just ended.
  perform cron.schedule(
    'daily-leads-report',
    '0 19 * * *',
    $job$ select public.trigger_daily_leads_report('{"mode":"send","source":"cron"}'::jsonb); $job$
  );

  -- One-off "[TEST]" send (today so far) so delivery can be verified right
  -- after this migration applies. Test sends never count as the day's report.
  -- If the edge function is not deployed yet the call 404s harmlessly.
  begin
    perform public.trigger_daily_leads_report('{"mode":"send","test":true,"source":"migration"}'::jsonb);
  exception when others then
    raise notice 'daily leads report test send skipped: %', sqlerrm;
  end;
end;
$$;