CREATE OR REPLACE FUNCTION public.trigger_monthly_client_report()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_url    text;
  v_secret text;
begin
  select value into v_url    from public.cron_config where key = 'supabase_url';
  select value into v_secret from public.cron_config where key = 'access_alert_secret';

  if v_url is null or v_secret is null or v_url like '%YOUR_PROJECT%' then
    raise notice 'cron_config not configured — skipping monthly client report';
    return;
  end if;

  perform net.http_post(
    url     := v_url || '/functions/v1/send-monthly-report',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'x-cron-secret', v_secret
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 150000
  );
end;
$function$;

REVOKE EXECUTE ON FUNCTION public.trigger_monthly_client_report() FROM anon, authenticated;