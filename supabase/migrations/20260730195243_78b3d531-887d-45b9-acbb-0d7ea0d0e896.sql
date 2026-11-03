-- 1. Cache table
CREATE TABLE IF NOT EXISTS public.client_diamond_availability_cache (
  client_id uuid PRIMARY KEY REFERENCES public.clients(id) ON DELETE CASCADE,
  availability jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_stale boolean NOT NULL DEFAULT true,
  computed_at timestamptz,
  duration_ms integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
-- [bridge] ensure columns
ALTER TABLE public.client_diamond_availability_cache
  ADD COLUMN IF NOT EXISTS client_id uuid,
  ADD COLUMN IF NOT EXISTS availability jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS is_stale boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS computed_at timestamptz,
  ADD COLUMN IF NOT EXISTS duration_ms integer,
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();


GRANT SELECT ON public.client_diamond_availability_cache TO authenticated;
GRANT ALL ON public.client_diamond_availability_cache TO service_role;

ALTER TABLE public.client_diamond_availability_cache ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view availability cache" ON public.client_diamond_availability_cache;
CREATE POLICY "Admins can view availability cache"
ON public.client_diamond_availability_cache
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'agency_admin') OR client_id = public.get_user_client_id(auth.uid()));

DROP TRIGGER IF EXISTS trg_client_diamond_availability_cache_updated_at ON public.client_diamond_availability_cache;
CREATE TRIGGER trg_client_diamond_availability_cache_updated_at
BEFORE UPDATE ON public.client_diamond_availability_cache
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_diamond_availability_cache_stale
  ON public.client_diamond_availability_cache (is_stale, computed_at NULLS FIRST);

-- 2. Heavy computation (background only) -- identical logic to previous public RPC
CREATE OR REPLACE FUNCTION public.compute_client_diamond_catalog_availability(p_client_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_filter_row public.client_diamond_catalog_filter%ROWTYPE;
  v_filter jsonb;
  v_stone text[]; v_shapes text[];
  v_carat_ranges numeric[];
  v_carat_min numeric; v_carat_max numeric;
  v_selected_shapes text[]; v_selected_stones text[]; v_selected_buckets numeric[];
  v_selected_shape_buckets jsonb;
  v_instock_shapes text[]; v_instock_stones text[]; v_instock_buckets numeric[];
  v_instock_shape_buckets jsonb;
  v_result jsonb;
BEGIN
  SELECT * INTO v_filter_row
  FROM public.client_diamond_catalog_filter
  WHERE client_id = p_client_id AND is_confirmed = true;

  IF NOT FOUND THEN
    WITH rows AS (
      SELECT shape_id, stone_type, FLOOR(carat_value * 2) / 2 AS carat_bucket
      FROM public.client_diamond_presets
      WHERE client_id = p_client_id AND is_enabled = true
    ), shape_buckets AS (
      SELECT shape_id, jsonb_agg(carat_bucket ORDER BY carat_bucket) AS buckets
      FROM (SELECT DISTINCT shape_id, carat_bucket FROM rows) d
      GROUP BY shape_id
    )
    SELECT jsonb_build_object(
      'isConfirmed', false,
      'shapes', COALESCE((SELECT jsonb_agg(shape_id ORDER BY shape_id) FROM (SELECT DISTINCT shape_id FROM rows) s), '[]'::jsonb),
      'stoneTypes', COALESCE((SELECT jsonb_agg(stone_type ORDER BY stone_type) FROM (SELECT DISTINCT stone_type FROM rows) s), '[]'::jsonb),
      'caratBuckets', COALESCE((SELECT jsonb_agg(carat_bucket ORDER BY carat_bucket) FROM (SELECT DISTINCT carat_bucket FROM rows) c), '[]'::jsonb),
      'shapeCaratBuckets', COALESCE((SELECT jsonb_object_agg(shape_id, buckets) FROM shape_buckets), '{}'::jsonb),
      'inStockShapes', COALESCE((SELECT jsonb_agg(shape_id ORDER BY shape_id) FROM (SELECT DISTINCT shape_id FROM rows) s), '[]'::jsonb),
      'inStockStoneTypes', COALESCE((SELECT jsonb_agg(stone_type ORDER BY stone_type) FROM (SELECT DISTINCT stone_type FROM rows) s), '[]'::jsonb),
      'inStockCaratBuckets', COALESCE((SELECT jsonb_agg(carat_bucket ORDER BY carat_bucket) FROM (SELECT DISTINCT carat_bucket FROM rows) c), '[]'::jsonb),
      'inStockShapeCaratBuckets', COALESCE((SELECT jsonb_object_agg(shape_id, buckets) FROM shape_buckets), '{}'::jsonb)
    ) INTO v_result;
    RETURN v_result;
  END IF;

  v_filter := COALESCE(v_filter_row.filter, '{}'::jsonb);
  v_stone := ARRAY(SELECT LOWER(jsonb_array_elements_text(v_filter->'stoneTypes')));
  v_shapes := ARRAY(SELECT LOWER(jsonb_array_elements_text(v_filter->'shapes')));
  v_carat_min := NULLIF(v_filter->>'caratMin','')::numeric;
  v_carat_max := NULLIF(v_filter->>'caratMax','')::numeric;
  v_carat_ranges := ARRAY(SELECT (jsonb_array_elements_text(v_filter->'caratRanges'))::numeric);

  IF cardinality(v_stone) = 0 THEN
    v_selected_stones := ARRAY['natural','lab']::text[];
  ELSE
    v_selected_stones := v_stone;
  END IF;

  IF cardinality(v_shapes) = 0 THEN
    v_selected_shapes := ARRAY(
      SELECT DISTINCT LOWER(SPLIT_PART(REGEXP_REPLACE(COALESCE(p.shape,''),'\s+',' ','g'),' ',1)) AS shp
      FROM public.diamond_inventory_pool p
      WHERE COALESCE(p.shape,'') <> ''
    );
  ELSE
    v_selected_shapes := v_shapes;
  END IF;

  IF v_carat_ranges IS NOT NULL AND array_length(v_carat_ranges, 1) > 0 THEN
    v_selected_buckets := v_carat_ranges;
  ELSE
    v_selected_buckets := ARRAY(
      SELECT b FROM unnest(ARRAY[0.5,1.0,1.5,2.0,2.5,3.0,3.5,4.0,4.5,5.0]::numeric[]) AS b
      WHERE (v_carat_min IS NULL OR b >= floor(v_carat_min * 2)/2)
        AND (v_carat_max IS NULL OR b <= v_carat_max)
    );
  END IF;

  IF cardinality(v_selected_shapes) > 0 THEN
    SELECT jsonb_object_agg(shape, buckets) INTO v_selected_shape_buckets
      FROM (
        SELECT s AS shape,
               (SELECT jsonb_agg(b ORDER BY b) FROM unnest(v_selected_buckets) b) AS buckets
          FROM unnest(v_selected_shapes) s
      ) x;
  ELSE
    v_selected_shape_buckets := '{}'::jsonb;
  END IF;

  WITH pool_rows AS (
    SELECT
      public.diamond_pool_stone_type(p.lg) AS stone_type,
      LOWER(SPLIT_PART(REGEXP_REPLACE(COALESCE(p.shape,''),'\s+',' ','g'),' ',1)) AS shape_id,
      FLOOR(COALESCE(p.carats,0) * 2) / 2 AS carat_bucket
    FROM public.diamond_inventory_pool p
    WHERE public.diamond_pool_row_matches(p, v_filter)
      AND (COALESCE(array_length(v_carat_ranges,1),0) = 0
        OR (FLOOR(COALESCE(p.carats,0) * 2) / 2) = ANY(v_carat_ranges))
  ), distinct_rows AS (
    SELECT DISTINCT stone_type, shape_id, carat_bucket FROM pool_rows
  ), shape_buckets AS (
    SELECT shape_id, jsonb_agg(carat_bucket ORDER BY carat_bucket) AS buckets
    FROM (SELECT DISTINCT shape_id, carat_bucket FROM distinct_rows) d
    GROUP BY shape_id
  )
  SELECT
    COALESCE((SELECT array_agg(DISTINCT shape_id ORDER BY shape_id) FROM distinct_rows), ARRAY[]::text[]),
    COALESCE((SELECT array_agg(DISTINCT stone_type ORDER BY stone_type) FROM distinct_rows), ARRAY[]::text[]),
    COALESCE((SELECT array_agg(DISTINCT carat_bucket ORDER BY carat_bucket) FROM distinct_rows), ARRAY[]::numeric[]),
    COALESCE((SELECT jsonb_object_agg(shape_id, buckets) FROM shape_buckets), '{}'::jsonb)
    INTO v_instock_shapes, v_instock_stones, v_instock_buckets, v_instock_shape_buckets;

  v_result := jsonb_build_object(
    'isConfirmed', true,
    'shapes', COALESCE(to_jsonb(v_selected_shapes), '[]'::jsonb),
    'stoneTypes', COALESCE(to_jsonb(v_selected_stones), '[]'::jsonb),
    'caratBuckets', COALESCE(to_jsonb(v_selected_buckets), '[]'::jsonb),
    'shapeCaratBuckets', COALESCE(v_selected_shape_buckets, '{}'::jsonb),
    'inStockShapes', COALESCE(to_jsonb(v_instock_shapes), '[]'::jsonb),
    'inStockStoneTypes', COALESCE(to_jsonb(v_instock_stones), '[]'::jsonb),
    'inStockCaratBuckets', COALESCE(to_jsonb(v_instock_buckets), '[]'::jsonb),
    'inStockShapeCaratBuckets', COALESCE(v_instock_shape_buckets, '{}'::jsonb)
  );

  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.compute_client_diamond_catalog_availability(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.compute_client_diamond_catalog_availability(uuid) TO service_role, authenticated;

-- 3. Refresh helper (background)
CREATE OR REPLACE FUNCTION public.refresh_client_diamond_availability(p_client_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_start timestamptz := clock_timestamp();
  v_result jsonb;
BEGIN
  PERFORM set_config('statement_timeout', '120s', true);
  v_result := public.compute_client_diamond_catalog_availability(p_client_id);

  INSERT INTO public.client_diamond_availability_cache AS c
    (client_id, availability, is_stale, computed_at, duration_ms)
  VALUES (p_client_id, v_result, false, now(),
          (EXTRACT(EPOCH FROM (clock_timestamp() - v_start)) * 1000)::int)
  ON CONFLICT (client_id) DO UPDATE
    SET availability = EXCLUDED.availability,
        is_stale = false,
        computed_at = EXCLUDED.computed_at,
        duration_ms = EXCLUDED.duration_ms,
        updated_at = now();

  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.refresh_client_diamond_availability(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.refresh_client_diamond_availability(uuid) TO service_role, authenticated;

-- 4. Batch refresh for cron / maintenance
CREATE OR REPLACE FUNCTION public.refresh_stale_diamond_availability(p_limit integer DEFAULT 5)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_client uuid;
  v_count integer := 0;
BEGIN
  FOR v_client IN
    SELECT f.client_id
    FROM public.client_diamond_catalog_filter f
    LEFT JOIN public.client_diamond_availability_cache c ON c.client_id = f.client_id
    WHERE f.is_confirmed = true
      AND (c.client_id IS NULL OR c.is_stale = true OR c.computed_at < now() - interval '24 hours')
    ORDER BY c.computed_at NULLS FIRST
    LIMIT GREATEST(p_limit, 1)
  LOOP
    BEGIN
      PERFORM public.refresh_client_diamond_availability(v_client);
      v_count := v_count + 1;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'availability refresh failed for %: %', v_client, SQLERRM;
    END;
  END LOOP;
  RETURN v_count;
END;
$function$;

REVOKE ALL ON FUNCTION public.refresh_stale_diamond_availability(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.refresh_stale_diamond_availability(integer) TO service_role;

-- 5. Public RPC now reads the cache (fast) with a safe fallback
CREATE OR REPLACE FUNCTION public.get_client_diamond_catalog_availability(p_client_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_cached jsonb;
  v_filter_row public.client_diamond_catalog_filter%ROWTYPE;
  v_filter jsonb;
  v_stone text[]; v_shapes text[];
  v_carat_ranges numeric[];
  v_carat_min numeric; v_carat_max numeric;
  v_selected_shapes text[]; v_selected_stones text[]; v_selected_buckets numeric[];
  v_selected_shape_buckets jsonb;
BEGIN
  SELECT availability INTO v_cached
  FROM public.client_diamond_availability_cache
  WHERE client_id = p_client_id;

  IF v_cached IS NOT NULL AND v_cached <> '{}'::jsonb THEN
    RETURN v_cached;
  END IF;

  SELECT * INTO v_filter_row
  FROM public.client_diamond_catalog_filter
  WHERE client_id = p_client_id AND is_confirmed = true;

  IF NOT FOUND THEN
    -- cheap path: derive everything from the client's own presets
    WITH rows AS (
      SELECT shape_id, stone_type, FLOOR(carat_value * 2) / 2 AS carat_bucket
      FROM public.client_diamond_presets
      WHERE client_id = p_client_id AND is_enabled = true
    ), shape_buckets AS (
      SELECT shape_id, jsonb_agg(carat_bucket ORDER BY carat_bucket) AS buckets
      FROM (SELECT DISTINCT shape_id, carat_bucket FROM rows) d
      GROUP BY shape_id
    )
    SELECT jsonb_build_object(
      'isConfirmed', false,
      'shapes', COALESCE((SELECT jsonb_agg(shape_id ORDER BY shape_id) FROM (SELECT DISTINCT shape_id FROM rows) s), '[]'::jsonb),
      'stoneTypes', COALESCE((SELECT jsonb_agg(stone_type ORDER BY stone_type) FROM (SELECT DISTINCT stone_type FROM rows) s), '[]'::jsonb),
      'caratBuckets', COALESCE((SELECT jsonb_agg(carat_bucket ORDER BY carat_bucket) FROM (SELECT DISTINCT carat_bucket FROM rows) c), '[]'::jsonb),
      'shapeCaratBuckets', COALESCE((SELECT jsonb_object_agg(shape_id, buckets) FROM shape_buckets), '{}'::jsonb),
      'inStockShapes', COALESCE((SELECT jsonb_agg(shape_id ORDER BY shape_id) FROM (SELECT DISTINCT shape_id FROM rows) s), '[]'::jsonb),
      'inStockStoneTypes', COALESCE((SELECT jsonb_agg(stone_type ORDER BY stone_type) FROM (SELECT DISTINCT stone_type FROM rows) s), '[]'::jsonb),
      'inStockCaratBuckets', COALESCE((SELECT jsonb_agg(carat_bucket ORDER BY carat_bucket) FROM (SELECT DISTINCT carat_bucket FROM rows) c), '[]'::jsonb),
      'inStockShapeCaratBuckets', COALESCE((SELECT jsonb_object_agg(shape_id, buckets) FROM shape_buckets), '{}'::jsonb),
      'isFallback', true
    ) INTO v_cached;
    RETURN v_cached;
  END IF;

  -- fallback: serve the client's configured selection (no inventory scan)
  v_filter := COALESCE(v_filter_row.filter, '{}'::jsonb);
  v_stone := ARRAY(SELECT LOWER(jsonb_array_elements_text(v_filter->'stoneTypes')));
  v_shapes := ARRAY(SELECT LOWER(jsonb_array_elements_text(v_filter->'shapes')));
  v_carat_min := NULLIF(v_filter->>'caratMin','')::numeric;
  v_carat_max := NULLIF(v_filter->>'caratMax','')::numeric;
  v_carat_ranges := ARRAY(SELECT (jsonb_array_elements_text(v_filter->'caratRanges'))::numeric);

  v_selected_stones := CASE WHEN cardinality(v_stone) = 0 THEN ARRAY['natural','lab']::text[] ELSE v_stone END;
  v_selected_shapes := CASE WHEN cardinality(v_shapes) = 0
    THEN ARRAY['round','oval','pear','emerald','radiant','princess','marquise','cushion','asscher','heart']::text[]
    ELSE v_shapes END;

  IF v_carat_ranges IS NOT NULL AND array_length(v_carat_ranges, 1) > 0 THEN
    v_selected_buckets := v_carat_ranges;
  ELSE
    v_selected_buckets := ARRAY(
      SELECT b FROM unnest(ARRAY[0.5,1.0,1.5,2.0,2.5,3.0,3.5,4.0,4.5,5.0]::numeric[]) AS b
      WHERE (v_carat_min IS NULL OR b >= floor(v_carat_min * 2)/2)
        AND (v_carat_max IS NULL OR b <= v_carat_max)
    );
  END IF;

  SELECT jsonb_object_agg(shape, buckets) INTO v_selected_shape_buckets
    FROM (
      SELECT s AS shape,
             (SELECT jsonb_agg(b ORDER BY b) FROM unnest(v_selected_buckets) b) AS buckets
        FROM unnest(v_selected_shapes) s
    ) x;

  RETURN jsonb_build_object(
    'isConfirmed', true,
    'shapes', COALESCE(to_jsonb(v_selected_shapes), '[]'::jsonb),
    'stoneTypes', COALESCE(to_jsonb(v_selected_stones), '[]'::jsonb),
    'caratBuckets', COALESCE(to_jsonb(v_selected_buckets), '[]'::jsonb),
    'shapeCaratBuckets', COALESCE(v_selected_shape_buckets, '{}'::jsonb),
    'inStockShapes', COALESCE(to_jsonb(v_selected_shapes), '[]'::jsonb),
    'inStockStoneTypes', COALESCE(to_jsonb(v_selected_stones), '[]'::jsonb),
    'inStockCaratBuckets', COALESCE(to_jsonb(v_selected_buckets), '[]'::jsonb),
    'inStockShapeCaratBuckets', COALESCE(v_selected_shape_buckets, '{}'::jsonb),
    'isFallback', true
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_client_diamond_catalog_availability(uuid) TO anon, authenticated, service_role;

-- 6. Mark cache stale when the client's catalog filter changes
CREATE OR REPLACE FUNCTION public.mark_diamond_availability_stale()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.client_diamond_availability_cache (client_id, availability, is_stale)
  VALUES (NEW.client_id, '{}'::jsonb, true)
  ON CONFLICT (client_id) DO UPDATE SET is_stale = true, updated_at = now();
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_mark_diamond_availability_stale ON public.client_diamond_catalog_filter;
CREATE TRIGGER trg_mark_diamond_availability_stale
AFTER INSERT OR UPDATE ON public.client_diamond_catalog_filter
FOR EACH ROW EXECUTE FUNCTION public.mark_diamond_availability_stale();