
-- Store a shared secret used by the DTT GHL trigger to authenticate with the
-- sync-dtt-ghl-lead edge function. This replaces the requirement to keep a
-- service-role JWT in cron_config (which was left as a placeholder and caused
-- the trigger to silently skip syncing recent DTT leads).
insert into public.cron_config (key, value) values
  ('dtt_ghl_trigger_secret', '01966d27a394a712b1cd7b2b5de59c0dbade7bd16c326e3ee7d6dcd2dc43d783')
on conflict (key) do update set value = excluded.value, updated_at = now();

CREATE OR REPLACE FUNCTION public.trigger_dtt_ghl_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  dtt_client_id constant uuid := 'aeec6491-bd1f-4787-97f9-6a47a2ddc8af';
  v_url text;
  v_secret text;
  v_anon text;
BEGIN
  IF NEW.client_id = dtt_client_id THEN
    SELECT value INTO v_url    FROM public.cron_config WHERE key = 'supabase_url';
    SELECT value INTO v_secret FROM public.cron_config WHERE key = 'dtt_ghl_trigger_secret';
    SELECT value INTO v_anon   FROM public.cron_config WHERE key = 'anon_key';

    IF v_url IS NULL OR v_url LIKE '%YOUR_PROJECT%' OR v_secret IS NULL THEN
      RAISE WARNING 'trigger_dtt_ghl_sync: cron_config not configured — skipping GHL sync for lead %', NEW.id;
      RETURN NEW;
    END IF;

    PERFORM net.http_post(
      url := v_url || '/functions/v1/sync-dtt-ghl-lead',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || coalesce(v_anon, ''),
        'x-trigger-secret', v_secret
      ),
      body := jsonb_build_object(
        'client_id', NEW.client_id,
        'lead_id', NEW.id
      ),
      timeout_milliseconds := 5000
    );
  END IF;

  RETURN NEW;
END;
$$;
