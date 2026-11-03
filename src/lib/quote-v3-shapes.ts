/**
 * Quote Estimator V3 "Find your shape" tiles.
 *
 * The shared diamond_shape_options table holds every shape any version or
 * client may use. V3 shows only this recommended set, in this order, plus the
 * Colored Diamond and Gemstone tiles. Nothing is removed from the table, so
 * V1 / V2, other clients and the Configure → Options toggles are untouched.
 */
import { COLORED_DIAMOND_SHAPE_VALUE, GEMSTONE_SHAPE_VALUE } from '@/lib/quote-v3-gemstones';

export const V3_SHAPE_TILE_ORDER: readonly string[] = [
  'round',
  'oval',
  'cushion',
  'pear',
  'emerald',
  'radiant',
  'princess',
  'marquise',
  'asscher',
  'heart',
  'old-miner',
  'european-cut',
  'rose-cut',
  COLORED_DIAMOND_SHAPE_VALUE,
  GEMSTONE_SHAPE_VALUE,
];

/** Keeps only the V3 tiles, in V3 order; options the table lacks are simply absent. */
export function filterV3ShapeTiles<T extends { option_value: string }>(options: T[]): T[] {
  const rank = new Map(V3_SHAPE_TILE_ORDER.map((v, i) => [v, i]));
  return options
    .filter(o => rank.has(o.option_value))
    .sort((a, b) => (rank.get(a.option_value) ?? 0) - (rank.get(b.option_value) ?? 0));
}
