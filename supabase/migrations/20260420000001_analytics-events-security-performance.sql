-- =================================================================
-- Analytics Events: Security, Performance & Data Integrity Fixes
-- Issues A-H from Db_tables_analysis/analytics_events_issues.md
--
-- IMPORTANT: Issue E (ENUM migration) at the bottom performs a full
-- table rewrite. If the analytics_events table is very large, run
-- during low-traffic hours. All other sections are safe any time.
-- =================================================================

-- =====================================================================
-- HELPER FUNCTION for anonymous INSERT policy (Issue A)
--
-- Why a SECURITY DEFINER function is required:
--   The anon role has no SELECT RLS policy on public.clients.
--   A plain EXISTS subquery inside WITH CHECK runs as the calling role
--   (anon), so RLS on clients would block it and always return false —
--   breaking every widget insert. SECURITY DEFINER runs as the function
--   owner (postgres) and bypasses RLS, letting us safely validate that
--   the client_id actually exists without exposing client rows to anon.
-- =====================================================================
CREATE OR REPLACE FUNCTION public.is_valid_client_id(_client_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.clients WHERE id = _client_id)
$$;

-- =====================================================================
-- ISSUE A (CRITICAL): Replace permissive INSERT policy with ownership checks
-- Problem: any authenticated user could fabricate events for any client_id
-- =====================================================================
DROP POLICY IF EXISTS "System can create analytics events" ON public.analytics_events;

-- Anonymous role (configurator widget visitors via anon key):
-- Validates that client_id is a real client UUID using SECURITY DEFINER
-- function above (bypasses clients RLS which anon cannot read directly).
DROP POLICY IF EXISTS "Anonymous can track analytics events" ON public.analytics_events;
CREATE POLICY "Anonymous can track analytics events"
  ON public.analytics_events FOR INSERT
  TO anon
  WITH CHECK (
    client_id IS NOT NULL
    AND public.is_valid_client_id(client_id)
  );

-- Authenticated role: clients may only insert for their own client_id; admins unrestricted
DROP POLICY IF EXISTS "Clients can create own analytics events" ON public.analytics_events;
CREATE POLICY "Clients can create own analytics events"
  ON public.analytics_events FOR INSERT
  TO authenticated
  WITH CHECK (
    client_id = public.get_user_client_id(auth.uid())
    OR public.has_role(auth.uid(), 'agency_admin')
  );

-- =====================================================================
-- ISSUE B (HIGH): client_id will be NOT NULL going forward via the INSERT
-- policies above. Historical NULL rows (already invisible to clients under
-- the existing SELECT policy) are preserved as-is — no data deleted.
-- =====================================================================

-- =====================================================================
-- ISSUE D (HIGH): Add missing FK indexes on product_id and variation_id
-- Required for JOIN performance and ON DELETE cascade scan avoidance
-- =====================================================================
CREATE INDEX IF NOT EXISTS idx_analytics_events_product_id
  ON public.analytics_events(product_id);

CREATE INDEX IF NOT EXISTS idx_analytics_events_variation_id
  ON public.analytics_events(variation_id);

-- =====================================================================
-- ISSUE C (HIGH): Replace single-column indexes with composite indexes
-- Also drops idx_analytics_event_type (added in 20251120182245) — covered below
-- =====================================================================
DROP INDEX IF EXISTS idx_analytics_events_client_id;
DROP INDEX IF EXISTS idx_analytics_events_created_at;
DROP INDEX IF EXISTS idx_analytics_event_type;

-- Covers: client dashboard date-range queries, retention cleanup
CREATE INDEX IF NOT EXISTS idx_analytics_events_client_time
  ON public.analytics_events(client_id, created_at DESC);

-- Covers: per-client per-event-type aggregations (conversion funnel, widget stats)
CREATE INDEX IF NOT EXISTS idx_analytics_events_client_type_time
  ON public.analytics_events(client_id, event_type, created_at DESC);

-- Covers: admin-wide aggregations by event type
CREATE INDEX IF NOT EXISTS idx_analytics_events_event_type_time
  ON public.analytics_events(event_type, created_at DESC);

-- =====================================================================
-- ISSUE H (LOW): Drop redundant single-column index on user_roles
-- The UNIQUE(user_id, role) table constraint already creates a composite
-- unique index that fully covers has_role() queries on (user_id, role)
-- =====================================================================
DROP INDEX IF EXISTS idx_user_roles_user_id;

-- =====================================================================
-- ISSUE F (MEDIUM): GIN index for JSONB metadata column
-- Required for: WHERE metadata @> '{"session_id":"..."}' style queries
-- =====================================================================
CREATE INDEX IF NOT EXISTS idx_analytics_events_metadata_gin
  ON public.analytics_events USING GIN(metadata);

-- =====================================================================
-- ISSUE G (MEDIUM): Idempotency key to prevent duplicate event counts
-- Frontend should generate: hash(client_id + event_type + session_id + minute_bucket)
-- Partial unique index: only enforces uniqueness when key is provided
-- =====================================================================
ALTER TABLE public.analytics_events
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_analytics_events_idempotency
  ON public.analytics_events(idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- =====================================================================
-- ISSUE E (MEDIUM): Migrate event_type from TEXT + CHECK constraint to ENUM
--
-- WHY ENUM IS BETTER HERE:
--   TEXT stores up to 20 bytes per row; ENUM stores 4 bytes.
--   Adding new event types later uses ALTER TYPE ... ADD VALUE (no table lock)
--   instead of the current DROP CONSTRAINT + ADD CONSTRAINT pattern.
--
-- NOTE: ALTER COLUMN TYPE below causes a full table rewrite with a brief
-- exclusive lock. Safe on small/medium tables; on very large tables run
-- during off-peak hours or use pg_repack before deploying.
--
-- All 10 existing event types (from last CHECK constraint update) preserved.
-- Text comparisons like event_type = 'widget_view' continue to work — PostgreSQL
-- automatically casts the string literal to the enum type.
-- =====================================================================
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
