/**
 * Ring OS diamond catalogue shapes.
 *
 * The diamond pool now carries more shapes (Asscher, Heart, Old Miner,
 * European Cut, Rose Cut, Square …) than Ring OS supports. The Ring OS
 * catalogue (Ring OS → Catalog → Diamond Catalogue) and therefore the Ring OS
 * widget stay on the original eight shapes: the catalogue never offers the
 * others and always saves an explicit shape list, so pool stones of the new
 * shapes never reach a Ring OS catalogue or widget. The Quote Estimator V3
 * Diamond Configuration is separate and keeps every pool shape.
 */
export const RING_OS_CATALOG_SHAPES: readonly string[] = [
  'round', 'princess', 'oval', 'cushion', 'emerald', 'pear', 'marquise', 'radiant',
];

/** Pool shape string ("CUSHION MODIFIED") -> shape id ("cushion"), same rule as the catalogue. */
export const poolShapeId = (shape: string) => shape.trim().toLowerCase().split(/\s+/)[0] ?? '';

export const isRingOsCatalogShape = (shapeId: string) => RING_OS_CATALOG_SHAPES.includes(shapeId.trim().toLowerCase());

/** Keeps only the pool shape strings whose shape id Ring OS supports. */
export function filterRingOsCatalogShapeValues(poolShapes: string[]): string[] {
  return poolShapes.filter(s => isRingOsCatalogShape(poolShapeId(s)));
}
