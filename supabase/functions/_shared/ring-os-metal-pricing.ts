/**
 * Server-side mirror of src/lib/ring-os-metal-pricing.ts
 * Source of truth: RingOS-Metal-Pricing-Guide v2.0 (May 2026).
 *
 * Customer add-on = weight(g) × purity × spot($/g) × markup
 *   + 5% rhodium surcharge on White Gold
 */

export const BLENDED_GOLD_WEIGHT_G = 4.0;
export const PLATINUM_DENSITY_FACTOR = 1.4;
export const SILVER_BLENDED_WEIGHT_G = 4.0;
export const OZ_TO_GRAM = 31.1035;
export const RHODIUM_SURCHARGE = 0.05;

export const KARAT_PURITY: Record<string, number> = {
  '9k': 0.375,
  '10k': 0.417,
  '14k': 0.583,
  '18k': 0.750,
  '22k': 0.917,
  '24k': 0.999,
};

export const PLATINUM_PURITY = 0.95;
export const SILVER_PURITY = 0.925;

export const DEFAULT_MARKUPS = {
  gold: 2.5,
  platinum: 2.5,
  silver: 2.0,
};

export const REFERENCE_SPOT_PRICES_PER_OZ = {
  gold: 3320,
  platinum: 1050,
  silver: 32,
};

export type ColorFamily = 'yellow' | 'rose' | 'white' | 'platinum' | 'silver';

export interface MetalAddOnInput {
  karat: string;
  colorFamily: ColorFamily;
  spotGoldPerOz: number;
  spotPlatinumPerOz: number;
  spotSilverPerOz: number;
  markups?: Partial<typeof DEFAULT_MARKUPS>;
}

export function computeMetalAddOn(input: MetalAddOnInput): number {
  const m = { ...DEFAULT_MARKUPS, ...(input.markups ?? {}) };
  const karat = input.karat.toLowerCase();

  if (karat === 'platinum' || input.colorFamily === 'platinum') {
    const weight = BLENDED_GOLD_WEIGHT_G * PLATINUM_DENSITY_FACTOR;
    const perGram = input.spotPlatinumPerOz / OZ_TO_GRAM;
    const raw = weight * PLATINUM_PURITY * perGram;
    return Math.round(raw * m.platinum);
  }

  if (karat === 'silver' || input.colorFamily === 'silver') {
    const perGram = input.spotSilverPerOz / OZ_TO_GRAM;
    const raw = SILVER_BLENDED_WEIGHT_G * SILVER_PURITY * perGram;
    return Math.round(raw * m.silver);
  }

  if (karat === 'white-gold-plated') {
    const perGram = input.spotGoldPerOz / OZ_TO_GRAM;
    const raw = BLENDED_GOLD_WEIGHT_G * KARAT_PURITY['14k'] * perGram * (1 + RHODIUM_SURCHARGE);
    return Math.round(raw * m.gold);
  }

  const purity = KARAT_PURITY[karat];
  if (!purity) return 0;

  const perGram = input.spotGoldPerOz / OZ_TO_GRAM;
  const isWhite = input.colorFamily === 'white';
  const raw = BLENDED_GOLD_WEIGHT_G * purity * perGram * (isWhite ? 1 + RHODIUM_SURCHARGE : 1);
  return Math.round(raw * m.gold);
}

export function computeMetalAddOnAtReferenceSpot(
  karat: string,
  colorFamily: ColorFamily,
  markups?: Partial<typeof DEFAULT_MARKUPS>,
): number {
  return computeMetalAddOn({
    karat,
    colorFamily,
    spotGoldPerOz: REFERENCE_SPOT_PRICES_PER_OZ.gold,
    spotPlatinumPerOz: REFERENCE_SPOT_PRICES_PER_OZ.platinum,
    spotSilverPerOz: REFERENCE_SPOT_PRICES_PER_OZ.silver,
    markups,
  });
}

/**
 * Detect karat key from a variant name.
 * Returns one of: '9k'|'10k'|'14k'|'18k'|'22k'|'24k'|'platinum'|'silver'|'white-gold-plated'|null
 */
export function detectKaratFromName(name: string): string | null {
  const n = name.toLowerCase();
  if (/white[-\s]*gold[-\s]*plated|gold[-\s]*plated/.test(n)) return 'white-gold-plated';
  if (/\bplatinum\b|\bpt\s?950\b|\bpt950\b/.test(n)) return 'platinum';
  if (/\bsterling\b|\bsilver\b|\b925\b/.test(n)) return 'silver';
  const m = n.match(/(\d{1,2})\s?k\b/);
  if (m) {
    const k = `${m[1]}k`;
    if (KARAT_PURITY[k] !== undefined) return k;
  }
  return null;
}

/**
 * Validate a single metal variant against the family/karat rules.
 * Returns null if valid, or an error message string.
 */
export function validateVariantCombination(
  colorFamily: string,
  variantName: string,
): string | null {
  const karat = detectKaratFromName(variantName);
  if (!karat) {
    return `Unable to detect karat from variant name "${variantName}".`;
  }
  if (colorFamily === 'platinum' && karat !== 'platinum') {
    return `Variant "${variantName}" cannot be saved under the Platinum family.`;
  }
  if (colorFamily === 'silver' && karat !== 'silver') {
    return `Variant "${variantName}" cannot be saved under the Silver family.`;
  }
  if (karat === 'platinum' && colorFamily !== 'platinum') {
    return `Platinum variant "${variantName}" must be in the Platinum family (got "${colorFamily}").`;
  }
  if (karat === 'silver' && colorFamily !== 'silver') {
    return `Silver variant "${variantName}" must be in the Silver family (got "${colorFamily}").`;
  }
  return null;
}
