-- v3: definitive fix for statement timeout.
--
-- SET LOCAL inside the function body cannot override the session-level
-- statement_timeout that PostgREST already set before the function runs.
--
-- The correct approach is the SET clause on CREATE FUNCTION itself — PostgreSQL
-- applies this BEFORE the session setting, so it always wins regardless of what
-- PostgREST configured at the connection level.
--
-- Also ensures the index exists so the subquery uses an index seek, not a full scan.

-- Index (idempotent — skipped if already exists from earlier migration)
CREATE INDEX IF NOT EXISTS idx_cdp_client_filters
  ON public.client_diamond_presets (
    client_id, stone_type, shape_id, color, clarity, carat_range, carat_value
  );

-- Drop old versions first so we can change the function-level SET attribute
DROP FUNCTION IF EXISTS public.delete_client_diamond_chunk(uuid);

CREATE OR REPLACE FUNCTION public.delete_client_diamond_chunk(p_client_id uuid)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET statement_timeout = '120s'   -- overrides PostgREST session limit (8 s default)
SET lock_timeout     = '30s'
AS $$
DECLARE
  v_authorized      bool := false;
  deleted_in_chunk  int;
BEGIN
  -- Authorization: agency admin, client owner, or staff with catalog edit
  IF EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'agency_admin'
  ) THEN v_authorized := true; END IF;

  IF EXISTS (
    SELECT 1 FROM public.clients
    WHERE id = p_client_id AND user_id = auth.uid()
  ) THEN v_authorized := true; END IF;

  IF EXISTS (
    SELECT 1 FROM public.staff_members
    WHERE user_id    = auth.uid()
      AND client_id  = p_client_id
      AND (permissions->>'catalog_access') ILIKE 'edit'
  ) THEN v_authorized := true; END IF;

  IF NOT v_authorized THEN
    RAISE EXCEPTION 'Not authorized to reset this diamond catalog';
  END IF;

  -- Delete one chunk using the client_id index (idx_cdp_client_filters)
  -- GET DIAGNOSTICS is instant — no table scan, no COUNT(*)
  DELETE FROM public.client_diamond_presets
  WHERE id IN (
    SELECT id FROM public.client_diamond_presets
    WHERE client_id = p_client_id
    LIMIT 5000
  );

  GET DIAGNOSTICS deleted_in_chunk = ROW_COUNT;

  -- Return 0 when nothing was deleted → caller knows it is done
  RETURN deleted_in_chunk;
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_client_diamond_chunk(uuid) TO authenticated;
