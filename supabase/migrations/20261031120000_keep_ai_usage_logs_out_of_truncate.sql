-- Keep ai_usage_logs out of the 30-day log truncate.
--
-- The live cron `monthly-logs-archive-truncate` (1st and 31st, 21:00 UTC) calls the
-- archive-and-truncate-logs edge function, which snapshots the log tables to storage and
-- then runs truncate_log_tables(). Until now that wiped ai_usage_logs every ~30 days, so
-- the 90-day archive (archive_old_ai_usage_logs -> ai_usage_monthly_summary) never ran on
-- any row, per-request AI usage history was lost, and Revenue & Usage counts for older
-- date ranges came back as zero.
--
-- ai_usage_logs now stays in the database and is handled only by archive_old_ai_usage_logs.
-- client_activity_logs and analytics_events keep the existing 30-day cycle.

CREATE OR REPLACE FUNCTION public.truncate_log_tables()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_client_activity bigint;
  v_analytics       bigint;
BEGIN
  SELECT COUNT(*) INTO v_client_activity FROM public.client_activity_logs;
  SELECT COUNT(*) INTO v_analytics       FROM public.analytics_events;

  TRUNCATE TABLE public.client_activity_logs;
  TRUNCATE TABLE public.analytics_events;

  RETURN jsonb_build_object(
    'client_activity_logs', v_client_activity,
    'analytics_events',     v_analytics
  );
END;
$$;
