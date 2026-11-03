CREATE OR REPLACE FUNCTION public.reset_client_diamond_presets(p_client_id uuid)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count int;
BEGIN
  DELETE FROM public.client_diamond_presets WHERE client_id = p_client_id;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;

  DELETE FROM public.diamond_catalog_config WHERE client_id = p_client_id;

  RETURN deleted_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.reset_client_diamond_presets(uuid) TO service_role;