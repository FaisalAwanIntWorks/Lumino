ALTER TABLE public.client_diamond_presets
  ADD COLUMN IF NOT EXISTS pool_stock_count INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_client_diamond_presets_pool_stock
  ON public.client_diamond_presets (client_id, pool_stock_count);

CREATE OR REPLACE FUNCTION public.get_diamond_pool_distinct_values()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'shapes',       (SELECT COALESCE(jsonb_agg(v ORDER BY v), '[]'::jsonb) FROM (SELECT DISTINCT NULLIF(TRIM(shape),'') v FROM diamond_inventory_pool WHERE shape IS NOT NULL) s WHERE v IS NOT NULL),
    'colors',       (SELECT COALESCE(jsonb_agg(v ORDER BY v), '[]'::jsonb) FROM (SELECT DISTINCT NULLIF(TRIM(col),'')   v FROM diamond_inventory_pool WHERE col   IS NOT NULL) s WHERE v IS NOT NULL),
    'clarities',    (SELECT COALESCE(jsonb_agg(v ORDER BY v), '[]'::jsonb) FROM (SELECT DISTINCT NULLIF(TRIM(clar),'')  v FROM diamond_inventory_pool WHERE clar  IS NOT NULL) s WHERE v IS NOT NULL),
    'cuts',         (SELECT COALESCE(jsonb_agg(v ORDER BY v), '[]'::jsonb) FROM (SELECT DISTINCT NULLIF(TRIM(cut),'')   v FROM diamond_inventory_pool WHERE cut   IS NOT NULL AND cut <> '-') s WHERE v IS NOT NULL),
    'polish',       (SELECT COALESCE(jsonb_agg(v ORDER BY v), '[]'::jsonb) FROM (SELECT DISTINCT NULLIF(TRIM(pol),'')   v FROM diamond_inventory_pool WHERE pol   IS NOT NULL AND pol <> '-') s WHERE v IS NOT NULL),
    'symmetry',     (SELECT COALESCE(jsonb_agg(v ORDER BY v), '[]'::jsonb) FROM (SELECT DISTINCT NULLIF(TRIM(symm),'')  v FROM diamond_inventory_pool WHERE symm  IS NOT NULL AND symm <> '-') s WHERE v IS NOT NULL),
    'fluorescence', (SELECT COALESCE(jsonb_agg(v ORDER BY v), '[]'::jsonb) FROM (SELECT DISTINCT NULLIF(TRIM(flo),'')   v FROM diamond_inventory_pool WHERE flo   IS NOT NULL) s WHERE v IS NOT NULL),
    'labs',         (SELECT COALESCE(jsonb_agg(v ORDER BY v), '[]'::jsonb) FROM (SELECT DISTINCT NULLIF(TRIM(lab),'')   v FROM diamond_inventory_pool WHERE lab   IS NOT NULL) s WHERE v IS NOT NULL)
  );
$$;

GRANT EXECUTE ON FUNCTION public.get_diamond_pool_distinct_values() TO authenticated;