/**
 * Maps a diamond shape id to a transparent CDN icon URL.
 * Used by Ring OS widget CARAT and STONE steps to show
 * the shape selected in the previous step.
 *
 * Served as WebP; every <img> showing one uses `fallbackToPngOnError`
 * so the .png twin is shown if the WebP cannot load.
 */
const SHAPE_ICON_CDN: Record<string, string> = {
  round: 'https://d2ybchbsrb165p.cloudfront.net/GenericDttFormImagesTransparent/diamond_shape/Round.webp',
  oval: 'https://d2ybchbsrb165p.cloudfront.net/GenericDttFormImagesTransparent/diamond_shape/Oval.webp',
  cushion: 'https://d2ybchbsrb165p.cloudfront.net/GenericDttFormImagesTransparent/diamond_shape/Cushion.webp',
  princess: 'https://d2ybchbsrb165p.cloudfront.net/GenericDttFormImagesTransparent/diamond_shape/old+mine.webp',
  radiant: 'https://d2ybchbsrb165p.cloudfront.net/GenericDttFormImagesTransparent/diamond_shape/radiant.webp',
  emerald: 'https://d2ybchbsrb165p.cloudfront.net/GenericDttFormImagesTransparent/diamond_shape/emerald.webp',
  marquise: 'https://d2ybchbsrb165p.cloudfront.net/GenericDttFormImagesTransparent/diamond_shape/marquise.webp',
  pear: 'https://d2ybchbsrb165p.cloudfront.net/GenericDttFormImagesTransparent/diamond_shape/pear.webp',
};

export function getDiamondShapeIcon(shapeId: string): string | null {
  if (!shapeId) return null;
  return SHAPE_ICON_CDN[shapeId.toLowerCase()] ?? null;
}
