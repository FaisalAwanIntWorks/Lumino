DROP FUNCTION IF EXISTS public.delete_client_diamond_chunk(uuid);

CREATE OR REPLACE FUNCTION public.delete_client_diamond_chunk(p_client_id uuid)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_authorized      bool := false;
  deleted_in_chunk  int;
BEGIN
  SET LOCAL statement_timeout = '60000';

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

  DELETE FROM public.client_diamond_presets
  WHERE id IN (
    SELECT id FROM public.client_diamond_presets
    WHERE client_id = p_client_id
    LIMIT 5000
  );

  GET DIAGNOSTICS deleted_in_chunk = ROW_COUNT;

  RETURN deleted_in_chunk;
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_client_diamond_chunk(uuid) TO authenticated;