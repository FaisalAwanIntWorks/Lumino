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