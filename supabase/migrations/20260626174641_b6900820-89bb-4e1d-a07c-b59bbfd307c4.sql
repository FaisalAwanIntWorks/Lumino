create table if not exists public.cron_config (
  key        text primary key,
  value      text not null,
  updated_at timestamptz default now()
);
-- [bridge] ensure columns
ALTER TABLE public.cron_config
  ADD COLUMN IF NOT EXISTS key text,
  ADD COLUMN IF NOT EXISTS value text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();


insert into public.cron_config (key, value) values
  ('supabase_url',     'https://YOUR_PROJECT_REF.supabase.co'),
  ('service_role_key', 'YOUR_SERVICE_ROLE_KEY_HERE')
on conflict (key) do nothing;

CREATE OR REPLACE FUNCTION public.trigger_dtt_ghl_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  dtt_client_id constant uuid := 'aeec6491-bd1f-4787-97f9-6a47a2ddc8af';
  v_url text;
  v_key text;
BEGIN
  IF NEW.client_id = dtt_client_id THEN
    SELECT value INTO v_url FROM public.cron_config WHERE key = 'supabase_url';
    SELECT value INTO v_key FROM public.cron_config WHERE key = 'service_role_key';

    IF v_url IS NULL OR v_url LIKE '%YOUR_PROJECT%'
       OR v_key IS NULL OR v_key LIKE '%YOUR_SERVICE_ROLE_KEY%' THEN
      RAISE WARNING 'trigger_dtt_ghl_sync: cron_config not configured — skipping GHL sync for lead %', NEW.id;
      RETURN NEW;
    END IF;

    PERFORM net.http_post(
      url := v_url || '/functions/v1/sync-dtt-ghl-lead',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || v_key
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

DROP TRIGGER IF EXISTS trg_dtt_ghl_sync_after_diamond_form_insert ON public.diamond_form_leads;
CREATE TRIGGER trg_dtt_ghl_sync_after_diamond_form_insert
AFTER INSERT ON public.diamond_form_leads
FOR EACH ROW
EXECUTE FUNCTION public.trigger_dtt_ghl_sync();