import type { SyntheticEvent } from 'react';
import { ASSET_CDN } from "@/lib/asset-cdn";

/**
 * WebP-first delivery for the stock widget imagery, with a PNG safety net.
 *
 * Every default image the CustomX forms ship with (Quote Estimator, Ring
 * Builder, Grillz Builder, Custom Enquiry, Metal IQ flags and the Ring OS
 * shape icons) is published on its CDN as both `.png` and `.webp` at the SAME
 * path — only the extension differs. See
 * `alljewlximagesurls/aurezo-form-cdn-image-urls-webp.md`.
 *
 * The forms request the (much smaller) `.webp` file first. If a browser cannot
 * decode WebP, or a particular `.webp` twin is missing on the CDN, the `<img>`
 * `onError` handler swaps that one image back to its `.png` original, so the
 * visitor always sees a picture.
 */

/** CDN bases whose files have a `.webp` twin next to every `.png`. */
const WEBP_CDN_PREFIXES = [
  `${ASSET_CDN.ringBuilder}/GenericDttFormImagesTransparent/`,
  `${ASSET_CDN.diamondCatalog}/DiamondsCatalog/`,
  `${ASSET_CDN.diamondCatalog}/DiamondCatalogZaiwar/`,
  `${ASSET_CDN.main}/GrillzBuilder/`,
  `${ASSET_CDN.main}/DTTRingBuilder/`,
  `${ASSET_CDN.dttRingBuilderS3}/DTTRingBuilder/`,
  `${ASSET_CDN.main}/JewlxRingsSketches/`,
  `${ASSET_CDN.rings}/ring-description/`,
  `${ASSET_CDN.rings}/CaratSizeImages/`,
  'https://flagcdn.com/',
];

const PNG_EXT = /\.png(?=$|[?#])/i;
const WEBP_EXT = /\.webp(?=$|[?#])/i;

/** True for URLs on one of the stock CDNs above. */
export function isWebpCdnUrl(url: string | null | undefined): boolean {
  return !!url && WEBP_CDN_PREFIXES.some((prefix) => url.startsWith(prefix));
}

/**
 * Swap a stock CDN `.png` URL for its `.webp` twin.
 *
 * Only URLs on the known CDN bases are touched — client-uploaded custom
 * images, local asset paths, data/blob URLs and anything already `.webp` are
 * returned exactly as given (including `null`/`undefined`).
 */
export function toWebpImageUrl<T extends string | null | undefined>(url: T): T {
  if (!url || !isWebpCdnUrl(url)) return url;
  return url.replace(PNG_EXT, '.webp') as T;
}

/** The `.png` original of a `.webp` URL (any host); other URLs are returned as-is. */
export function toPngImageUrl<T extends string | null | undefined>(url: T): T {
  if (!url) return url;
  return url.replace(WEBP_EXT, '.png') as T;
}

/**
 * `<img onError>` handler: retry the `.png` original when a `.webp` fails.
 *
 * Works directly on the DOM element so it needs no component state — React
 * leaves the swapped `src` alone on re-render because the `src` prop itself
 * has not changed. Each distinct `.webp` URL is retried once; a failing `.png`
 * is left to the caller's own error handling.
 *
 * @returns `true` when a `.png` retry was started (the image is not broken
 *   yet), `false` when there was nothing to fall back to.
 */
export function fallbackToPngOnError(e: SyntheticEvent<HTMLImageElement>): boolean {
  const img = e.currentTarget;
  const src = img.getAttribute('src') || '';
  if (!WEBP_EXT.test(src)) return false;
  // Guard against re-trying the same URL if the browser re-fires the error.
  if (img.dataset.webpFallbackFrom === src) return false;
  img.dataset.webpFallbackFrom = src;
  img.src = toPngImageUrl(src);
  return true;
}
