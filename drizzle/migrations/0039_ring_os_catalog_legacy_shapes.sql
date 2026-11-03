-- Ring OS diamond catalogue: keep the original eight shapes only.
--
-- The weekly diamond pool now carries shapes Ring OS does not support
-- (Asscher, Heart, Old Miner, European Cut, Rose Cut, Square …). They are for
-- the Quote Estimator V3 picker, which reads the pool through its own
-- configuration. Ring OS catalogues and widgets read pool stones through
-- client_diamond_catalog_filter.filter (get_diamond_presets_filtered,
-- sync_client_diamond_catalog_from_filter); a filter with no `shapes` list
-- meant "every shape", which would let the new shapes into Ring OS.
--
-- The catalogue UI now always saves an explicit shape list limited to the
-- eight Ring OS shapes (src/lib/ring-os-catalog-shapes.ts). This backfill
-- gives every existing filter the same guarantee: a missing / empty list
-- becomes the eight shapes, and lists that name other shapes are trimmed to
-- the Ring OS ones. Nothing else in the filter changes; no function changes.

WITH legacy AS (
  SELECT ARRAY['round','princess','oval','cushion','emerald','pear','marquise','radiant']::text[] AS ids
),
computed AS (
  SELECT
    f.client_id,
    COALESCE(
      (
        SELECT jsonb_agg(s ORDER BY ord)
        FROM jsonb_array_elements_text(
          CASE WHEN jsonb_typeof(f.filter -> 'shapes') = 'array' THEN f.filter -> 'shapes' ELSE '[]'::jsonb END
        ) WITH ORDINALITY AS t(s, ord), legacy
        WHERE LOWER(s) = ANY (legacy.ids)
      ),
      (SELECT to_jsonb(legacy.ids) FROM legacy)
    ) AS shapes
  FROM public.client_diamond_catalog_filter f
)
UPDATE public.client_diamond_catalog_filter f
   SET filter = COALESCE(f.filter, '{}'::jsonb) || jsonb_build_object('shapes', c.shapes),
       updated_at = now()
  FROM computed c
 WHERE c.client_id = f.client_id
   AND (f.filter -> 'shapes') IS DISTINCT FROM c.shapes;
