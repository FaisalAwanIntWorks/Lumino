CREATE OR REPLACE FUNCTION public.swap_diamond_inventory_pool(p_batch_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET statement_timeout TO '600s'
AS $function$
DECLARE
  v_count integer;
BEGIN
  IF NOT public.has_role(auth.uid(), 'agency_admin'::app_role) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  SELECT COUNT(*) INTO v_count FROM public.diamond_inventory_pool_staging;
  IF v_count < 1 THEN
    RAISE EXCEPTION 'staging_empty';
  END IF;

  -- CASCADE also wipes client_diamond_presets (intentional: client catalogs
  -- are regenerated from diamond filters after each pool replace).
  TRUNCATE TABLE public.diamond_inventory_pool CASCADE;

  INSERT INTO public.diamond_inventory_pool
  SELECT * FROM public.diamond_inventory_pool_staging;

  UPDATE public.diamond_inventory_pool SET import_batch_id = p_batch_id WHERE import_batch_id IS NULL;

  TRUNCATE TABLE public.diamond_inventory_pool_staging;

  RETURN jsonb_build_object('success', true, 'row_count', v_count);
END;
$function$;