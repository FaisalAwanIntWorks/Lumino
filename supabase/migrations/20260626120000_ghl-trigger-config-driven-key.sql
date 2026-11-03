-- ── Harden DTT GHL sync trigger: remove hardcoded JWT ──────────────────────
-- The previous version of public.trigger_dtt_ghl_sync() embedded a Supabase
-- anon JWT directly in the migration (committed to git). That is a secret in
-- version control and silently breaks the trigger if the key is rotated.
--
-- This migration recreates the trigger function to read the project URL and
-- auth key from public.cron_config at runtime — the exact pattern already used
-- by public.trigger_stripe_reconciliation() (see 20260418160000_reconciliation-cron.sql).
--
-- SETUP REQUIRED (once, after deploy — values are NOT stored in git):
--   update public.cron_config set value = 'https://YOUR_PROJECT_REF.supabase.co'
--     where key = 'supabase_url';
--   update public.cron_config set value = 'YOUR_SERVICE_ROLE_KEY'
--     where key = 'service_role_key';
-- (On this project the keys already exist from the reconciliation-cron migration,
--  so no action is needed beyond confirming they hold the real values.)

-- Ensure the shared config table + keys exist even if this migration runs
-- before the reconciliation-cron one in a fresh environment.
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

    -- If config is missing/placeholder, skip the network call rather than
    -- firing a broken request. The lead row still saves normally.
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

-- Recreate the trigger to be safe (definition unchanged).
DROP TRIGGER IF EXISTS trg_dtt_ghl_sync_after_diamond_form_insert ON public.diamond_form_leads;
CREATE TRIGGER trg_dtt_ghl_sync_after_diamond_form_insert
AFTER INSERT ON public.diamond_form_leads
FOR EACH ROW
EXECUTE FUNCTION public.trigger_dtt_ghl_sync();
