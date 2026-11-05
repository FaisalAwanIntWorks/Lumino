import { ASSET_CDN } from "@/lib/asset-cdn";
/**
 * CloudFront CDN utility for ring assets.
 * All ring images are served from this CDN for optimal global delivery.
 */

export const CLOUDFRONT_CDN_BASE = `${ASSET_CDN.rings}`;

/**
 * Ring styles whose angle renders are also published on the CDN as `.webp` at
 * the SAME path as the `.png` (see `alljewlximagesurls/ring-os-<style>-image-urls-webp.md`).
 * Renders of these styles are requested WebP-first everywhere (Ring OS widget,
 * admin product pages, catalog editor, saved designs, Shopify push); every
 * `<img>` that shows one falls back to the `.png` original via
 * `fallbackToPngOnError` if the WebP cannot load.
 * Folder names are compared lower-cased (the CDN folder is `Solitaire/`).
 */
export const WEBP_RENDER_STYLE_FOLDERS = new Set<string>(['halo', 'solitaire', 'pave-rail', 'three-stone']);

/**
 * Same idea for the TRANSPARENT (black background) render set — the
 * `transparent_N_filename` files served to the transparent-image client (24K
 * Carat Jewelers) in the Ring OS widget. Listed separately because the WebP
 * twins for this set are uploaded style by style
 * (see `alljewlximagesurls/ring-os-<style>-transparent-image-urls-webp.md`).
 */
export const WEBP_TRANSPARENT_RENDER_STYLE_FOLDERS = new Set<string>(['halo', 'solitaire', 'pave-rail', 'three-stone']);

/**
 * Swap a CDN render URL to its `.webp` twin when its style folder is in the
 * given WebP-enabled set (defaults to the stock render set).
 */
export const toWebpRenderUrl = <T extends string | null | undefined>(
  url: T,
  enabledStyles: ReadonlySet<string> = WEBP_RENDER_STYLE_FOLDERS
): T => {
  if (!url || !url.startsWith(`${CLOUDFRONT_CDN_BASE}/`)) return url;
  const styleFolder = url.slice(CLOUDFRONT_CDN_BASE.length + 1).split('/')[0]?.toLowerCase();
  if (!styleFolder || !enabledStyles.has(styleFolder)) return url;
  return url.replace(/\.png(?=$|[?#])/i, '.webp') as T;
};

/**
 * Constructs a CDN URL from folder_path and filename.
 * The folder_path from DB looks like "rings/solitaire/high-polish/yellow/round"
 * We strip the "rings/" prefix for the CDN path.
 * 
 * @param folderPath - The folder path from my_master_db_data (e.g., "rings/solitaire/high-polish/yellow/round")
 * @param filename - The image filename (e.g., "image-0.png")
 * @returns Full CDN URL (WebP for WebP-enabled styles) or null if inputs are missing
 */
export const constructCdnImageUrl = (
  folderPath: string | null | undefined,
  filename: string | null | undefined
): string | null => {
  if (!filename || !folderPath) return null;

  // Remove "rings/" prefix from folder path if present (CDN uses shorter paths)
  let cdnPath = folderPath.replace(/^rings\//, '');
  // Capitalize "solitaire" to match CDN bucket structure
  cdnPath = cdnPath.replace(/^solitaire\//, 'Solitaire/');

  return toWebpRenderUrl(`${CLOUDFRONT_CDN_BASE}/${cdnPath}/${filename}`);
};

/**
 * Gets the product image URL for a master database item.
 * Prefers CDN URL from folder_path + filename, falls back to image_url columns.
 * 
 * @param item - Object containing folder_path, image_X_filename, and optional image_url_X
 * @param angleIndex - The angle index (0-3) for multi-angle images
 * @returns The image URL or null
 */
export const getProductCdnImageUrl = <T extends {
  folder_path?: string | null;
  image_0_filename?: string | null;
  image_1_filename?: string | null;
  image_2_filename?: string | null;
  image_3_filename?: string | null;
  image_url_0?: string | null;
  image_url_1?: string | null;
  image_url_2?: string | null;
  image_url_3?: string | null;
}>(
  item: T,
  angleIndex: number = 0
): string | null => {
  const filenameMap: Record<number, keyof T> = {
    0: 'image_0_filename' as keyof T,
    1: 'image_1_filename' as keyof T,
    2: 'image_2_filename' as keyof T,
    3: 'image_3_filename' as keyof T,
  };

  const urlMap: Record<number, keyof T> = {
    0: 'image_url_0' as keyof T,
    1: 'image_url_1' as keyof T,
    2: 'image_url_2' as keyof T,
    3: 'image_url_3' as keyof T,
  };

  const filenameKey = filenameMap[angleIndex] || filenameMap[0];
  const urlKey = urlMap[angleIndex] || urlMap[0];

  const filename = item[filenameKey] as string | null | undefined;
  const folderPath = item.folder_path;

  // Priority 1: Construct CDN URL from folder_path + filename
  const cdnUrl = constructCdnImageUrl(folderPath, filename);
  if (cdnUrl) return cdnUrl;

  // Priority 2: Fallback to stored image_url column
  return (item[urlKey] as string | null | undefined) ?? null;
};
