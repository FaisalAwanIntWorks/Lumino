-- ============================================================================
-- JewlX database backup: weekly, through cron_config credentials
-- ============================================================================
-- Before: `daily-jewlx-db-backup` ran every night at 20:00 UTC with the anon
-- JWT pasted into the cron command, and the edge function dumped EVERY public
-- table (diamond pool + scores alone ~1.6M rows, paged by OFFSET).
--
-- After:
--   * `weekly-jewlx-db-backup`: Sundays 04:30 UTC (09:30 PKT), after any
--     scoring an admin ran on the weekend has long finished.
--   * The cron calls trigger_database_backup(), which reads the project URL
--     and credential from cron_config exactly like the other triggers
--     (x-trigger-secret preferred, service role key as fallback). No key in
--     the cron command any more.
--   * The edge function (supabase/functions/database-backup) now backs up an
--     explicit allowlist of configuration / business tables; diamond pool,
--     AI preview and log/analytics tables are excluded. Retention stays 30 days.
-- ============================================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'daily-jewlx-db-backup') THEN
    PERFORM cron.unschedule('daily-jewlx-db-backup');
  END IF;
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'weekly-jewlx-db-backup') THEN
    PERFORM cron.unschedule('weekly-jewlx-db-backup');
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron not available or jobs absent: %', SQLERRM;
END $$;

CREATE OR REPLACE FUNCTION public.trigger_database_backup(p_backup_type text DEFAULT 'scheduled')
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $body$
DECLARE
  v_url     text;
  v_key     text;
  v_anon    text;
  v_secret  text;
  v_headers jsonb := jsonb_build_object('Content-Type', 'application/json');
BEGIN
  SELECT value INTO v_url    FROM public.cron_config WHERE key = 'supabase_url';
  SELECT value INTO v_key    FROM public.cron_config WHERE key = 'service_role_key';
  SELECT value INTO v_anon   FROM public.cron_config WHERE key = 'anon_key';
  SELECT value INTO v_secret FROM public.cron_config WHERE key = 'dtt_ghl_trigger_secret';

  IF v_url IS NULL OR v_url LIKE '%YOUR_PROJECT%' THEN
    RAISE NOTICE 'cron_config.supabase_url not configured - skipping database backup';
    RETURN;
  END IF;

  IF v_secret IS NOT NULL AND v_secret <> '' THEN
    v_headers := v_headers || jsonb_build_object(
      'Authorization',    'Bearer ' || COALESCE(v_anon, ''),
      'x-trigger-secret', v_secret
    );
  ELSIF v_key IS NOT NULL AND v_key <> '' AND v_key NOT LIKE '%YOUR_%' THEN
    v_headers := v_headers || jsonb_build_object('Authorization', 'Bearer ' || v_key);
  ELSE
    RAISE NOTICE 'cron_config has no usable credential - skipping database backup';
    RETURN;
  END IF;

  PERFORM net.http_post(
    url     := v_url || '/functions/v1/database-backup',
    headers := v_headers,
    body    := jsonb_build_object('backupType', COALESCE(p_backup_type, 'scheduled')),
    timeout_milliseconds := 120000
  );
END;
$body$;
REVOKE ALL ON FUNCTION public.trigger_database_backup(text) FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
  PERFORM cron.schedule(
    'weekly-jewlx-db-backup',
    '30 4 * * 0',
    $job$ SELECT public.trigger_database_backup('scheduled'); $job$
  );
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'could not schedule weekly backup (pg_cron absent?): %', SQLERRM;
END $$;
