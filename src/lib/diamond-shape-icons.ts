import { ASSET_CDN } from "@/lib/asset-cdn";
/**
 * Maps a diamond shape id to a transparent CDN icon URL.
 * Used by Ring OS widget CARAT and STONE steps to show
 * the shape selected in the previous step.
 *
 * Served as WebP; every <img> showing one uses `fallbackToPngOnError`
 * so the .png twin is shown if the WebP cannot load.
 */
const SHAPE_ICON_CDN: Record<string, string> = {
  round: `${ASSET_CDN.ringBuilder}/GenericDttFormImagesTransparent/diamond_shape/Round.webp`,
  oval: `${ASSET_CDN.ringBuilder}/GenericDttFormImagesTransparent/diamond_shape/Oval.webp`,
  cushion: `${ASSET_CDN.ringBuilder}/GenericDttFormImagesTransparent/diamond_shape/Cushion.webp`,
  princess: `${ASSET_CDN.ringBuilder}/GenericDttFormImagesTransparent/diamond_shape/old+mine.webp`,
  radiant: `${ASSET_CDN.ringBuilder}/GenericDttFormImagesTransparent/diamond_shape/radiant.webp`,
  emerald: `${ASSET_CDN.ringBuilder}/GenericDttFormImagesTransparent/diamond_shape/emerald.webp`,
  marquise: `${ASSET_CDN.ringBuilder}/GenericDttFormImagesTransparent/diamond_shape/marquise.webp`,
  pear: `${ASSET_CDN.ringBuilder}/GenericDttFormImagesTransparent/diamond_shape/pear.webp`,
};

export function getDiamondShapeIcon(shapeId: string): string | null {
  if (!shapeId) return null;
  return SHAPE_ICON_CDN[shapeId.toLowerCase()] ?? null;
}
