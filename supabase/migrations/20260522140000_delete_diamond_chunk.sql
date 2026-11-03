-- Return type differs from the version created earlier; drop it first.
DROP FUNCTION IF EXISTS public.delete_client_diamond_chunk(uuid);

-- Chunked delete for client diamond presets.
-- Each call deletes up to 10,000 rows and returns the remaining count.
-- The frontend loops until remaining = 0, avoiding any statement timeout.
CREATE OR REPLACE FUNCTION public.delete_client_diamond_chunk(p_client_id uuid)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_authorized bool := false;
  remaining     bigint;
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
    WHERE user_id = auth.uid()
      AND client_id = p_client_id
      AND (permissions->>'catalog_access') ILIKE 'edit'
  ) THEN v_authorized := true; END IF;

  IF NOT v_authorized THEN
    RAISE EXCEPTION 'Not authorized to reset this diamond catalog';
  END IF;

  -- Delete one chunk
  DELETE FROM public.client_diamond_presets
  WHERE id IN (
    SELECT id FROM public.client_diamond_presets
    WHERE client_id = p_client_id
    LIMIT 10000
  );

  -- Return how many rows are left
  SELECT COUNT(*) INTO remaining
  FROM public.client_diamond_presets
  WHERE client_id = p_client_id;

  RETURN remaining;
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_client_diamond_chunk(uuid) TO authenticated;
