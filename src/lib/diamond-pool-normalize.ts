/**
 * Maps raw `diamond_inventory_pool` values into the wizard's canonical tokens
 * so distinct values can be unioned with the hardcoded option lists.
 *
 * Used by the Diamond Catalog wizard and the `generate-client-diamond-presets`
 * edge function (a sibling copy lives there).
 */

export const POOL_SHAPE_MAP: Record<string, string> = {
  'ROUND': 'round',
  'OVAL': 'oval',
  'PEAR': 'pear',
  'EMERALD': 'emerald',
  'CUSHION': 'cushion',
  'CUSHION BRILLIANT': 'cushion',
  'CUSHION MODIFIED': 'cushion',
  'PRINCESS': 'princess',
  'RADIANT': 'radiant',
  'MARQUISE': 'marquise',
  'ASSCHER': 'asscher',
  'HEART': 'heart',
};

export const POOL_QUALITY_MAP: Record<string, string> = {
  'EX': 'Excellent',
  'VG': 'Very Good',
  'G': 'Good',
  'F': 'Fair',
  'P': 'Poor',
};

// Reverse map: normalized label -> pool codes used in cut/pol/symm columns
export const QUALITY_TO_POOL_CODES: Record<string, string[]> = {
  'Excellent': ['EX'],
  'Very Good': ['VG'],
  'Good': ['G'],
  'Fair': ['F'],
  'Poor': ['P'],
};

export const POOL_FLUORESCENCE_MAP: Record<string, string> = {
  'NON': 'None',
  'NONE': 'None',
  'FNT': 'Faint',
  'VSL': 'Very Slight',
  'SL': 'Slight',
  'MED': 'Medium',
  'STG': 'Strong',
  'STR': 'Strong',
  'VST': 'Very Strong',
};

const norm = (v: string) => v.trim().toUpperCase();

export const normalizeShape       = (v: string) => POOL_SHAPE_MAP[norm(v)] ?? v.trim().toLowerCase();
export const normalizeQuality     = (v: string) => POOL_QUALITY_MAP[norm(v)] ?? v.trim();
export const normalizeFluorescence = (v: string) => POOL_FLUORESCENCE_MAP[norm(v)] ?? v.trim();
export const normalizeColor       = (v: string) => v.trim().toUpperCase();
export const normalizeClarity     = (v: string) => v.trim().toUpperCase();
export const normalizeLab         = (v: string) => v.trim().toUpperCase();

/**
 * Returns the union of `existing` and the normalized `poolValues`, preserving
 * the order of `existing` and appending any new tokens at the end (sorted).
 */
export function mergeOptions(
  existing: readonly string[],
  poolValues: readonly string[] | undefined,
  normalizer: (v: string) => string = (v) => v
): string[] {
  const set = new Set(existing);
  const extras: string[] = [];
  for (const raw of poolValues ?? []) {
    if (!raw) continue;
    const t = normalizer(raw);
    if (!t || set.has(t)) continue;
    set.add(t);
    extras.push(t);
  }
  extras.sort();
  return [...existing, ...extras];
}

export interface DiamondPoolDistinctValues {
  shapes: string[];
  colors: string[];
  clarities: string[];
  cuts: string[];
  polish: string[];
  symmetry: string[];
  fluorescence: string[];
  labs: string[];
}
