-- =====================================================================
-- Daily Leads Report: move the nightly send to 00:00 UTC
--   = 12:00 AM UK time (GMT) = 5:00 AM Pakistan time.
-- The edge function now reports the UTC day that just ended and sends to
-- every active super admin (admin staff never receive it).
-- Only the 'daily-leads-report' cron job is touched.
-- =====================================================================
do $$
begin
  if exists (select 1 from cron.job where jobname = 'daily-leads-report') then
    perform cron.unschedule('daily-leads-report');
  end if;
  perform cron.schedule(
    'daily-leads-report',
    '0 0 * * *',
    $job$ select public.trigger_daily_leads_report('{"mode":"send","source":"cron"}'::jsonb); $job$
  );
end;
$$;
