
-- 1. Backup column for enabled_features snapshot
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS enabled_features_backup jsonb;

-- 2. Pause: snapshot current features, then flip all widget-gated keys to false.
CREATE OR REPLACE FUNCTION public.pause_client_widgets(client_uuid uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current  jsonb;
  v_backup   jsonb;
  v_new      jsonb;
  v_changed  boolean := false;
  k text;
  gated_keys text[] := ARRAY[
    'diamond_form','product_catalogue','jewlx_agent','orders',
    'custom_enquiry','grillz_builder','metal_buying'
  ];
BEGIN
  SELECT enabled_features, enabled_features_backup
    INTO v_current, v_backup
  FROM public.clients
  WHERE id = client_uuid
  FOR UPDATE;

  IF NOT FOUND THEN RETURN false; END IF;

  v_current := COALESCE(v_current, '{}'::jsonb);
  v_new := v_current;

  -- Detect if anything gated is still on
  FOREACH k IN ARRAY gated_keys LOOP
    IF COALESCE((v_current ->> k)::boolean, true) = true THEN
      v_changed := true;
    END IF;
    v_new := jsonb_set(v_new, ARRAY[k], 'false'::jsonb, true);
  END LOOP;

  IF NOT v_changed THEN
    RETURN false;
  END IF;

  UPDATE public.clients
     SET enabled_features_backup = COALESCE(v_backup, v_current),
         enabled_features        = v_new,
         updated_at              = now()
   WHERE id = client_uuid;

  RETURN true;
END;
$$;

-- 3. Resume: restore from snapshot, clear backup.
CREATE OR REPLACE FUNCTION public.resume_client_widgets(client_uuid uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_backup jsonb;
BEGIN
  SELECT enabled_features_backup INTO v_backup
    FROM public.clients WHERE id = client_uuid FOR UPDATE;

  IF v_backup IS NULL THEN
    RETURN false;
  END IF;

  UPDATE public.clients
     SET enabled_features        = v_backup,
         enabled_features_backup = NULL,
         updated_at              = now()
   WHERE id = client_uuid;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.pause_client_widgets(uuid)  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.resume_client_widgets(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pause_client_widgets(uuid)  TO service_role;
GRANT EXECUTE ON FUNCTION public.resume_client_widgets(uuid) TO service_role;

-- 4. Cron trigger — invokes the enforce-subscription-grace edge function daily
CREATE OR REPLACE FUNCTION public.trigger_subscription_grace_enforcement()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_url text;
  v_key text;
BEGIN
  SELECT value INTO v_url FROM public.cron_config WHERE key = 'supabase_url';
  SELECT value INTO v_key FROM public.cron_config WHERE key = 'service_role_key';

  IF v_url IS NULL OR v_url LIKE '%YOUR_PROJECT%' THEN
    RAISE NOTICE 'cron_config not configured — skipping grace enforcement';
    RETURN;
  END IF;

  PERFORM net.http_post(
    url     := v_url || '/functions/v1/enforce-subscription-grace',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'Authorization','Bearer ' || v_key
    ),
    body    := '{}'::jsonb
  );
END;
$$;

-- Unschedule any prior run before re-scheduling (idempotent)
DO $$
BEGIN
  PERFORM cron.unschedule('daily-subscription-grace-enforcement');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'daily-subscription-grace-enforcement',
  '0 10 * * *',
  'select public.trigger_subscription_grace_enforcement()'
);
