-- v2: removes the expensive COUNT(*) that caused statement timeouts.
-- Returns rows deleted in THIS chunk (not remaining count).
-- Returns 0 when nothing left → frontend stops the loop.
-- SET LOCAL statement_timeout overrides the 8-second PostgREST default
-- for the duration of this function call only.

-- Return type differs from the earlier version; drop it first.
DROP FUNCTION IF EXISTS public.delete_client_diamond_chunk(uuid);
CREATE OR REPLACE FUNCTION public.delete_client_diamond_chunk(p_client_id uuid)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_authorized      bool := false;
  deleted_in_chunk  int;
BEGIN
  -- Give this function 60 seconds — far more than any single 5k-row DELETE needs
  SET LOCAL statement_timeout = '60000';

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

  -- Delete one chunk — cheap index seek, no full scan
  DELETE FROM public.client_diamond_presets
  WHERE id IN (
    SELECT id FROM public.client_diamond_presets
    WHERE client_id = p_client_id
    LIMIT 5000
  );

  -- GET DIAGNOSTICS is instant (reads a counter, no table scan)
  GET DIAGNOSTICS deleted_in_chunk = ROW_COUNT;

  -- 0 → nothing was deleted → caller stops the loop
  RETURN deleted_in_chunk;
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_client_diamond_chunk(uuid) TO authenticated;
