-- ============================================================================
-- Unschedule the three legacy diamond crons that lived only in the live DB
-- ============================================================================
-- They were created directly in the database (never in a repo migration), so
-- 20261026120000 / 20261026121000 could not remove them by name:
--   refresh-diamond-availability   */5 * * * *   (the old 5-minute sweep)
--   refresh-diamond-grade-stats    15 3 * * *    (nightly matview refresh)
--   refresh-diamond-group-reps     20 3 * * *    (nightly matview refresh)
-- The manual scoring job now does all three as its last steps.
-- Also sweeps any other cron entry whose command still calls the retired
-- functions, whatever it was named.
-- ============================================================================
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT jobid, jobname
    FROM cron.job
    WHERE jobname IN ('refresh-diamond-availability', 'refresh-diamond-grade-stats', 'refresh-diamond-group-reps',
                      'refresh_stale_diamond_availability_5min', 'diamond-pipeline-tick', 'diamond-pipeline-nightly',
                      'daily-jewlx-db-backup')
       OR command ILIKE '%refresh_stale_diamond_availability%'
       OR command ILIKE '%diamond_pipeline_tick%'
       OR command ILIKE '%REFRESH MATERIALIZED VIEW%diamond_pool_%'
       OR command ILIKE '%diamond_pipeline_state%pending = true%'
  LOOP
    PERFORM cron.unschedule(r.jobid);
    RAISE NOTICE 'unscheduled legacy cron job % (%)', r.jobname, r.jobid;
  END LOOP;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron not available: %', SQLERRM;
END $$;
