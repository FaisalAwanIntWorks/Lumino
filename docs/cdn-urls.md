# External CDN URLs in use (snapshot 2026-11-04)

These hosts belong to the original JewlX owner's AWS (CloudFront/S3), apart from public CDNs.
Nothing has been moved to our own Supabase storage yet. "Status" = one sample file tested on 2026-11-04.

## Image / asset CDNs (owner's AWS)

| Host | Folder(s) | Used for | Where in code | In database | Status |
|---|---|---|---|---|---|
| `d2lo9ju43icaaa.cloudfront.net` | `GrillzBuilder/` | Grillz builder + Custom Enquiry product images | `CustomEnquiryForm.tsx`, `GrillBuilderForm.tsx`, `grill-metal-images.ts` (+ others, 11 files) | — | 200 OK |
| `do2z856wqq7wu.cloudfront.net` | `Solitaire/…`, `ring-description/…`, `<folder_path>/…` | Ring OS / Ring Builder ring images, carat-size images, product detail | `useRingVariantImages.ts`, `useCaratSizeImages.ts`, `ProductViewer.tsx`, `ChatAssistant.tsx`, `ProductDetailDialog.tsx`, `LineItemProperties.tsx`, `StyleStep.tsx`, `ShankStep.tsx`, `cdn-utils.ts` (11 files) | — (paths built from DB `folder_path`) | 200 OK |
| `d2ybchbsrb165p.cloudfront.net` | `GenericDttFormImagesTransparent/` | Diamond shape icons, Quote Estimator (ring builder) images | `diamond-shape-icons.ts`, `diamond-form-cdn.ts`, `LineItemProperties.tsx` | — | 200 OK |
| `d3hry6a3ciae6y.cloudfront.net` | `DiamondsCatalog/`, `DiamondCatalogZaiwar/` | Diamond catalogue icons, legacy Quote Estimator option images | `ShapeIcon.tsx`, `diamond-form-cdn.ts`, `webp-image-fallback.ts` | `diamond_nature_options` (2), `diamond_shape_options` (24), `diamond_size_options` (9), `diamond_quality_options` (3), `ring_setting_options` (8), `diamond_holder_options` (8), `band_type_options` (8), `band_width_options` (4), `personalization_options` (8) — all `image_url` | sample 403 (path guessed; may be fine) |
| `d1cekhbdtlmikd.cloudfront.net` | `jewlx3updatedtransparentimages/` | Quote Estimator V3 stock + gemstone images | `quote-v3-assets.ts`, `quote-v3-gemstones.ts` | `diamond_shape_options.image_url` (some of the 24) | sample 403 (path guessed; may be fine) |
| `dttringbuildersimages.s3.us-east-1.amazonaws.com` | `DTTRingBuilder/` | Band width images (58/59/60.png) | `diamond-form-cdn.ts`, `webp-image-fallback.ts` | — | 200 OK |
| `diamondcatalogue.s3.us-east-1.amazonaws.com` | `DiamondCatalogZaiwar/ring_metal/` | Silver metal image | `diamond-form-cdn.ts` | — | 200 OK |

Edge functions also reference CloudFront: `_shared/ai-quota.ts`, `_shared/platform-health-checks.ts`, `generate-ring-preview`, `shopify-push-catalog`.

## Public third-party CDNs (not owner-specific)

| Host | Used for | Where |
|---|---|---|
| `flagcdn.com` | Country flags in phone input / Metal IQ | `country-phone-input.tsx`, `MetalBuyingForm.tsx` |
| `cdn.jsdelivr.net` | KTX2 texture decoder for 3D ring models | `SmartGLBModel.tsx` |
| `ijewel3d.com` | Test page embed only | `IJewel3DTest.tsx` |

## Our own storage
- `wcfxtsyhrpephimyrpbx.supabase.co/storage/v1/object/public/ring-assets/…` — `my_master_db_data` (576 rows, 6,336 files). Bucket is currently EMPTY.

---

## Update 2026-11-05: switched off the legacy CDNs
All 7 owner CDN/S3 hosts above are no longer referenced anywhere in code or the database.

- Code reads every base from `src/lib/asset-cdn.ts` (edge functions: `supabase/functions/_shared/asset-cdn.ts`).
- Default base = our public Supabase bucket `cdn-assets`, same folder hierarchy under one folder per old host:

| Old host | New default base | Override env (frontend `VITE_` / edge secret without it) |
|---|---|---|
| `d2lo9ju43icaaa.cloudfront.net` | `…/cdn-assets/main` | `VITE_ASSET_BASE_MAIN` / `ASSET_BASE_MAIN` |
| `do2z856wqq7wu.cloudfront.net` | `…/cdn-assets/rings` | `VITE_ASSET_BASE_RINGS` / `ASSET_BASE_RINGS` |
| `d2ybchbsrb165p.cloudfront.net` | `…/cdn-assets/ring-builder` | `VITE_ASSET_BASE_RING_BUILDER` / `ASSET_BASE_RING_BUILDER` |
| `d3hry6a3ciae6y.cloudfront.net` | `…/cdn-assets/diamond-catalog` | `VITE_ASSET_BASE_DIAMOND_CATALOG` / `ASSET_BASE_DIAMOND_CATALOG` |
| `d1cekhbdtlmikd.cloudfront.net` | `…/cdn-assets/quote-v3` | `VITE_ASSET_BASE_QUOTE_V3` / `ASSET_BASE_QUOTE_V3` |
| `dttringbuildersimages.s3…` | `…/cdn-assets/dtt-ring-builder-s3` | `VITE_ASSET_BASE_DTT_RING_BUILDER_S3` / `ASSET_BASE_DTT_RING_BUILDER_S3` |
| `diamondcatalogue.s3…` | `…/cdn-assets/diamond-catalogue-s3` | `VITE_ASSET_BASE_DIAMOND_CATALOGUE_S3` / `ASSET_BASE_DIAMOND_CATALOGUE_S3` |

(`…` = `https://wcfxtsyhrpephimyrpbx.supabase.co/storage/v1/object/public`)

- Database: the 74 option-table `image_url` rows now point at `…/cdn-assets/diamond-catalog/…` and `…/cdn-assets/quote-v3/…`
  (migration `20261105000000_switch_option_images_off_legacy_cdn.sql`). These are stored URLs, so they do NOT follow the env vars:
  when moving to your own CDN, run one more replace on those 9 tables (and on `my_master_db_data` for ring-assets).
- `flagcdn.com`, `cdn.jsdelivr.net` and `ijewel3d.com` are public third-party services and were left unchanged.
