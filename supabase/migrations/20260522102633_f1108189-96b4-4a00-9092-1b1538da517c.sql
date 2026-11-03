CREATE OR REPLACE FUNCTION public.count_diamond_presets_estimate(
  p_wizard_config jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_diamond_type jsonb := COALESCE(p_wizard_config -> 'diamondType', '{}'::jsonb);
  v_shapes_config jsonb := COALESCE(p_wizard_config -> 'shapes', '{}'::jsonb);
  v_grading jsonb := COALESCE(p_wizard_config -> 'grading', '{}'::jsonb);
  v_shapes text[];
  v_colors text[];
  v_clarities text[];
  v_lab_targets text[];
  v_stone_types text[] := ARRAY[]::text[];
  v_cut_labels text[];
  v_polish_labels text[];
  v_symmetry_labels text[];
  v_fluor_labels text[];
  v_cut_codes text[];
  v_polish_codes text[];
  v_symmetry_codes text[];
  v_fluor_codes text[];
  v_carat_min numeric := COALESCE(NULLIF(v_grading #>> '{caratRange,0}', '')::numeric, 0.50);
  v_carat_max numeric := COALESCE(NULLIF(v_grading #>> '{caratRange,1}', '')::numeric, 5.00);
  v_standard_carats numeric[] := ARRAY[0.50, 1.00, 1.50, 2.00, 2.50, 3.00, 3.50, 4.00, 4.50, 5.00];
  v_pool_count integer := 0;
  v_pool_groups integer := 0;
  v_standard_count integer := 0;
  v_fallback_count integer := 0;
  v_total integer := 0;
BEGIN
  v_shapes := COALESCE(ARRAY(SELECT jsonb_array_elements_text(v_shapes_config -> 'selectedShapes')), ARRAY[]::text[]);
  v_colors := COALESCE(ARRAY(SELECT upper(trim(jsonb_array_elements_text(v_grading -> 'colors')))), ARRAY[]::text[]);
  v_clarities := COALESCE(ARRAY(SELECT upper(trim(jsonb_array_elements_text(v_grading -> 'clarities')))), ARRAY[]::text[]);
  v_cut_labels := ARRAY(SELECT jsonb_array_elements_text(v_grading -> 'cutGrades'));
  v_polish_labels := ARRAY(SELECT jsonb_array_elements_text(v_grading -> 'polish'));
  v_symmetry_labels := ARRAY(SELECT jsonb_array_elements_text(v_grading -> 'symmetry'));
  v_fluor_labels := ARRAY(SELECT jsonb_array_elements_text(v_grading -> 'fluorescence'));
  v_lab_targets := COALESCE(ARRAY(SELECT upper(trim(jsonb_array_elements_text(v_grading -> 'labs')))), ARRAY[]::text[]);

  IF cardinality(v_cut_labels) = 0 THEN v_cut_labels := ARRAY['Excellent']::text[]; END IF;
  IF cardinality(v_polish_labels) = 0 THEN v_polish_labels := ARRAY['Excellent']::text[]; END IF;
  IF cardinality(v_symmetry_labels) = 0 THEN v_symmetry_labels := ARRAY['Excellent']::text[]; END IF;
  IF cardinality(v_fluor_labels) = 0 THEN v_fluor_labels := ARRAY['None']::text[]; END IF;

  v_cut_codes := ARRAY(SELECT DISTINCT CASE label WHEN 'Excellent' THEN 'EX' WHEN 'Very Good' THEN 'VG' WHEN 'Good' THEN 'G' WHEN 'Fair' THEN 'F' WHEN 'Poor' THEN 'P' ELSE upper(label) END FROM unnest(v_cut_labels) AS label);
  v_polish_codes := ARRAY(SELECT DISTINCT CASE label WHEN 'Excellent' THEN 'EX' WHEN 'Very Good' THEN 'VG' WHEN 'Good' THEN 'G' WHEN 'Fair' THEN 'F' WHEN 'Poor' THEN 'P' ELSE upper(label) END FROM unnest(v_polish_labels) AS label);
  v_symmetry_codes := ARRAY(SELECT DISTINCT CASE label WHEN 'Excellent' THEN 'EX' WHEN 'Very Good' THEN 'VG' WHEN 'Good' THEN 'G' WHEN 'Fair' THEN 'F' WHEN 'Poor' THEN 'P' ELSE upper(label) END FROM unnest(v_symmetry_labels) AS label);
  v_fluor_codes := ARRAY(SELECT DISTINCT code FROM unnest(v_fluor_labels) AS label CROSS JOIN LATERAL unnest(CASE label WHEN 'None' THEN ARRAY['NON','NONE'] WHEN 'Faint' THEN ARRAY['FNT'] WHEN 'Very Slight' THEN ARRAY['VSL'] WHEN 'Slight' THEN ARRAY['SL'] WHEN 'Medium' THEN ARRAY['MED'] WHEN 'Strong' THEN ARRAY['STG','STR'] WHEN 'Very Strong' THEN ARRAY['VST'] ELSE ARRAY[upper(label)] END) AS code);

  IF COALESCE((v_diamond_type ->> 'naturalEnabled')::boolean, false) THEN
    v_stone_types := array_append(v_stone_types, 'natural');
  END IF;
  IF COALESCE((v_diamond_type ->> 'labGrownEnabled')::boolean, false) THEN
    v_stone_types := array_append(v_stone_types, 'lab');
  END IF;

  IF cardinality(v_stone_types) = 0 OR cardinality(v_shapes) = 0 OR cardinality(v_colors) = 0 OR cardinality(v_clarities) = 0 THEN
    RETURN jsonb_build_object('total', 0, 'poolCount', 0, 'fallbackCount', 0);
  END IF;

  WITH filtered_pool AS (
    SELECT
      CASE WHEN lower(COALESCE(dip.lg, '')) = 'natural' THEN 'natural' ELSE 'lab' END AS stone_type,
      public._diamond_preset_shape_id(dip.shape) AS shape_id,
      upper(trim(dip.col)) AS color,
      upper(trim(dip.clar)) AS clarity
    FROM public.diamond_inventory_pool dip
    WHERE dip.carats >= v_carat_min
      AND dip.carats <= v_carat_max
      AND upper(trim(dip.col)) = ANY(v_colors)
      AND upper(trim(dip.clar)) = ANY(v_clarities)
      AND public._diamond_preset_shape_id(dip.shape) = ANY(v_shapes)
      AND (CASE WHEN lower(COALESCE(dip.lg, '')) = 'natural' THEN 'natural' ELSE 'lab' END) = ANY(v_stone_types)
      AND (
        public._diamond_preset_shape_id(dip.shape) <> 'round'
        OR cardinality(v_cut_codes) = 0
        OR dip.cut = ANY(v_cut_codes)
        OR dip.cut = '-'
      )
      AND (cardinality(v_polish_codes) = 0 OR dip.pol = ANY(v_polish_codes))
      AND (cardinality(v_symmetry_codes) = 0 OR dip.symm = ANY(v_symmetry_codes))
      AND (cardinality(v_fluor_codes) = 0 OR dip.flo = ANY(v_fluor_codes))
      AND (cardinality(v_lab_targets) = 0 OR upper(trim(dip.lab)) = ANY(v_lab_targets))
      AND COALESCE(dip.price, 0) > 0
  )
  SELECT count(*), count(DISTINCT (stone_type, shape_id, color, clarity))
  INTO v_pool_count, v_pool_groups
  FROM filtered_pool;

  SELECT count(*) INTO v_standard_count
  FROM unnest(v_standard_carats) c(carat)
  WHERE c.carat >= v_carat_min AND c.carat <= v_carat_max;

  v_fallback_count := GREATEST(
    (cardinality(v_stone_types) * cardinality(v_shapes) * cardinality(v_colors) * cardinality(v_clarities) - v_pool_groups) * v_standard_count,
    0
  );

  v_total := v_pool_count + v_fallback_count;

  RETURN jsonb_build_object(
    'total', v_total,
    'poolCount', v_pool_count,
    'fallbackCount', v_fallback_count
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.count_diamond_presets_estimate(jsonb) TO authenticated;