-- Diamond catalog: server-side pagination, filter options, and mass price update

-- Index for fast server-side filtering and pagination on client_diamond_presets
CREATE INDEX IF NOT EXISTS idx_cdp_client_filters
  ON public.client_diamond_presets (
    client_id,
    stone_type,
    shape_id,
    color,
    clarity,
    carat_range,
    carat_value
  );

-- Paginated, filtered fetch — returns one page of presets + total_count in every row
CREATE OR REPLACE FUNCTION public.get_diamond_presets_filtered(
  p_client_id    uuid,
  p_stone_type   text DEFAULT NULL,
  p_shape_id     text DEFAULT NULL,
  p_color        text DEFAULT NULL,
  p_clarity      text DEFAULT NULL,
  p_carat_range  text DEFAULT NULL,
  p_page_size    int  DEFAULT 50,
  p_offset       int  DEFAULT 0
)
RETURNS TABLE (
  id            uuid,
  stone_type    text,
  shape_id      text,
  carat_range   text,
  carat_value   numeric,
  color         text,
  clarity       text,
  base_price    numeric,
  custom_price  numeric,
  is_enabled    bool,
  total_count   bigint
)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT
    id,
    stone_type,
    shape_id,
    carat_range,
    carat_value,
    color,
    clarity,
    base_price,
    custom_price,
    is_enabled,
    COUNT(*) OVER () AS total_count
  FROM public.client_diamond_presets
  WHERE client_id = p_client_id
    AND (p_stone_type  IS NULL OR stone_type  = p_stone_type)
    AND (p_shape_id    IS NULL OR shape_id    = p_shape_id)
    AND (p_color       IS NULL OR color       = p_color)
    AND (p_clarity     IS NULL OR clarity     = p_clarity)
    AND (p_carat_range IS NULL OR carat_range = p_carat_range)
  ORDER BY stone_type, shape_id, carat_value, color, clarity
  LIMIT  p_page_size
  OFFSET p_offset;
$$;

GRANT EXECUTE ON FUNCTION public.get_diamond_presets_filtered(uuid, text, text, text, text, text, int, int) TO authenticated;

-- Distinct filter option values + total count — one lightweight query for dropdown population
CREATE OR REPLACE FUNCTION public.get_diamond_preset_filter_options(p_client_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT jsonb_build_object(
    'shapes',      ARRAY(SELECT DISTINCT shape_id   FROM public.client_diamond_presets WHERE client_id = p_client_id ORDER BY 1),
    'colors',      ARRAY(SELECT DISTINCT color       FROM public.client_diamond_presets WHERE client_id = p_client_id ORDER BY 1),
    'clarities',   ARRAY(SELECT DISTINCT clarity     FROM public.client_diamond_presets WHERE client_id = p_client_id ORDER BY 1),
    'caratRanges', ARRAY(SELECT DISTINCT carat_range FROM public.client_diamond_presets WHERE client_id = p_client_id ORDER BY 1),
    'stoneTypes',  ARRAY(SELECT DISTINCT stone_type  FROM public.client_diamond_presets WHERE client_id = p_client_id ORDER BY 1),
    'totalCount',  (SELECT COUNT(*) FROM public.client_diamond_presets WHERE client_id = p_client_id)
  );
$$;

GRANT EXECUTE ON FUNCTION public.get_diamond_preset_filter_options(uuid) TO authenticated;

-- Mass price update — applies a multiplier and/or addend to all matching presets
CREATE OR REPLACE FUNCTION public.mass_update_diamond_prices(
  p_client_id    uuid,
  p_multiplier   numeric DEFAULT 1.0,
  p_addend       numeric DEFAULT 0,
  p_stone_type   text DEFAULT NULL,
  p_shape_id     text DEFAULT NULL,
  p_color        text DEFAULT NULL,
  p_clarity      text DEFAULT NULL,
  p_carat_range  text DEFAULT NULL
)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  updated_count int;
BEGIN
  UPDATE public.client_diamond_presets
  SET custom_price = GREATEST(0, round(custom_price * p_multiplier + p_addend))
  WHERE client_id = p_client_id
    AND (p_stone_type  IS NULL OR stone_type  = p_stone_type)
    AND (p_shape_id    IS NULL OR shape_id    = p_shape_id)
    AND (p_color       IS NULL OR color       = p_color)
    AND (p_clarity     IS NULL OR clarity     = p_clarity)
    AND (p_carat_range IS NULL OR carat_range = p_carat_range);
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.mass_update_diamond_prices(uuid, numeric, numeric, text, text, text, text, text) TO authenticated;
