-- ── CRM MVMNT (GoHighLevel) sync for every form + Ring OS ──────────────────
-- Until now only the Diamond Form (Quote Estimator) pushed leads to CRM MVMNT.
-- This migration generalises the same configurable pipeline to every other lead
-- surface on the platform:
--
--   grillz       → grill_form_leads          (Grillz Builder)
--   enquiry      → custom_enquiry_leads      (Custom Enquiry / CustomX)
--   metal        → metal_buying_leads        (Metal IQ)
--   ring_request → design_requests           (Ring OS — custom design request)
--   ring_design  → saved_designs             (Ring OS — saved configuration)
--   appointment  → appointment_bookings      (Ring OS / Metal IQ — booking)
--
-- DTT / Diamond Form SAFETY — deliberately additive only:
--   * trigger_dtt_ghl_sync() and trg_dtt_ghl_sync_after_diamond_form_insert are
--     NOT touched. The Diamond Form keeps calling sync-dtt-ghl-lead exactly as
--     it does today.
--   * form_type defaults to 'diamond', so every existing config, mapping and log
--     row keeps working with no data migration.
--   * Only the UNIQUE constraints widen (they gain form_type); nothing is
--     dropped that would let duplicate rows through.

-- ─────────────────────────────────────────────────────────────────────────
-- 1) Per-form configuration rows on the existing config table.
--    One row per (client, form_type) instead of one row per client.
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE public.client_ghl_integrations
  ADD COLUMN IF NOT EXISTS form_type          TEXT    NOT NULL DEFAULT 'diamond',
  ADD COLUMN IF NOT EXISTS create_opportunity BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS create_note        BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS contact_source     TEXT,
  ADD COLUMN IF NOT EXISTS contact_tags       TEXT[];

COMMENT ON COLUMN public.client_ghl_integrations.form_type IS
  'Which lead surface this row configures: diamond | grillz | enquiry | metal | ring_request | ring_design | appointment.';
COMMENT ON COLUMN public.client_ghl_integrations.value_source IS
  'Opportunity monetary value: "none", "fixed" (use fixed_value), or the name of a numeric column on the form''s lead table (e.g. estimated_total, estimated_offer).';

-- Widen UNIQUE(client_id) → UNIQUE(client_id, form_type). Done defensively:
-- the constraint name is the Postgres default from the original migration, but
-- we look it up so a renamed constraint is still handled.
DO $$
DECLARE
  v_con text;
BEGIN
  SELECT con.conname INTO v_con
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  JOIN pg_namespace ns ON ns.oid = rel.relnamespace
  WHERE ns.nspname = 'public'
    AND rel.relname = 'client_ghl_integrations'
    AND con.contype = 'u'
    AND con.conkey = ARRAY[(
      SELECT attnum FROM pg_attribute
      WHERE attrelid = rel.oid AND attname = 'client_id'
    )]::smallint[];

  IF v_con IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.client_ghl_integrations DROP CONSTRAINT %I', v_con);
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS client_ghl_integrations_client_form_uidx
  ON public.client_ghl_integrations (client_id, form_type);

-- ─────────────────────────────────────────────────────────────────────────
-- 2) Field mappings become per-form too.
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE public.client_ghl_field_mappings
  ADD COLUMN IF NOT EXISTS form_type TEXT NOT NULL DEFAULT 'diamond';

-- The old UNIQUE(client_id, question_key) must go: two forms legitimately map
-- the same key name (e.g. grillz.metal_type and enquiry.metal_type). Looked up
-- rather than dropped by name so a renamed constraint cannot silently survive
-- and start rejecting the second form's mapping.
DO $$
DECLARE
  v_con text;
BEGIN
  SELECT con.conname INTO v_con
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  JOIN pg_namespace ns ON ns.oid = rel.relnamespace
  WHERE ns.nspname = 'public'
    AND rel.relname = 'client_ghl_field_mappings'
    AND con.contype = 'u'
    AND con.conkey <@ ARRAY[
      (SELECT attnum FROM pg_attribute WHERE attrelid = rel.oid AND attname = 'client_id'),
      (SELECT attnum FROM pg_attribute WHERE attrelid = rel.oid AND attname = 'question_key')
    ]::smallint[];

  IF v_con IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.client_ghl_field_mappings DROP CONSTRAINT %I', v_con);
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS client_ghl_field_mappings_client_form_key_uidx
  ON public.client_ghl_field_mappings (client_id, form_type, question_key);

CREATE INDEX IF NOT EXISTS idx_ghl_field_mappings_client_form
  ON public.client_ghl_field_mappings (client_id, form_type);

-- ─────────────────────────────────────────────────────────────────────────
-- 3) Audit log gains form_type so lead ids from different tables never blur
--    together (and so per-stage idempotency stays scoped to one surface).
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE public.ghl_sync_logs
  ADD COLUMN IF NOT EXISTS form_type TEXT NOT NULL DEFAULT 'diamond';

CREATE INDEX IF NOT EXISTS idx_ghl_sync_logs_form_lead
  ON public.ghl_sync_logs (form_type, lead_id);

-- ─────────────────────────────────────────────────────────────────────────
-- 4) Generic AFTER INSERT trigger.
--    The form_type is passed as a trigger argument, so one function serves
--    every lead table. Mirrors trigger_dtt_ghl_sync()'s transport exactly
--    (cron_config-driven URL, anon Bearer + x-trigger-secret) but posts to the
--    generic sync-crm-lead function and never fires without an enabled config.
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.trigger_crm_form_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_form_type text := TG_ARGV[0];
  v_url    text;
  v_secret text;
  v_anon   text;
BEGIN
  -- appointment_bookings.client_id is nullable; nothing to route without it.
  IF NEW.client_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Unlike the Diamond Form (which has an unconditional DTT branch), every form
  -- here syncs only once an admin has enabled it and picked a location.
  IF NOT EXISTS (
    SELECT 1
    FROM public.client_ghl_integrations i
    WHERE i.client_id   = NEW.client_id
      AND i.form_type   = v_form_type
      AND i.enabled     = true
      AND i.location_id IS NOT NULL
  ) THEN
    RETURN NEW;
  END IF;

  SELECT value INTO v_url    FROM public.cron_config WHERE key = 'supabase_url';
  SELECT value INTO v_secret FROM public.cron_config WHERE key = 'dtt_ghl_trigger_secret';
  SELECT value INTO v_anon   FROM public.cron_config WHERE key = 'anon_key';

  IF v_url IS NULL OR v_url LIKE '%YOUR_PROJECT%' OR v_secret IS NULL THEN
    RAISE WARNING 'trigger_crm_form_sync: cron_config not configured — skipping % sync for %', v_form_type, NEW.id;
    RETURN NEW;
  END IF;

  PERFORM net.http_post(
    url := v_url || '/functions/v1/sync-crm-lead',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || coalesce(v_anon, ''),
      'x-trigger-secret', v_secret
    ),
    body := jsonb_build_object(
      'client_id', NEW.client_id,
      'lead_id',   NEW.id,
      'form_type', v_form_type
    ),
    timeout_milliseconds := 5000
  );

  RETURN NEW;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────
-- 5) Attach the trigger to every non-Diamond lead surface.
--    diamond_form_leads is intentionally absent — it keeps its own trigger.
-- ─────────────────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_crm_sync_grill_form_leads ON public.grill_form_leads;
CREATE TRIGGER trg_crm_sync_grill_form_leads
  AFTER INSERT ON public.grill_form_leads
  FOR EACH ROW EXECUTE FUNCTION public.trigger_crm_form_sync('grillz');

DROP TRIGGER IF EXISTS trg_crm_sync_custom_enquiry_leads ON public.custom_enquiry_leads;
CREATE TRIGGER trg_crm_sync_custom_enquiry_leads
  AFTER INSERT ON public.custom_enquiry_leads
  FOR EACH ROW EXECUTE FUNCTION public.trigger_crm_form_sync('enquiry');

DROP TRIGGER IF EXISTS trg_crm_sync_metal_buying_leads ON public.metal_buying_leads;
CREATE TRIGGER trg_crm_sync_metal_buying_leads
  AFTER INSERT ON public.metal_buying_leads
  FOR EACH ROW EXECUTE FUNCTION public.trigger_crm_form_sync('metal');

DROP TRIGGER IF EXISTS trg_crm_sync_design_requests ON public.design_requests;
CREATE TRIGGER trg_crm_sync_design_requests
  AFTER INSERT ON public.design_requests
  FOR EACH ROW EXECUTE FUNCTION public.trigger_crm_form_sync('ring_request');

DROP TRIGGER IF EXISTS trg_crm_sync_saved_designs ON public.saved_designs;
CREATE TRIGGER trg_crm_sync_saved_designs
  AFTER INSERT ON public.saved_designs
  FOR EACH ROW EXECUTE FUNCTION public.trigger_crm_form_sync('ring_design');

DROP TRIGGER IF EXISTS trg_crm_sync_appointment_bookings ON public.appointment_bookings;
CREATE TRIGGER trg_crm_sync_appointment_bookings
  AFTER INSERT ON public.appointment_bookings
  FOR EACH ROW EXECUTE FUNCTION public.trigger_crm_form_sync('appointment');
