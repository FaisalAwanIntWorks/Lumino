-- get_diamond_pool_price_range_for_filter(p_filter)
-- Returns min/max pool prices split by stone type for diamonds that match
-- the supplied filter (all fields EXCEPT price constraints are evaluated).
-- Called by the catalog UI whenever a non-price filter changes so the
-- price-range sliders always show bounds relevant to the current selection.

CREATE OR REPLACE FUNCTION public.get_diamond_pool_price_range_for_filter(p_filter jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_stone text[]; v_shapes text[]; v_colors text[]; v_clar text[];
  v_cuts  text[]; v_pol   text[]; v_symm  text[]; v_flo  text[]; v_labs text[];
  v_carat_min numeric; v_carat_max numeric;
  v_carat_ranges numeric[];
  v_len_min numeric; v_len_max numeric; v_canadian boolean;
BEGIN
  IF p_filter IS NULL THEN p_filter := '{}'::jsonb; END IF;

  SELECT ARRAY(SELECT LOWER(jsonb_array_elements_text(p_filter->'stoneTypes'))) INTO v_stone;
  SELECT ARRAY(SELECT LOWER(jsonb_array_elements_text(p_filter->'shapes')))     INTO v_shapes;
  SELECT ARRAY(SELECT UPPER(jsonb_array_elements_text(p_filter->'colors')))     INTO v_colors;
  SELECT ARRAY(SELECT UPPER(jsonb_array_elements_text(p_filter->'clarities')))  INTO v_clar;
  SELECT ARRAY(SELECT UPPER(jsonb_array_elements_text(p_filter->'cuts')))       INTO v_cuts;
  SELECT ARRAY(SELECT UPPER(jsonb_array_elements_text(p_filter->'polish')))     INTO v_pol;
  SELECT ARRAY(SELECT UPPER(jsonb_array_elements_text(p_filter->'symmetry')))   INTO v_symm;
  SELECT ARRAY(SELECT UPPER(jsonb_array_elements_text(p_filter->'fluorescence'))) INTO v_flo;
  SELECT ARRAY(SELECT UPPER(jsonb_array_elements_text(p_filter->'labs')))       INTO v_labs;
  v_carat_min := NULLIF(p_filter->>'caratMin','')::numeric;
  v_carat_max := NULLIF(p_filter->>'caratMax','')::numeric;
  SELECT ARRAY(SELECT (jsonb_array_elements_text(p_filter->'caratRanges'))::numeric) INTO v_carat_ranges;
  v_len_min   := NULLIF(p_filter->>'lengthMin','')::numeric;
  v_len_max   := NULLIF(p_filter->>'lengthMax','')::numeric;
  v_canadian  := COALESCE((p_filter->>'canadianOnly')::boolean, false);

  RETURN (
    SELECT jsonb_build_object(
      'minNatural', COALESCE(FLOOR(MIN(CASE WHEN NOT (COALESCE(p.lg,'') ILIKE 'Y%') THEN p.price END))::bigint, 0),
      'maxNatural', COALESCE(CEIL( MAX(CASE WHEN NOT (COALESCE(p.lg,'') ILIKE 'Y%') THEN p.price END))::bigint, 0),
      'minLab',     COALESCE(FLOOR(MIN(CASE WHEN      COALESCE(p.lg,'') ILIKE 'Y%'  THEN p.price END))::bigint, 0),
      'maxLab',     COALESCE(CEIL( MAX(CASE WHEN      COALESCE(p.lg,'') ILIKE 'Y%'  THEN p.price END))::bigint, 0)
    )
    FROM public.diamond_inventory_pool p
    WHERE p.price > 0
      AND (COALESCE(array_length(v_stone,1),0)  = 0 OR (CASE WHEN COALESCE(p.lg,'') ILIKE 'Y%' THEN 'lab' ELSE 'natural' END) = ANY(v_stone))
      AND (COALESCE(array_length(v_shapes,1),0) = 0 OR LOWER(SPLIT_PART(REGEXP_REPLACE(COALESCE(p.shape,''),'\s+',' ','g'),' ',1)) = ANY(v_shapes))
      AND (COALESCE(array_length(v_colors,1),0) = 0 OR UPPER(COALESCE(p.col,''))  = ANY(v_colors))
      AND (COALESCE(array_length(v_clar,1),0)   = 0 OR UPPER(COALESCE(p.clar,'')) = ANY(v_clar))
      AND (COALESCE(array_length(v_cuts,1),0)   = 0 OR UPPER(COALESCE(p.cut,''))  = ANY(v_cuts))
      AND (COALESCE(array_length(v_pol,1),0)    = 0 OR UPPER(COALESCE(p.pol,''))  = ANY(v_pol))
      AND (COALESCE(array_length(v_symm,1),0)   = 0 OR UPPER(COALESCE(p.symm,'')) = ANY(v_symm))
      AND (COALESCE(array_length(v_flo,1),0)    = 0 OR UPPER(COALESCE(p.flo,''))  = ANY(v_flo))
      AND (COALESCE(array_length(v_labs,1),0)   = 0 OR UPPER(COALESCE(p.lab,''))  = ANY(v_labs))
      AND (v_carat_min IS NULL OR COALESCE(p.carats,0) >= v_carat_min)
      AND (v_carat_max IS NULL OR COALESCE(p.carats,0) <= v_carat_max)
      AND (COALESCE(array_length(v_carat_ranges,1),0) = 0 OR (FLOOR(COALESCE(p.carats,0) * 2) / 2) = ANY(v_carat_ranges))
      AND (v_len_min IS NULL OR COALESCE(p.length,0) >= v_len_min)
      AND (v_len_max IS NULL OR COALESCE(p.length,0) <= v_len_max)
      AND (NOT v_canadian OR COALESCE(p.canada_mark_eligible,false))
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_diamond_pool_price_range_for_filter(jsonb) TO authenticated, anon, service_role;
