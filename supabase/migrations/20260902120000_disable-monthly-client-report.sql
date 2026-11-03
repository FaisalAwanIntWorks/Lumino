-- ── Disable the monthly client report email ───────────────────────────────
-- The 'monthly-client-report' pg_cron job (added by
-- 20260729130000_monthly-client-report.sql) was the ONLY caller of the
-- send-monthly-report edge function. Unscheduling it stops the "Your <Month>
-- report" email from going to any client.
--
-- Nothing else is removed: the edge function, the template, the
-- monthly_report_runs history table and the per-client 'monthly_report'
-- notification preference all stay in place.
--
-- To re-enable later, run:
--   select cron.schedule(
--     'monthly-client-report',
--     '0 13-18 1 * *',
--     'select public.trigger_monthly_client_report()'
--   );

do $$
begin
  if exists (select 1 from cron.job where jobname = 'monthly-client-report') then
    perform cron.unschedule('monthly-client-report');
    raise notice 'monthly-client-report cron job unscheduled';
  else
    raise notice 'monthly-client-report cron job not found — nothing to do';
  end if;
end;
$$;
