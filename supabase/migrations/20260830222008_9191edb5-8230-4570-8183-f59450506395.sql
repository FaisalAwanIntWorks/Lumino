-- The alert dispatcher previously required cron_config.service_role_key, which
-- is still a placeholder in this project, so nothing was ever sent. Use a
-- self-generated shared secret instead — the edge function verifies it against
-- this same row using its own service-role connection.
INSERT INTO public.cron_config (key, value)
VALUES ('access_alert_secret', encode(gen_random_bytes(32), 'hex'))
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.dispatch_client_access_alert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_url    text;
  v_secret text;
BEGIN
  SELECT value INTO v_url    FROM public.cron_config WHERE key = 'supabase_url';
  SELECT value INTO v_secret FROM public.cron_config WHERE key = 'access_alert_secret';

  IF v_url IS NULL OR v_secret IS NULL OR v_url LIKE '%YOUR_PROJECT%' THEN
    UPDATE public.client_access_events
       SET notify_error = 'cron_config not configured (supabase_url / access_alert_secret)'
     WHERE id = NEW.id;
    RETURN NEW;
  END IF;

  PERFORM net.http_post(
    url     := v_url || '/functions/v1/alert-access-change',
    headers := jsonb_build_object(
      'Content-Type',   'application/json',
      'x-alert-secret', v_secret
    ),
    body    := jsonb_build_object('event_id', NEW.id)
  );

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.dispatch_client_access_alert() FROM anon, authenticated;