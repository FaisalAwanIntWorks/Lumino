-- Remove any existing job with the same name (safe to re-run)
DO $$
BEGIN
  PERFORM cron.unschedule('daily-jewlx-db-backup')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'daily-jewlx-db-backup');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Schedule daily backup at 20:00 UTC (12 PM PST / 1 PM PDT)
SELECT cron.schedule(
  'daily-jewlx-db-backup',
  '0 20 * * *',
  $$
  SELECT net.http_post(
    url := 'https://wcfxtsyhrpephimyrpbx.supabase.co/functions/v1/database-backup',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer REMOVED_OLD_PROJECT_KEY"}'::jsonb,
    body := '{"backupType": "scheduled"}'::jsonb
  ) AS request_id;
  $$
);