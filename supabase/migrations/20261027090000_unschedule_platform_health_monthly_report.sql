-- ============================================================================
-- Retire the monthly platform-health report cron
-- ============================================================================
-- `platform-health-monthly-report` (1st of the month, 08:00 UTC) e-mailed a
-- month summary to the admins. Admin decision 2026-10-27: not needed as a
-- scheduled job. The daily monitor (06:00 UTC) and the daily rollup (00:15 UTC)
-- stay; the report can still be generated on demand from the Platform Health
-- page (trigger_platform_health_monitor with mode "report").
-- ============================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'platform-health-monthly-report') THEN
    PERFORM cron.unschedule('platform-health-monthly-report');
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron not available or job absent: %', SQLERRM;
END $$;
