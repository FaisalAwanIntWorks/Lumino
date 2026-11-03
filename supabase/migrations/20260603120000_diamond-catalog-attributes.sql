-- get_diamond_catalog_attributes(p_client_id)
-- ---------------------------------------------------------------------------
-- Returns the FULL set of diamond attributes a client's catalog actually
-- contains, so the Ring OS chat agent (ring-chat edge function) can answer
-- questions about cut, polish, symmetry, fluorescence, lab/certification,
-- origin (Canadian) and measurements — not just shape/carat/color/clarity.
--
-- Why a dedicated function (and not the stored filter jsonb):
--   client_diamond_catalog_filter.filter only records RESTRICTIONS the client
--   applied. When the client keeps "all" options for an attribute, that key is
--   omitted entirely (see cleanFilterForServer in DiamondCatalogLive.tsx). So
--   the jsonb cannot tell us the real universe. The accurate answer is the
--   DISTINCT attribute values present in diamond_inventory_pool AFTER applying
--   the confirmed filter — exactly what the widget shows.
--
--   * Pool path (confirmed filter): distinct attributes from the marked-up,
--     filtered pool view.
--   * Legacy path (no confirmed filter): distinct attributes from
--     client_diamond_presets (only stone/shape/color/clarity/cut/fluorescence
--     and cert availability exist on that table).
--
-- Mirrors the filter WHERE clause of get_diamond_presets_filtered so the
-- attribute universe stays consistent with the diamonds the widget lists.

CREATE OR REPLACE FUNCTION public.get_diamond_catalog_attributes(p_client_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_filter_row public.client_diamond_catalog_filter%ROWTYPE;
  v_filter     jsonb;
  v_stone  text[]; v_shapes text[]; v_colors text[]; v_clar text[];
  v_cuts   text[]; v_pol    text[]; v_symm   text[]; v_flo  text[]; v_labs text[];
  v_carat_min numeric; v_carat_max numeric;
  v_carat_ranges numeric[];
  v_len_min numeric; v_len_max numeric; v_canadian boolean;
  v_result jsonb;
BEGIN
  SELECT * INTO v_filter_row
  FROM public.client_diamond_catalog_filter
  WHERE client_id = p_client_id AND is_confirmed = true;

  -- ── Legacy path (no confirmed filter) ──────────────────────────────────────
  IF NOT FOUND THEN
    SELECT jsonb_build_object(
      'source',        'legacy',
      'stoneTypes',    COALESCE((SELECT jsonb_agg(DISTINCT cdp.stone_type ORDER BY cdp.stone_type)
                                   FROM public.client_diamond_presets cdp
                                  WHERE cdp.client_id = p_client_id AND cdp.is_enabled
                                    AND cdp.stone_type IS NOT NULL), '[]'::jsonb),
      'shapes',        COALESCE((SELECT jsonb_agg(DISTINCT cdp.shape_id ORDER BY cdp.shape_id)
                                   FROM public.client_diamond_presets cdp
                                  WHERE cdp.client_id = p_client_id AND cdp.is_enabled
                                    AND cdp.shape_id IS NOT NULL), '[]'::jsonb),
      'colors',        COALESCE((SELECT jsonb_agg(DISTINCT UPPER(cdp.color) ORDER BY UPPER(cdp.color))
                                   FROM public.client_diamond_presets cdp
                                  WHERE cdp.client_id = p_client_id AND cdp.is_enabled
                                    AND cdp.color IS NOT NULL), '[]'::jsonb),
      'clarities',     COALESCE((SELECT jsonb_agg(DISTINCT UPPER(cdp.clarity) ORDER BY UPPER(cdp.clarity))
                                   FROM public.client_diamond_presets cdp
                                  WHERE cdp.client_id = p_client_id AND cdp.is_enabled
                                    AND cdp.clarity IS NOT NULL), '[]'::jsonb),
      'cuts',          COALESCE((SELECT jsonb_agg(DISTINCT UPPER(cdp.cut_grade) ORDER BY UPPER(cdp.cut_grade))
                                   FROM public.client_diamond_presets cdp
                                  WHERE cdp.client_id = p_client_id AND cdp.is_enabled
                                    AND COALESCE(cdp.cut_grade, '') <> ''), '[]'::jsonb),
      'fluorescence',  COALESCE((SELECT jsonb_agg(DISTINCT UPPER(cdp.fluorescence) ORDER BY UPPER(cdp.fluorescence))
                                   FROM public.client_diamond_presets cdp
                                  WHERE cdp.client_id = p_client_id AND cdp.is_enabled
                                    AND COALESCE(cdp.fluorescence, '') <> ''), '[]'::jsonb),
      'caratMin',      (SELECT MIN(cdp.carat_value) FROM public.client_diamond_presets cdp
                          WHERE cdp.client_id = p_client_id AND cdp.is_enabled),
      'caratMax',      (SELECT MAX(cdp.carat_value) FROM public.client_diamond_presets cdp
                          WHERE cdp.client_id = p_client_id AND cdp.is_enabled),
      'certReports',   COALESCE((SELECT bool_or(cdp.report_no IS NOT NULL)
                                   FROM public.client_diamond_presets cdp
                                  WHERE cdp.client_id = p_client_id AND cdp.is_enabled), false),
      'totalStones',   (SELECT COUNT(*) FROM public.client_diamond_presets cdp
                          WHERE cdp.client_id = p_client_id AND cdp.is_enabled)
    ) INTO v_result;
    RETURN COALESCE(v_result, '{}'::jsonb);
  END IF;

  -- ── Pool path (confirmed catalog filter) ───────────────────────────────────
  v_filter := COALESCE(v_filter_row.filter, '{}'::jsonb);
  SELECT ARRAY(SELECT LOWER(jsonb_array_elements_text(v_filter->'stoneTypes'))) INTO v_stone;
  SELECT ARRAY(SELECT LOWER(jsonb_array_elements_text(v_filter->'shapes')))     INTO v_shapes;
  SELECT ARRAY(SELECT UPPER(jsonb_array_elements_text(v_filter->'colors')))     INTO v_colors;
  SELECT ARRAY(SELECT UPPER(jsonb_array_elements_text(v_filter->'clarities')))  INTO v_clar;
  SELECT ARRAY(SELECT UPPER(jsonb_array_elements_text(v_filter->'cuts')))       INTO v_cuts;
  SELECT ARRAY(SELECT UPPER(jsonb_array_elements_text(v_filter->'polish')))     INTO v_pol;
  SELECT ARRAY(SELECT UPPER(jsonb_array_elements_text(v_filter->'symmetry')))   INTO v_symm;
  SELECT ARRAY(SELECT UPPER(jsonb_array_elements_text(v_filter->'fluorescence'))) INTO v_flo;
  SELECT ARRAY(SELECT UPPER(jsonb_array_elements_text(v_filter->'labs')))       INTO v_labs;
  v_carat_min := NULLIF(v_filter->>'caratMin','')::numeric;
  v_carat_max := NULLIF(v_filter->>'caratMax','')::numeric;
  SELECT ARRAY(SELECT (jsonb_array_elements_text(v_filter->'caratRanges'))::numeric) INTO v_carat_ranges;
  v_len_min   := NULLIF(v_filter->>'lengthMin','')::numeric;
  v_len_max   := NULLIF(v_filter->>'lengthMax','')::numeric;
  v_canadian  := COALESCE((v_filter->>'canadianOnly')::boolean, false);

  WITH base AS (
    SELECT
      CASE WHEN COALESCE(p.lg,'') ILIKE 'Y%' THEN 'lab' ELSE 'natural' END        AS stone_type,
      LOWER(SPLIT_PART(REGEXP_REPLACE(COALESCE(p.shape,''),'\s+',' ','g'),' ',1))  AS shape_id,
      UPPER(COALESCE(p.col,''))   AS color,
      UPPER(COALESCE(p.clar,''))  AS clarity,
      UPPER(COALESCE(p.cut,''))   AS cut,
      UPPER(COALESCE(p.pol,''))   AS polish,
      UPPER(COALESCE(p.symm,''))  AS symmetry,
      UPPER(COALESCE(p.flo,''))   AS fluorescence,
      UPPER(COALESCE(p.lab,''))   AS lab,
      COALESCE(p.carats,0)        AS carat_value,
      COALESCE(p.length,0)        AS length,
      COALESCE(p.canada_mark_eligible,false) AS canadian
    FROM public.diamond_inventory_pool p
    WHERE
      (COALESCE(array_length(v_stone,1),0)  = 0 OR (CASE WHEN COALESCE(p.lg,'') ILIKE 'Y%' THEN 'lab' ELSE 'natural' END) = ANY(v_stone))
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
  )
  SELECT jsonb_build_object(
    'source',            'pool',
    'stoneTypes',        COALESCE((SELECT jsonb_agg(DISTINCT stone_type   ORDER BY stone_type)   FROM base WHERE stone_type   <> ''), '[]'::jsonb),
    'shapes',            COALESCE((SELECT jsonb_agg(DISTINCT shape_id     ORDER BY shape_id)     FROM base WHERE shape_id     <> ''), '[]'::jsonb),
    'colors',            COALESCE((SELECT jsonb_agg(DISTINCT color        ORDER BY color)        FROM base WHERE color        <> ''), '[]'::jsonb),
    'clarities',         COALESCE((SELECT jsonb_agg(DISTINCT clarity      ORDER BY clarity)      FROM base WHERE clarity      <> ''), '[]'::jsonb),
    'cuts',              COALESCE((SELECT jsonb_agg(DISTINCT cut          ORDER BY cut)          FROM base WHERE cut          <> ''), '[]'::jsonb),
    'polish',            COALESCE((SELECT jsonb_agg(DISTINCT polish       ORDER BY polish)       FROM base WHERE polish       <> ''), '[]'::jsonb),
    'symmetry',          COALESCE((SELECT jsonb_agg(DISTINCT symmetry     ORDER BY symmetry)     FROM base WHERE symmetry     <> ''), '[]'::jsonb),
    'fluorescence',      COALESCE((SELECT jsonb_agg(DISTINCT fluorescence ORDER BY fluorescence) FROM base WHERE fluorescence <> ''), '[]'::jsonb),
    'labs',              COALESCE((SELECT jsonb_agg(DISTINCT lab          ORDER BY lab)          FROM base WHERE lab          <> ''), '[]'::jsonb),
    'caratMin',          (SELECT MIN(carat_value) FROM base),
    'caratMax',          (SELECT MAX(carat_value) FROM base),
    'lengthMin',         (SELECT MIN(length) FROM base WHERE length > 0),
    'lengthMax',         (SELECT MAX(length) FROM base WHERE length > 0),
    'canadianAvailable', COALESCE((SELECT bool_or(canadian) FROM base), false),
    'markupNatural',     v_filter_row.markup_natural,
    'markupLab',         v_filter_row.markup_lab,
    'totalStones',       (SELECT COUNT(*) FROM base)
  ) INTO v_result;

  RETURN COALESCE(v_result, '{}'::jsonb);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_diamond_catalog_attributes(uuid) TO anon, authenticated, service_role;
