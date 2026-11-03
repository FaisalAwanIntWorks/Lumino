-- Quote Estimator: eight more diamond shapes (Asscher, European Cut, Heart,
-- Old Miner, Princess, Rose Cut, Square Emerald, Square Radiant).
--
-- Shapes live in the shared diamond_shape_options table, which every version
-- and client reads (V3 through get_sandbox_quote_v3_options, V1/V2 and the
-- Ring Builder through get_client_diamond_form_options). Pictures are the
-- transparent WebP set on the V3 stock CDN. Existing rows are never touched.
--
-- On the Sandbox V3 form only, Colored Diamond and Gemstone are moved after
-- the new cuts so the two special cards stay last in the grid; other clients
-- keep their current order (new shapes append at the end).

INSERT INTO public.diamond_shape_options (name, option_value, price, image_url, display_order) VALUES
  ('Asscher',        'asscher',        0, 'https://d1cekhbdtlmikd.cloudfront.net/jewlx3updatedtransparentimages/diamond_shape/Asscher.webp',        17),
  ('European Cut',   'european-cut',   0, 'https://d1cekhbdtlmikd.cloudfront.net/jewlx3updatedtransparentimages/diamond_shape/European-Cut.webp',   18),
  ('Heart',          'heart',          0, 'https://d1cekhbdtlmikd.cloudfront.net/jewlx3updatedtransparentimages/diamond_shape/Heart.webp',          19),
  ('Old Miner',      'old-miner',      0, 'https://d1cekhbdtlmikd.cloudfront.net/jewlx3updatedtransparentimages/diamond_shape/Old-Miner.webp',      20),
  ('Princess',       'princess',       0, 'https://d1cekhbdtlmikd.cloudfront.net/jewlx3updatedtransparentimages/diamond_shape/Princess.webp',       21),
  ('Rose Cut',       'rose-cut',       0, 'https://d1cekhbdtlmikd.cloudfront.net/jewlx3updatedtransparentimages/diamond_shape/Rose-Cut.webp',       22),
  ('Square Emerald', 'square-emerald', 0, 'https://d1cekhbdtlmikd.cloudfront.net/jewlx3updatedtransparentimages/diamond_shape/Square-Emerald.webp', 23),
  ('Square Radiant', 'square-radiant', 0, 'https://d1cekhbdtlmikd.cloudfront.net/jewlx3updatedtransparentimages/diamond_shape/Square-Radiant.webp', 24)
ON CONFLICT (option_value) DO NOTHING;

-- Sandbox V3 only: keep Colored Diamond and Gemstone as the last two cards.
INSERT INTO public.sandbox_quote_v3_overrides (client_id, step_type, option_id, display_order)
SELECT 'dcd952fc-783b-4a92-be7f-62751265c650'::uuid, 'shape', o.id,
       CASE o.option_value WHEN 'colored-diamond' THEN 25 ELSE 26 END
FROM public.diamond_shape_options o
WHERE o.option_value IN ('colored-diamond', 'ruby-sapphire-emerald')
ON CONFLICT (client_id, step_type, option_id) DO UPDATE SET display_order = EXCLUDED.display_order;