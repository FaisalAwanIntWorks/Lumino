SELECT cron.unschedule(jobname)
FROM cron.job
WHERE jobname IN (
  'cleanup_orphan_ai_previews_daily',
  'trim_old_log_tables_monthly',
  'archive_old_ai_usage_logs_monthly'
);

SELECT cron.schedule(
  'cleanup_orphan_ai_previews_daily',
  '0 3 * * *',
  $$SELECT public.cleanup_orphan_ai_previews()$$
);

SELECT cron.schedule(
  'trim_old_log_tables_monthly',
  '0 4 1 * *',
  $$SELECT public.trim_old_log_tables()$$
);

SELECT cron.schedule(
  'archive_old_ai_usage_logs_monthly',
  '0 4 2 * *',
  $$SELECT public.archive_old_ai_usage_logs()$$
);