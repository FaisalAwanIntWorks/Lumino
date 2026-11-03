-- Copied from drizzle/migrations/0013_daily_leads_report_trigger_secret_header.sql (applied directly to the source database, missing from supabase/migrations).
-- Send the shared cron trigger secret alongside the Bearer token: pg_net
-- cannot read the service-role JWT, and cron_config.service_role_key holds a
-- placeholder, so daily-leads-report authenticates the call via this header.
create or replace function public.trigger_daily_leads_report(p_body jsonb default '{}'::jsonb)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_url text;
  v_key text;
  v_trigger_secret text;
begin
  select value into v_url from public.cron_config where key = 'supabase_url';
  select value into v_key from public.cron_config where key = 'service_role_key';
  select value into v_trigger_secret from public.cron_config where key = 'dtt_ghl_trigger_secret';

  if v_url is null or v_key is null or v_url like '%YOUR_PROJECT%' then
    raise notice 'cron_config not configured — skipping daily leads report';
    return;
  end if;

  perform net.http_post(
    url     := v_url || '/functions/v1/daily-leads-report',
    headers := jsonb_build_object(
      'Content-Type',     'application/json',
      'Authorization',    'Bearer ' || v_key,
      'x-trigger-secret', coalesce(v_trigger_secret, '')
    ),
    body    := coalesce(p_body, '{}'::jsonb),
    timeout_milliseconds := 60000
  );
end;
$$;

revoke all on function public.trigger_daily_leads_report(jsonb) from public, anon, authenticated;