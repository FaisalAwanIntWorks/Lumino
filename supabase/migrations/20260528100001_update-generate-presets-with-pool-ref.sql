-- Update generate_client_diamond_presets_db to persist source_pool_id and
-- report_no on every pool-derived preset row inserted into client_diamond_presets.
-- Fallback (non-pool) rows continue to get NULL for both columns.

CREATE OR REPLACE FUNCTION public.generate_client_diamond_presets_db(
  p_client_id uuid,
  p_wizard_config jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '600s'
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_diamond_type jsonb := COALESCE(p_wizard_config -> 'diamondType', '{}'::jsonb);
  v_shapes_config jsonb := COALESCE(p_wizard_config -> 'shapes', '{}'::jsonb);
  v_grading jsonb := COALESCE(p_wizard_config -> 'grading', '{}'::jsonb);
  v_pricing jsonb := COALESCE(p_wizard_config -> 'pricing', '{}'::jsonb);
  v_product jsonb := COALESCE(p_wizard_config -> 'productSettings', '{}'::jsonb);
  v_shapes text[];
  v_colors text[];
  v_clarities text[];
  v_cut_labels text[];
  v_polish_labels text[];
  v_symmetry_labels text[];
  v_fluor_labels text[];
  v_lab_targets text[];
  v_certifications text[];
  v_stone_types text[] := ARRAY[]::text[];
  v_cut_codes text[];
  v_polish_codes text[];
  v_symmetry_codes text[];
  v_fluor_codes text[];
  v_carat_min numeric := COALESCE(NULLIF(v_grading #>> '{caratRange,0}', '')::numeric, 0.50);
  v_carat_max numeric := COALESCE(NULLIF(v_grading #>> '{caratRange,1}', '')::numeric, 5.00);
  v_currency text := COALESCE(NULLIF(v_pricing ->> 'currency', ''), 'USD');
  v_pricing_method text := COALESCE(NULLIF(v_pricing ->> 'pricingMethod', ''), 'percentage');
  v_title_template text := COALESCE(NULLIF(v_product ->> 'titleTemplate', ''), '{carat}ct {shape} Diamond - {clarity}');
  v_sku_template text := COALESCE(NULLIF(v_product ->> 'skuTemplate', ''), 'DIA-{shape}-{clarity}-{carat}');
  v_standard_carats numeric[] := ARRAY[0.50, 1.00, 1.50, 2.00, 2.50, 3.00, 3.50, 4.00, 4.50, 5.00];
  v_pool_count integer := 0;
  v_fallback_count integer := 0;
  v_total_count integer := 0;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  IF NOT (
    public.has_role(v_actor, 'agency_admin'::app_role)
    OR EXISTS (SELECT 1 FROM public.clients c WHERE c.id = p_client_id AND c.user_id = v_actor)
    OR EXISTS (
      SELECT 1 FROM public.staff_members sm
      WHERE sm.user_id = v_actor
        AND sm.client_id = p_client_id
        AND sm.status = 'active'
        AND (sm.permissions ->> 'catalog_access' = 'edit' OR sm.permissions ->> 'catalog_access' = 'true')
    )
  ) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  v_shapes := COALESCE(ARRAY(SELECT jsonb_array_elements_text(v_shapes_config -> 'selectedShapes')), ARRAY[]::text[]);
  v_colors := COALESCE(ARRAY(SELECT upper(trim(jsonb_array_elements_text(v_grading -> 'colors')))), ARRAY[]::text[]);
  v_clarities := COALESCE(ARRAY(SELECT upper(trim(jsonb_array_elements_text(v_grading -> 'clarities')))), ARRAY[]::text[]);
  v_cut_labels := ARRAY(SELECT jsonb_array_elements_text(v_grading -> 'cutGrades'));
  v_polish_labels := ARRAY(SELECT jsonb_array_elements_text(v_grading -> 'polish'));
  v_symmetry_labels := ARRAY(SELECT jsonb_array_elements_text(v_grading -> 'symmetry'));
  v_fluor_labels := ARRAY(SELECT jsonb_array_elements_text(v_grading -> 'fluorescence'));
  v_lab_targets := COALESCE(ARRAY(SELECT upper(trim(jsonb_array_elements_text(v_grading -> 'labs')))), ARRAY[]::text[]);
  v_certifications := ARRAY(SELECT jsonb_array_elements_text(v_diamond_type -> 'certifications'));

  IF cardinality(v_cut_labels) = 0 THEN v_cut_labels := ARRAY['Excellent']::text[]; END IF;
  IF cardinality(v_polish_labels) = 0 THEN v_polish_labels := ARRAY['Excellent']::text[]; END IF;
  IF cardinality(v_symmetry_labels) = 0 THEN v_symmetry_labels := ARRAY['Excellent']::text[]; END IF;
  IF cardinality(v_fluor_labels) = 0 THEN v_fluor_labels := ARRAY['None']::text[]; END IF;
  IF cardinality(v_certifications) = 0 THEN v_certifications := ARRAY['GIA']::text[]; END IF;

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

  DELETE FROM public.client_diamond_presets WHERE client_id = p_client_id;

  IF cardinality(v_stone_types) = 0 OR cardinality(v_shapes) = 0 OR cardinality(v_colors) = 0 OR cardinality(v_clarities) = 0 THEN
    RETURN jsonb_build_object('success', true, 'presetsCount', 0, 'source', 'database');
  END IF;

  -- Pool-derived rows: each pool diamond gets its own preset row and we carry
  -- its UUID (source_pool_id) and certificate number (report_no) through so
  -- checkout can do an exact 1-to-1 lookup without any fuzzy matching.
  WITH filtered_pool AS (
    SELECT
      CASE WHEN lower(COALESCE(dip.lg, '')) = 'natural' THEN 'natural' ELSE 'lab' END AS stone_type,
      public._diamond_preset_shape_id(dip.shape) AS shape_id,
      round(dip.carats::numeric, 2) AS carat,
      upper(trim(dip.col)) AS color,
      upper(trim(dip.clar)) AS clarity,
      COALESCE(dip.price, 0)::numeric AS base_price,
      dip.id   AS pool_id,     -- NEW: physical diamond UUID
      dip.report_no             -- NEW: certificate number
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
      AND (
        v_grading ->> 'measurementsMinLength' IS NULL
        OR dip.length >= NULLIF(v_grading ->> 'measurementsMinLength', '')::numeric
      )
      AND (
        v_grading ->> 'measurementsMaxLength' IS NULL
        OR dip.length <= NULLIF(v_grading ->> 'measurementsMaxLength', '')::numeric
      )
      AND COALESCE(dip.price, 0) > 0
  ), priced AS (
    SELECT
      fp.*,
      public._diamond_preset_tier_value(fp.carat, CASE WHEN fp.stone_type = 'natural' THEN v_pricing -> 'naturalMarkupTiers' ELSE v_pricing -> 'labMarkupTiers' END, 'markup') AS markup_value
    FROM filtered_pool fp
  ), final_rows AS (
    SELECT
      p.*,
      CASE
        WHEN v_pricing_method = 'percentage' THEN p.base_price * (1 + p.markup_value / 100)
        WHEN v_pricing_method = 'fixed_margin' THEN p.base_price + (p.markup_value * p.carat)
        ELSE p.base_price
      END AS final_price
    FROM priced p
  )
  INSERT INTO public.client_diamond_presets (
    client_id, stone_type, shape_id, carat_range, carat_value, color, clarity,
    base_price, custom_price, is_enabled, cut_grade, polish, symmetry, fluorescence,
    certification, origin, sku, product_title, currency, markup_percentage,
    compare_at_price, pool_stock_count,
    source_pool_id, report_no
  )
  SELECT
    p_client_id,
    fr.stone_type,
    fr.shape_id,
    public._diamond_preset_carat_range(fr.carat),
    fr.carat,
    fr.color,
    fr.clarity,
    round(fr.base_price),
    round(fr.final_price),
    true,
    CASE WHEN fr.shape_id = 'round' AND cardinality(v_cut_labels) > 0 THEN array_to_string(v_cut_labels, ', ') ELSE NULL END,
    CASE WHEN cardinality(v_polish_labels) > 0 THEN array_to_string(v_polish_labels, ', ') ELSE NULL END,
    CASE WHEN cardinality(v_symmetry_labels) > 0 THEN array_to_string(v_symmetry_labels, ', ') ELSE NULL END,
    CASE WHEN cardinality(v_fluor_labels) > 0 THEN array_to_string(v_fluor_labels, ', ') ELSE NULL END,
    COALESCE(v_certifications[1], 'GIA'),
    fr.stone_type,
    upper(regexp_replace(
      replace(replace(replace(replace(replace(replace(replace(replace(
        v_sku_template,
        '{carat}', to_char(fr.carat, 'FM999990.00')),
        '{shape}', public._diamond_preset_shape_name(fr.shape_id)),
        '{color}', fr.color),
        '{clarity}', fr.clarity),
        '{cut}', CASE WHEN fr.shape_id = 'round' THEN COALESCE(v_cut_labels[1], '') ELSE '' END),
        '{origin}', CASE WHEN fr.stone_type = 'natural' THEN 'Natural' ELSE 'Lab-Grown' END),
        '{lab}', COALESCE(v_certifications[1], 'GIA')),
        '{report_number}', ''),
      '\s+', '-', 'g'
    )),
    replace(replace(replace(replace(replace(replace(replace(replace(
      v_title_template,
      '{carat}', to_char(fr.carat, 'FM999990.00')),
      '{shape}', public._diamond_preset_shape_name(fr.shape_id)),
      '{color}', fr.color),
      '{clarity}', fr.clarity),
      '{cut}', CASE WHEN fr.shape_id = 'round' THEN COALESCE(v_cut_labels[1], '') ELSE '' END),
      '{origin}', CASE WHEN fr.stone_type = 'natural' THEN 'Natural' ELSE 'Lab-Grown' END),
      '{lab}', COALESCE(v_certifications[1], 'GIA')),
      '{report_number}', ''),
    v_currency,
    CASE
      WHEN v_pricing_method = 'percentage' AND fr.markup_value > 0 THEN fr.markup_value
      WHEN v_pricing_method = 'fixed_margin' AND fr.base_price > 0 THEN ((fr.final_price - fr.base_price) / fr.base_price) * 100
      ELSE NULL
    END,
    NULL,
    1,
    fr.pool_id,    -- NEW
    fr.report_no   -- NEW
  FROM final_rows fr;

  GET DIAGNOSTICS v_pool_count = ROW_COUNT;

  WITH selected_groups AS (
    SELECT stone_type, shape_id, color, clarity
    FROM unnest(v_stone_types) stone_type
    CROSS JOIN unnest(v_shapes) shape_id
    CROSS JOIN unnest(v_colors) color
    CROSS JOIN unnest(v_clarities) clarity
  ), pool_groups AS (
    SELECT DISTINCT stone_type, shape_id, color, clarity
    FROM public.client_diamond_presets
    WHERE client_id = p_client_id
      AND pool_stock_count = 1
  ), fallback_source AS (
    SELECT sg.stone_type, sg.shape_id, sg.color, sg.clarity, c.carat
    FROM selected_groups sg
    CROSS JOIN unnest(v_standard_carats) c(carat)
    WHERE c.carat >= v_carat_min
      AND c.carat <= v_carat_max
      AND NOT EXISTS (
        SELECT 1 FROM pool_groups pg
        WHERE pg.stone_type = sg.stone_type
          AND pg.shape_id = sg.shape_id
          AND pg.color = sg.color
          AND pg.clarity = sg.clarity
      )
  ), priced AS (
    SELECT
      fs.*,
      public._diamond_preset_tier_value(fs.carat, CASE WHEN fs.stone_type = 'natural' THEN v_pricing -> 'naturalMarkupTiers' ELSE v_pricing -> 'labMarkupTiers' END, 'markup') AS markup_value,
      public._diamond_preset_tier_value(fs.carat, CASE WHEN fs.stone_type = 'natural' THEN v_pricing -> 'naturalMarkupTiers' ELSE v_pricing -> 'labMarkupTiers' END, 'purchasingPrice')
      * COALESCE((CASE WHEN fs.stone_type = 'natural' THEN v_pricing -> 'clarityMultipliersNatural' ELSE v_pricing -> 'clarityMultipliersLab' END ->> fs.clarity)::numeric,
        CASE WHEN fs.stone_type = 'natural' THEN
          CASE fs.clarity WHEN 'FL' THEN 1.95 WHEN 'IF' THEN 1.75 WHEN 'VVS1' THEN 1.45 WHEN 'VVS2' THEN 1.32 WHEN 'VS1' THEN 1.15 WHEN 'VS2' THEN 1.00 WHEN 'SI1' THEN 0.82 WHEN 'SI2' THEN 0.65 WHEN 'I1' THEN 0.45 WHEN 'I2' THEN 0.30 WHEN 'I3' THEN 0.20 ELSE 1.00 END
        ELSE
          CASE fs.clarity WHEN 'FL' THEN 1.95 WHEN 'IF' THEN 1.75 WHEN 'VVS1' THEN 1.15 WHEN 'VVS2' THEN 1.08 WHEN 'VS1' THEN 1.04 WHEN 'VS2' THEN 1.00 WHEN 'SI1' THEN 0.88 WHEN 'SI2' THEN 0.78 WHEN 'I1' THEN 0.60 WHEN 'I2' THEN 0.45 WHEN 'I3' THEN 0.30 ELSE 1.00 END
        END)
      * COALESCE((CASE WHEN fs.stone_type = 'natural' THEN v_pricing -> 'colorMultipliersNatural' ELSE v_pricing -> 'colorMultipliersLab' END ->> fs.color)::numeric,
        CASE WHEN fs.stone_type = 'natural' THEN
          CASE fs.color WHEN 'D' THEN 1.35 WHEN '$q$ THEN 1.24 WHEN $q$F' THEN 1.14 WHEN 'G' THEN 1.00 WHEN 'H' THEN 0.90 WHEN 'I' THEN 0.78 WHEN 'J' THEN 0.66 WHEN 'K' THEN 0.55 WHEN 'L' THEN 0.48 WHEN 'M' THEN 0.42 ELSE 1.00 END
        ELSE
          CASE fs.color WHEN 'D' THEN 1.15 WHEN '$q$ THEN 1.10 WHEN $q$F' THEN 1.05 WHEN 'G' THEN 1.00 WHEN 'H' THEN 0.94 WHEN 'I' THEN 0.85 WHEN 'J' THEN 0.75 WHEN 'K' THEN 0.65 WHEN 'L' THEN 0.58 WHEN 'M' THEN 0.52 ELSE 1.00 END
        END)
      * COALESCE((v_pricing -> 'shapeDiscounts' ->> fs.shape_id)::numeric,
          CASE fs.shape_id WHEN 'round' THEN 1.00 WHEN 'oval' THEN 0.83 WHEN 'pear' THEN 0.78 WHEN 'cushion' THEN 0.75 WHEN 'princess' THEN 0.70 WHEN 'radiant' THEN 0.70 WHEN 'marquise' THEN 0.70 WHEN 'emerald' THEN 0.68 WHEN 'asscher' THEN 0.62 WHEN 'heart' THEN 0.75 ELSE 1.00 END
        ) AS base_price
    FROM fallback_source fs
  ), final_rows AS (
    SELECT
      p.*,
      CASE
        WHEN v_pricing_method = 'percentage' THEN p.base_price * (1 + p.markup_value / 100)
        WHEN v_pricing_method = 'fixed_margin' THEN p.base_price + (p.markup_value * p.carat)
        ELSE p.base_price
      END AS final_price
    FROM priced p
  )
  INSERT INTO public.client_diamond_presets (
    client_id, stone_type, shape_id, carat_range, carat_value, color, clarity,
    base_price, custom_price, is_enabled, cut_grade, polish, symmetry, fluorescence,
    certification, origin, sku, product_title, currency, markup_percentage,
    compare_at_price, pool_stock_count,
    source_pool_id, report_no
  )
  SELECT
    p_client_id,
    fr.stone_type,
    fr.shape_id,
    public._diamond_preset_carat_range(fr.carat),
    fr.carat,
    fr.color,
    fr.clarity,
    round(fr.base_price),
    round(fr.final_price),
    true,
    CASE WHEN fr.shape_id = 'round' AND cardinality(v_cut_labels) > 0 THEN array_to_string(v_cut_labels, ', ') ELSE NULL END,
    CASE WHEN cardinality(v_polish_labels) > 0 THEN array_to_string(v_polish_labels, ', ') ELSE NULL END,
    CASE WHEN cardinality(v_symmetry_labels) > 0 THEN array_to_string(v_symmetry_labels, ', ') ELSE NULL END,
    CASE WHEN cardinality(v_fluor_labels) > 0 THEN array_to_string(v_fluor_labels, ', ') ELSE NULL END,
    COALESCE(v_certifications[1], 'GIA'),
    fr.stone_type,
    upper(regexp_replace(
      replace(replace(replace(replace(replace(replace(replace(replace(
        v_sku_template,
        '{carat}', to_char(fr.carat, 'FM999990.00')),
        '{shape}', public._diamond_preset_shape_name(fr.shape_id)),
        '{color}', fr.color),
        '{clarity}', fr.clarity),
        '{cut}', CASE WHEN fr.shape_id = 'round' THEN COALESCE(v_cut_labels[1], '') ELSE '' END),
        '{origin}', CASE WHEN fr.stone_type = 'natural' THEN 'Natural' ELSE 'Lab-Grown' END),
        '{lab}', COALESCE(v_certifications[1], 'GIA')),
        '{report_number}', ''),
      '\s+', '-', 'g'
    )),
    replace(replace(replace(replace(replace(replace(replace(replace(
      v_title_template,
      '{carat}', to_char(fr.carat, 'FM999990.00')),
      '{shape}', public._diamond_preset_shape_name(fr.shape_id)),
      '{color}', fr.color),
      '{clarity}', fr.clarity),
      '{cut}', CASE WHEN fr.shape_id = 'round' THEN COALESCE(v_cut_labels[1], '') ELSE '' END),
      '{origin}', CASE WHEN fr.stone_type = 'natural' THEN 'Natural' ELSE 'Lab-Grown' END),
      '{lab}', COALESCE(v_certifications[1], 'GIA')),
      '{report_number}', ''),
    v_currency,
    CASE
      WHEN v_pricing_method = 'percentage' AND fr.markup_value > 0 THEN fr.markup_value
      WHEN v_pricing_method = 'fixed_margin' AND fr.base_price > 0 THEN ((fr.final_price - fr.base_price) / fr.base_price) * 100
      ELSE NULL
    END,
    NULL,
    0,
    NULL::uuid,  -- fallback rows have no pool identity
    NULL::text
  FROM final_rows fr;

  GET DIAGNOSTICS v_fallback_count = ROW_COUNT;
  v_total_count := v_pool_count + v_fallback_count;

  INSERT INTO public.client_activity_logs (
    client_id,
    user_id,
    action_type,
    action_category,
    description,
    metadata
  ) VALUES (
    p_client_id,
    v_actor,
    'diamond_presets_generated',
    'catalog',
    'Generated ' || v_total_count || ' diamond presets from database generation',
    jsonb_build_object(
      'stone_types', v_stone_types,
      'shapes_count', cardinality(v_shapes),
      'presets_count', v_total_count,
      'pool_count', v_pool_count,
      'fallback_count', v_fallback_count,
      'pricing_method', v_pricing_method,
      'currency', v_currency
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'presetsCount', v_total_count,
    'poolCount', v_pool_count,
    'fallbackCount', v_fallback_count,
    'source', 'database'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.generate_client_diamond_presets_db(uuid, jsonb) TO authenticated;
