
CREATE OR REPLACE FUNCTION public.get_diamond_pool_preview(
  p_filter jsonb,
  p_markup_natural numeric DEFAULT 0,
  p_markup_lab numeric DEFAULT 0,
  p_page_size integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS TABLE(
  id uuid,
  stone_type text,
  shape_id text,
  carat_range text,
  carat_value numeric,
  color text,
  clarity text,
  base_price numeric,
  custom_price numeric,
  is_enabled boolean,
  total_count bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH base AS (
    SELECT
      p.id,
      CASE WHEN COALESCE(p.lg,'') ILIKE 'Y%' THEN 'lab' ELSE 'natural' END AS stone_type,
      LOWER(SPLIT_PART(REGEXP_REPLACE(COALESCE(p.shape,''),'\s+',' ','g'),' ',1)) AS shape_id,
      p.carats AS carat_value,
      UPPER(COALESCE(p.col,'')) AS color,
      UPPER(COALESCE(p.clar,'')) AS clarity,
      ROUND(
        COALESCE(p.price,0) *
        (1 + (CASE WHEN COALESCE(p.lg,'') ILIKE 'Y%' THEN p_markup_lab ELSE p_markup_natural END) / 100.0)
      , 2) AS base_price,
      FLOOR(p.carats * 2) / 2 AS carat_bucket
    FROM public.diamond_inventory_pool p
    WHERE public.diamond_pool_row_matches(p, p_filter)
  )
  SELECT
    b.id, b.stone_type, b.shape_id,
    TRIM(TO_CHAR(b.carat_bucket, 'FM0.00')) || '-' || TRIM(TO_CHAR(b.carat_bucket + 0.49, 'FM0.00')) AS carat_range,
    b.carat_value, b.color, b.clarity, b.base_price,
    NULL::numeric AS custom_price,
    true AS is_enabled,
    COUNT(*) OVER ()::bigint AS total_count
  FROM base b
  ORDER BY b.stone_type, b.shape_id, b.carat_value, b.color, b.clarity
  LIMIT p_page_size OFFSET p_offset;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_diamond_pool_preview(jsonb, numeric, numeric, integer, integer) TO authenticated, service_role;
