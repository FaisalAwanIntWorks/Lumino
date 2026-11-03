-- Swap the Split Shank / Band Engraving artwork on the Quote Estimator (DTT form)
-- "type of band" step. The CDN files are named the other way round, so point
-- each option at the file that actually shows its ring. DTT resolves these to
-- the .webp twin in the frontend (toWebpDiamondCdn).

UPDATE public.band_type_options
SET image_url = 'https://d3hry6a3ciae6y.cloudfront.net/DiamondsCatalog/type_of_band/Band+Engraving+(%2B%241500).png'
WHERE option_value = 'split-shank';

UPDATE public.band_type_options
SET image_url = 'https://d3hry6a3ciae6y.cloudfront.net/DiamondsCatalog/type_of_band/Split+Shank+(%2B%24100).png'
WHERE option_value = 'band-engraving';

-- If DTT has a per-client image override on either option that still points at
-- the old legacy file, drop it so the swapped base image takes effect.
UPDATE public.client_diamond_step_overrides ov
SET custom_image_url = NULL
FROM public.band_type_options o
WHERE ov.option_id = o.id
  AND ov.step_type = 'band'
  AND ov.client_id = 'aeec6491-bd1f-4787-97f9-6a47a2ddc8af'
  AND o.option_value IN ('split-shank', 'band-engraving')
  AND ov.custom_image_url ~ '^https://d3hry6a3ciae6y\.cloudfront\.net/DiamondsCatalog/type_of_band/(Split\+Shank\+\(%2B%24100\)|Band\+Engraving\+\(%2B%241500\))\.(png|webp)$';
