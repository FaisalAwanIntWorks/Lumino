-- Follow-up to 20260909120000: the Split Shank / Band Engraving swap lives on
-- the shared band_type_options rows, which every Quote Estimator client
-- (DTT, Zaiwar, transparent-CDN clients) resolves from. Any per-client image
-- override still pinned to one of the stock files on any of the three CDN
-- sets would shadow the swap, so clear those for ALL clients. Genuine
-- client-uploaded custom images are left untouched.

UPDATE public.client_diamond_step_overrides ov
SET custom_image_url = NULL
FROM public.band_type_options o
WHERE ov.option_id = o.id
  AND ov.step_type = 'band'
  AND o.option_value IN ('split-shank', 'band-engraving')
  AND ov.custom_image_url ~ '^https://(d3hry6a3ciae6y\.cloudfront\.net/(DiamondsCatalog|DiamondCatalogZaiwar)|d2ybchbsrb165p\.cloudfront\.net/GenericDttFormImagesTransparent)/type_of_band/(Split\+Shank\+\(%2B%24100\)|Band\+Engraving\+\(%2B%241500\))\.(png|webp)$';
