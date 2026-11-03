-- =====================================================================
-- Daily Leads Report: send at 12:00 AM US Eastern time (was 00:00 UTC).
-- pg_cron runs in UTC and Eastern midnight is 05:00 UTC in winter (EST)
-- and 04:00 UTC in summer (EDT), so the job fires at both hours and the
-- edge function only sends on the run that lands on Eastern midnight.
-- The function also de-duplicates one report per Eastern day.
-- Only the 'daily-leads-report' cron job is touched.
-- =====================================================================
do $$
begin
  if exists (select 1 from cron.job where jobname = 'daily-leads-report') then
    perform cron.unschedule('daily-leads-report');
  end if;
  perform cron.schedule(
    'daily-leads-report',
    '0 4,5 * * *',
    $job$ select public.trigger_daily_leads_report('{"mode":"send","source":"cron"}'::jsonb); $job$
  );
end;
$$;
