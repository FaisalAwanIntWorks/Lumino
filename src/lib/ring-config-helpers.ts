import { RingConfiguration, Stone } from '@/types/ring-builder';

/**
 * Shared Ring OS helpers for state sync between ChatAssistant and the configurator.
 */

/** Returns the index of the first step that is not yet configured (0-based). */
export function getNextRelevantStep(config: RingConfiguration, isEstimates: boolean): number {
  if (!config.style) return 0;
  if (!config.shank) return 1;
  if (!config.metal) return 2;
  if (!config.shape) return 3;
  if (config.caratRange === null) return 4;
  if (!config.stone) return 5;
  // Engraving (6) and Details (7) are optional – skip straight to summary if estimates mode
  if (isEstimates) return 8;
  return 7; // Details step (last non-estimate step)
}

/** True when style + shank + metal + shape + carat + stone are all set. */
export function isCheckoutReady(config: RingConfiguration): boolean {
  return !!(
    config.style &&
    config.shank &&
    config.metal &&
    config.shape &&
    config.caratRange !== null &&
    config.stone
  );
}

/** True when the 4 visual components (style/shank/metal/shape) are set – enough for viewer. */
export function isViewerReady(config: RingConfiguration): boolean {
  return !!(config.style && config.shank && config.metal && config.shape);
}

export interface DiamondPreset {
  id?: string;
  stone_type: string;
  shape_id: string;
  carat_value: number;
  carat_range?: string;
  color: string;
  clarity: string;
  base_price: number;
  custom_price?: number | null;
  cut_grade?: string | null;
  fluorescence?: string | null;
  is_enabled?: boolean;
  report_no?: string | null;
}

/**
 * Resolve a diamond from client presets that best matches the given shape + carat.
 * Prefers cheapest natural stone for the exact carat value; falls back to nearest carat.
 */
export function resolveDiamondFromPresets(
  presets: DiamondPreset[],
  shape: string | null,
  caratRange: number | null,
  stoneType: string = 'natural',
  options?: {
    strictStoneType?: boolean;
    /** Original carat before being snapped to a caratOption (e.g. 4.5 when snapped to 4) */
    rawCarat?: number;
    /** User-requested diamond color grade (e.g. "E") — match exactly before falling back */
    preferredColor?: string;
    /** User-requested clarity grade (e.g. "VVS1") — match exactly before falling back */
    preferredClarity?: string;
  },
): Stone | null {
  if (!presets || presets.length === 0 || !shape || caratRange === null) return null;

  // Filter by shape + stone type
  const shapeNorm = shape.toLowerCase();
  const stoneTypeNorm = stoneType.toLowerCase();
  let candidates = presets.filter(
    (p) =>
      p.shape_id.toLowerCase() === shapeNorm &&
      p.stone_type.toLowerCase() === stoneTypeNorm,
  );

  // If no match for this stone type, only fall back when NOT strict
  if (candidates.length === 0 && !options?.strictStoneType) {
    candidates = presets.filter((p) => p.shape_id.toLowerCase() === shapeNorm);
  }

  // If strict and no match, return null (don't cross stone types)
  if (candidates.length === 0 && options?.strictStoneType) {
    return null;
  }

  // If still nothing, use all presets (non-strict fallback)
  if (candidates.length === 0) {
    candidates = presets;
  }

  // Use the raw (unsnapped) carat for matching when available — it reflects exactly what the user asked
  const targetCarat = options?.rawCarat ?? caratRange;
  const exactMatch = candidates.filter((p) => p.carat_value === targetCarat);
  const pool = exactMatch.length > 0 ? exactMatch : candidates;

  // Quality ranking helpers (higher = better)
  const colorRank = (c: string): number => {
    const ranks: Record<string, number> = { D: 10, E: 9, F: 8, G: 7, H: 6, I: 5, J: 4, K: 3, L: 2, M: 1 };
    return ranks[c?.toUpperCase()] ?? 0;
  };
  const clarityRank = (c: string): number => {
    const ranks: Record<string, number> = { FL: 10, IF: 9, VVS1: 8, VVS2: 7, VS1: 6, VS2: 5, SI1: 4, SI2: 3, I1: 2, I2: 1, I3: 0 };
    return ranks[c?.toUpperCase()] ?? 0;
  };

  const prefColor = options?.preferredColor?.toUpperCase();
  const prefClarity = options?.preferredClarity?.toUpperCase();

  pool.sort((a, b) => {
    // 1. Closest to requested carat (prefer rawCarat over snapped caratRange)
    const diffA = Math.abs(a.carat_value - targetCarat);
    const diffB = Math.abs(b.carat_value - targetCarat);
    if (diffA !== diffB) return diffA - diffB;
    // Higher carat wins on a tie
    if (a.carat_value !== b.carat_value) return b.carat_value - a.carat_value;

    // 2. When user specified color/clarity, score by how closely each preset matches
    if (prefColor || prefClarity) {
      const matchScore = (p: DiamondPreset) => {
        let score = 0;
        if (prefColor   && p.color?.toUpperCase()   === prefColor)   score += 2;
        if (prefClarity && p.clarity?.toUpperCase() === prefClarity) score += 2;
        return score;
      };
      const scoreA = matchScore(a);
      const scoreB = matchScore(b);
      if (scoreA !== scoreB) return scoreB - scoreA; // higher match wins
    }

    // 3. Fall back to best overall quality
    const qualityA = colorRank(a.color) + clarityRank(a.clarity);
    const qualityB = colorRank(b.color) + clarityRank(b.clarity);
    if (qualityA !== qualityB) return qualityB - qualityA;
    // Tiebreaker: lower price
    const priceA = a.custom_price || a.base_price;
    const priceB = b.custom_price || b.base_price;
    return priceA - priceB;
  });

  const best = pool[0];
  if (!best) return null;

  return {
    id: best.id || `${best.stone_type}-${best.shape_id}-${best.carat_value}`,
    type: best.stone_type as 'natural' | 'lab',
    // Use || not ?? so that a stored custom_price of 0 (meaning "not overridden") falls back to base_price
    price: best.custom_price || best.base_price,
    carat: best.carat_value,
    color: best.color,
    clarity: best.clarity,
    reportNo: best.report_no ?? null,
  };
}

/**
 * Resolve the best diamond that keeps total ring price within a budget.
 * totalBudget = settingPrice + stonePrice, so maxStonePrice = budget - settingPrice.
 */
export function resolveDiamondForBudget(
  presets: DiamondPreset[],
  shape: string | null,
  settingPrice: number,
  totalBudget: number,
  stoneType: string = 'natural',
): Stone | null {
  if (!presets || presets.length === 0 || !shape) return null;

  const maxStonePrice = totalBudget - settingPrice;
  if (maxStonePrice <= 0) return null;

  const shapeNorm = shape.toLowerCase();
  const stoneTypeNorm = stoneType.toLowerCase();

  let candidates = presets.filter(
    (p) =>
      p.shape_id.toLowerCase() === shapeNorm &&
      p.stone_type.toLowerCase() === stoneTypeNorm &&
      (p.custom_price || p.base_price) <= maxStonePrice,
  );

  if (candidates.length === 0) {
    // Try any stone type
    candidates = presets.filter(
      (p) =>
        p.shape_id.toLowerCase() === shapeNorm &&
        (p.custom_price || p.base_price) <= maxStonePrice,
    );
  }

  if (candidates.length === 0) return null;

  const colorRank = (c: string): number => {
    const ranks: Record<string, number> = { D: 10, E: 9, F: 8, G: 7, H: 6, I: 5, J: 4, K: 3, L: 2, M: 1 };
    return ranks[c?.toUpperCase()] ?? 0;
  };
  const clarityRank = (c: string): number => {
    const ranks: Record<string, number> = { FL: 10, IF: 9, VVS1: 8, VVS2: 7, VS1: 6, VS2: 5, SI1: 4, SI2: 3, I1: 2, I2: 1, I3: 0 };
    return ranks[c?.toUpperCase()] ?? 0;
  };

  // Sort: biggest carat first, then best quality, then most expensive (maximize value)
  candidates.sort((a, b) => {
    if (a.carat_value !== b.carat_value) return b.carat_value - a.carat_value;
    const qualityA = colorRank(a.color) + clarityRank(a.clarity);
    const qualityB = colorRank(b.color) + clarityRank(b.clarity);
    if (qualityA !== qualityB) return qualityB - qualityA;
    return (b.custom_price || b.base_price) - (a.custom_price || a.base_price);
  });

  const best = candidates[0];
  return {
    id: best.id || `${best.stone_type}-${best.shape_id}-${best.carat_value}`,
    type: best.stone_type as 'natural' | 'lab',
    // Use || not ?? so that a stored custom_price of 0 (meaning "not overridden") falls back to base_price
    price: best.custom_price || best.base_price,
    carat: best.carat_value,
    color: best.color,
    clarity: best.clarity,
    reportNo: best.report_no ?? null,
  };
}
