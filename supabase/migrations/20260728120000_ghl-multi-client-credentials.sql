-- ── Multi-client CRM MVMNT (GoHighLevel) integration ──────────────────────
-- Lets ANY client connect their own GHL sub-account, instead of the single
-- hardcoded Diamond Touch Toronto wiring.
--
-- DTT SAFETY — this migration is deliberately additive only:
--   * No existing column, policy or grant is dropped or altered.
--   * trigger_dtt_ghl_sync() keeps an explicit DTT clause, so DTT fires exactly
--     as it does today even if its client_ghl_integrations row were disabled or
--     missing. Only the "OR <other enabled client>" branch is new.
--   * DTT's token keeps coming from the DTT_GHL_PRIVATE_TOKEN edge secret:
--     _shared/ghl-auth.ts checks the new credentials table first and falls back
--     to that secret for DTT, so no DB row is required for DTT to keep working.

-- ─────────────────────────────────────────────────────────────────────────
-- 1) Per-client GHL Private Integration Token — service role only.
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.client_ghl_credentials (
  client_id     UUID PRIMARY KEY REFERENCES public.clients(id) ON DELETE CASCADE,
  private_token TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- [bridge] ensure columns
ALTER TABLE public.client_ghl_credentials
  ADD COLUMN IF NOT EXISTS client_id UUID,
  ADD COLUMN IF NOT EXISTS private_token TEXT,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();


ALTER TABLE public.client_ghl_credentials ENABLE ROW LEVEL SECURITY;

-- Deliberately NO grants to anon/authenticated: the token must never be
-- readable from the browser. It is written by the save-ghl-credentials edge
-- function and read by the sync / metadata / test functions, all service role.
GRANT ALL ON public.client_ghl_credentials TO service_role;

DROP POLICY IF EXISTS "Service role manages GHL credentials" ON public.client_ghl_credentials;
CREATE POLICY "Service role manages GHL credentials"
  ON public.client_ghl_credentials FOR ALL TO service_role
  USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS update_client_ghl_credentials_updated_at ON public.client_ghl_credentials;
CREATE TRIGGER update_client_ghl_credentials_updated_at
  BEFORE UPDATE ON public.client_ghl_credentials
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ─────────────────────────────────────────────────────────────────────────
-- 2) Display-only columns on the existing config table (safe for SELECT *).
--    token_last4 lets the UI show "•••• 1a2b" without ever reading the secret.
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE public.client_ghl_integrations
  ADD COLUMN IF NOT EXISTS token_last4 TEXT,
  ADD COLUMN IF NOT EXISTS connection_verified_at TIMESTAMPTZ;

-- ─────────────────────────────────────────────────────────────────────────
-- 3) Trigger: fire for DTT (unchanged path) OR any client with an enabled,
--    location-configured integration row.
--    Function name, trigger name, URL, headers and body are all unchanged.
-- ─────────────────────────────────────────────────────────────────────────
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
  v_should_sync boolean;
BEGIN
  -- DTT keeps its original unconditional path so its live integration cannot
  -- be switched off by a config change. Every other client syncs only once an
  -- admin has enabled the integration and picked a location.
  v_should_sync := (NEW.client_id = dtt_client_id) OR EXISTS (
    SELECT 1
    FROM public.client_ghl_integrations i
    WHERE i.client_id = NEW.client_id
      AND i.enabled = true
      AND i.location_id IS NOT NULL
  );

  IF v_should_sync THEN
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

-- Recreate the trigger to be safe (definition unchanged).
DROP TRIGGER IF EXISTS trg_dtt_ghl_sync_after_diamond_form_insert ON public.diamond_form_leads;
CREATE TRIGGER trg_dtt_ghl_sync_after_diamond_form_insert
AFTER INSERT ON public.diamond_form_leads
FOR EACH ROW
EXECUTE FUNCTION public.trigger_dtt_ghl_sync();
