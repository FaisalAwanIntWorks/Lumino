// Mirror of src/lib/asset-cdn.ts for edge functions — keep both in sync.
// Override any base with an edge secret ASSET_BASE_* (no trailing slash).
const STORAGE_BASE = `${(Deno.env.get("SUPABASE_URL") || "").replace(/\/+$/, "")}/storage/v1/object/public/cdn-assets`;

const pick = (name: string, key: string): string =>
  ((Deno.env.get(name) || "").trim() || `${STORAGE_BASE}/${key}`).replace(/\/+$/, "");

export const ASSET_CDN = {
  main: pick("ASSET_BASE_MAIN", "main"),
  rings: pick("ASSET_BASE_RINGS", "rings"),
  ringBuilder: pick("ASSET_BASE_RING_BUILDER", "ring-builder"),
  diamondCatalog: pick("ASSET_BASE_DIAMOND_CATALOG", "diamond-catalog"),
  quoteV3: pick("ASSET_BASE_QUOTE_V3", "quote-v3"),
  dttRingBuilderS3: pick("ASSET_BASE_DTT_RING_BUILDER_S3", "dtt-ring-builder-s3"),
  diamondCatalogueS3: pick("ASSET_BASE_DIAMOND_CATALOGUE_S3", "diamond-catalogue-s3"),
} as const;
