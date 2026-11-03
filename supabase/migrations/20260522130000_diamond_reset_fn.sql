-- Fast single-statement reset for client diamond presets.
-- Called by the reset-client-diamonds edge function to avoid the slow
-- batch-loop approach that times out on large catalogs (100k+ rows).
CREATE OR REPLACE FUNCTION public.reset_client_diamond_presets(p_client_id uuid)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER
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
