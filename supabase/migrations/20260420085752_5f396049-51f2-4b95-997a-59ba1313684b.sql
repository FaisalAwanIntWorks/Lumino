-- Helper function for anonymous INSERT validation
CREATE OR REPLACE FUNCTION public.is_valid_client_id(_client_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.clients WHERE id = _client_id)
$$;

-- ISSUE A: Replace permissive INSERT policy with ownership checks
DROP POLICY IF EXISTS "System can create analytics events" ON public.analytics_events;

DROP POLICY IF EXISTS "Anonymous can track analytics events" ON public.analytics_events;
CREATE POLICY "Anonymous can track analytics events"
  ON public.analytics_events FOR INSERT
  TO anon
  WITH CHECK (
    client_id IS NOT NULL
    AND public.is_valid_client_id(client_id)
  );

DROP POLICY IF EXISTS "Clients can create own analytics events" ON public.analytics_events;
CREATE POLICY "Clients can create own analytics events"
  ON public.analytics_events FOR INSERT
  TO authenticated
  WITH CHECK (
    client_id = public.get_user_client_id(auth.uid())
    OR public.has_role(auth.uid(), 'agency_admin')
  );

-- ISSUE D: Add missing FK indexes
CREATE INDEX IF NOT EXISTS idx_analytics_events_product_id
  ON public.analytics_events(product_id);

CREATE INDEX IF NOT EXISTS idx_analytics_events_variation_id
  ON public.analytics_events(variation_id);

-- ISSUE C: Replace single-column indexes with composites
DROP INDEX IF EXISTS idx_analytics_events_client_id;
DROP INDEX IF EXISTS idx_analytics_events_created_at;
DROP INDEX IF EXISTS idx_analytics_event_type;

CREATE INDEX IF NOT EXISTS idx_analytics_events_client_time
  ON public.analytics_events(client_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_analytics_events_client_type_time
  ON public.analytics_events(client_id, event_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_analytics_events_event_type_time
  ON public.analytics_events(event_type, created_at DESC);

-- ISSUE H: Drop redundant single-column index on user_roles
DROP INDEX IF EXISTS idx_user_roles_user_id;

-- ISSUE F: GIN index for JSONB metadata
CREATE INDEX IF NOT EXISTS idx_analytics_events_metadata_gin
  ON public.analytics_events USING GIN(metadata);

-- ISSUE G: Idempotency key
ALTER TABLE public.analytics_events
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_analytics_events_idempotency
  ON public.analytics_events(idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- ISSUE E: Migrate event_type from TEXT to ENUM
-- Idempotent: this migration exists twice in the history (see the sibling
-- file with the same statements), so re-running it must be a no-op.
DO $do$
BEGIN
  IF to_regtype('public.analytics_event_type') IS NULL THEN
    CREATE TYPE public.analytics_event_type AS ENUM (
  'configurator_load',
  'add_to_cart',
  'purchase',
  'page_view',
  'embed_view',
  'ring_view',
  'config_started',
  'config_completed',
  'design_saved',
  'widget_view');
  END IF;
END
$do$;

ALTER TABLE public.analytics_events
  DROP CONSTRAINT IF EXISTS analytics_events_event_type_check;

DO $do$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'analytics_events'
      AND column_name  = 'event_type'
      AND udt_name    <> 'analytics_event_type'
  ) THEN
    EXECUTE 'ALTER TABLE public.analytics_events '
         || 'ALTER COLUMN event_type TYPE public.analytics_event_type '
         || 'USING event_type::public.analytics_event_type';
  END IF;
END
$do$;