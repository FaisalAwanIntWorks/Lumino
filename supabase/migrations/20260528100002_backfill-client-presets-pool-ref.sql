-- One-time backfill: match existing pool-derived client_diamond_presets rows
-- to their source diamond_inventory_pool row and fill source_pool_id + report_no.
--
-- Matching key: stone_type + shape_id + color + clarity + carat_value + base_price (rounded).
-- When multiple pool rows share the same specs/price (rare), we pick the one whose
-- price is closest to base_price to maximise accuracy.
-- Only rows with pool_stock_count = 1 are backfilled (fallback rows stay NULL).

UPDATE public.client_diamond_presets cdp
SET
  source_pool_id = match.pool_id,
  report_no      = match.report_no
FROM (
  SELECT DISTINCT ON (cdp2.id)
    cdp2.id AS preset_id,
    dip.id  AS pool_id,
    dip.report_no
  FROM public.client_diamond_presets cdp2
  JOIN public.diamond_inventory_pool dip
    ON round(dip.carats::numeric, 2) = cdp2.carat_value
    AND UPPER(TRIM(dip.col))  = cdp2.color
    AND UPPER(TRIM(dip.clar)) = cdp2.clarity
    AND public._diamond_preset_shape_id(dip.shape) = cdp2.shape_id
    AND (CASE WHEN lower(COALESCE(dip.lg, '')) = 'natural' THEN 'natural' ELSE 'lab' END) = cdp2.stone_type
    AND ABS(COALESCE(dip.price, 0) - cdp2.base_price::numeric) < 1.0
    AND dip.report_no IS NOT NULL
  WHERE cdp2.source_pool_id IS NULL
    AND cdp2.pool_stock_count = 1
  ORDER BY cdp2.id, ABS(COALESCE(dip.price, 0) - cdp2.base_price::numeric)
) match
WHERE cdp.id = match.preset_id;
