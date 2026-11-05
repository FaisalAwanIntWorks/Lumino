/**
 * Single source of truth for every static image/asset host used by the app.
 * Mirrored in supabase/functions/_shared/asset-cdn.ts — keep both in sync.
 *
 * Each key replaces one of the original owner's CloudFront/S3 hosts and keeps
 * that host's folder hierarchy underneath it. Default: our own Supabase storage
 * bucket `cdn-assets/<key>/…`. To serve from your own CDN later, set the matching
 * VITE_ASSET_BASE_* env var (no trailing slash) and rebuild, e.g.
 *   VITE_ASSET_BASE_MAIN="https://dxxxx.cloudfront.net"
 *
 * Replaced hosts:
 *   main             <- d2lo9ju43icaaa.cloudfront.net   (GrillzBuilder, JewlxRingsSketches, DTTRingBuilder, logo)
 *   rings            <- do2z856wqq7wu.cloudfront.net    (ring variant / carat-size / ring-description images)
 *   ringBuilder      <- d2ybchbsrb165p.cloudfront.net   (GenericDttFormImagesTransparent)
 *   diamondCatalog   <- d3hry6a3ciae6y.cloudfront.net   (DiamondsCatalog, DiamondCatalogZaiwar)
 *   quoteV3          <- d1cekhbdtlmikd.cloudfront.net   (jewlx3updatedtransparentimages)
 *   dttRingBuilderS3 <- dttringbuildersimages.s3.us-east-1.amazonaws.com
 *   diamondCatalogueS3 <- diamondcatalogue.s3.us-east-1.amazonaws.com
 */
const env = import.meta.env;

const STORAGE_BASE = `${String(env.VITE_SUPABASE_URL || '').replace(/\/+$/, '')}/storage/v1/object/public/cdn-assets`;

const pick = (override: unknown, key: string): string =>
  (typeof override === 'string' && override.trim() ? override.trim() : `${STORAGE_BASE}/${key}`).replace(/\/+$/, '');

export const ASSET_CDN = {
  main: pick(env.VITE_ASSET_BASE_MAIN, 'main'),
  rings: pick(env.VITE_ASSET_BASE_RINGS, 'rings'),
  ringBuilder: pick(env.VITE_ASSET_BASE_RING_BUILDER, 'ring-builder'),
  diamondCatalog: pick(env.VITE_ASSET_BASE_DIAMOND_CATALOG, 'diamond-catalog'),
  quoteV3: pick(env.VITE_ASSET_BASE_QUOTE_V3, 'quote-v3'),
  dttRingBuilderS3: pick(env.VITE_ASSET_BASE_DTT_RING_BUILDER_S3, 'dtt-ring-builder-s3'),
  diamondCatalogueS3: pick(env.VITE_ASSET_BASE_DIAMOND_CATALOGUE_S3, 'diamond-catalogue-s3'),
} as const;
