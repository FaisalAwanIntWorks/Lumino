CREATE OR REPLACE FUNCTION public.get_diamond_pool_shape_counts(p_filter jsonb)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  WITH base AS (
    SELECT LOWER(SPLIT_PART(REGEXP_REPLACE(COALESCE(p.shape,''),'\s+',' ','g'),' ',1)) AS shape_id,
           public.diamond_pool_row_matches(p, COALESCE(p_filter,'{}'::jsonb) - 'shapes') AS ok
    FROM public.diamond_inventory_pool p
    WHERE COALESCE(p.shape,'') <> ''
  )
  SELECT COALESCE(jsonb_object_agg(shape_id, n), '{}'::jsonb)
  FROM (
    SELECT shape_id, COUNT(*) FILTER (WHERE ok) AS n
    FROM base
    GROUP BY shape_id
  ) s;
$fn$;

GRANT EXECUTE ON FUNCTION public.get_diamond_pool_shape_counts(jsonb) TO authenticated, service_role, anon;