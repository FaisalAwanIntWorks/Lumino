-- ============================================================
-- §1: Schedule the cleanup functions that were defined but
--     never actually scheduled with pg_cron.
-- ============================================================

-- Idempotent: unschedule any prior versions first
SELECT cron.unschedule(jobname)
FROM cron.job
WHERE jobname IN (
  'cleanup_orphan_ai_previews_daily',
  'trim_old_log_tables_monthly',
  'archive_old_ai_usage_logs_monthly'
);

-- Daily orphan AI preview cleanup (03:00 UTC)
SELECT cron.schedule(
  'cleanup_orphan_ai_previews_daily',
  '0 3 * * *',
  $$SELECT public.cleanup_orphan_ai_previews()$$
);

-- Monthly log trim: analytics_events + client_activity_logs (1st of month, 04:00 UTC)
SELECT cron.schedule(
  'trim_old_log_tables_monthly',
  '0 4 1 * *',
  $$SELECT public.trim_old_log_tables()$$
);

-- Monthly AI usage log archival (2nd of month, 04:00 UTC)
SELECT cron.schedule(
  'archive_old_ai_usage_logs_monthly',
  '0 4 2 * *',
  $$SELECT public.archive_old_ai_usage_logs()$$
);
