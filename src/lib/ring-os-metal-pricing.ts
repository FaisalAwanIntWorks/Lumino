/**
 * Ring OS — Metal add-on pricing engine.
 * Source: RingOS-Metal-Pricing-Guide v2.0 (May 2026).
 *
 * Customer add-on = weight(g) × purity × spot($/g) × markup
 *   + 5% rhodium surcharge on White Gold
 *
 * One blended weight (4g) covers all gold karats. Platinum weight is
 * auto-derived (4g × 1.4 density = 5.6g) — never asked of the jeweler.
 */

export const BLENDED_GOLD_WEIGHT_G = 4.0;
export const PLATINUM_DENSITY_FACTOR = 1.4; // platinum is ~1.4× denser than gold
export const SILVER_BLENDED_WEIGHT_G = 4.0;
export const OZ_TO_GRAM = 31.1035;
export const RHODIUM_SURCHARGE = 0.05;

// Karat purity (% gold/platinum/silver content)
export const KARAT_PURITY: Record<string, number> = {
  '9k': 0.375,
  '10k': 0.417,
  '14k': 0.583,
  '18k': 0.750,
  '22k': 0.917,
  '24k': 0.999,
};

export const PLATINUM_PURITY = 0.95;   // PT950
export const SILVER_PURITY = 0.925;    // sterling

// Default markups — industry-researched (JCK / National Jeweler / Rapaport).
export const DEFAULT_MARKUPS = {
  gold: 2.5,
  platinum: 2.5,
  silver: 2.0,
};

// Reference spot prices (May 2026, USD/oz) — used to seed static defaults
// when live prices aren't available. Update yearly or fold into a cron later.
export const REFERENCE_SPOT_PRICES_PER_OZ = {
  gold: 3320,
  platinum: 1050,
  silver: 32,
};

export type ColorFamily = 'yellow' | 'rose' | 'white' | 'platinum' | 'silver';

export interface MetalAddOnInput {
  karat: string;                    // '14k', '18k', 'platinum', 'silver'
  colorFamily: ColorFamily;
  spotGoldPerOz: number;
  spotPlatinumPerOz: number;
  spotSilverPerOz: number;
  markups?: Partial<typeof DEFAULT_MARKUPS>;
}

/**
 * Compute the customer-facing add-on price (rounded to nearest dollar)
 * for a single metal variant.
 *
 * Returns 0 for unknown karat/color combos rather than throwing — caller
 * decides whether to hide or show the variant.
 */
export function computeMetalAddOn(input: MetalAddOnInput): number {
  const m = { ...DEFAULT_MARKUPS, ...(input.markups ?? {}) };
  const karat = input.karat.toLowerCase();

  // Platinum group (PT950)
  if (karat === 'platinum' || input.colorFamily === 'platinum') {
    const weight = BLENDED_GOLD_WEIGHT_G * PLATINUM_DENSITY_FACTOR;
    const perGram = input.spotPlatinumPerOz / OZ_TO_GRAM;
    const raw = weight * PLATINUM_PURITY * perGram;
    return Math.round(raw * m.platinum);
  }

  // Sterling silver group
  if (karat === 'silver' || input.colorFamily === 'silver') {
    const perGram = input.spotSilverPerOz / OZ_TO_GRAM;
    const raw = SILVER_BLENDED_WEIGHT_G * SILVER_PURITY * perGram;
    return Math.round(raw * m.silver);
  }

  // White gold plated — treat as a thin rhodium plate over a base gold
  // (use 14K as the base since it's the most common plating substrate).
  if (karat === 'white-gold-plated') {
    const perGram = input.spotGoldPerOz / OZ_TO_GRAM;
    const raw = BLENDED_GOLD_WEIGHT_G * KARAT_PURITY['14k'] * perGram * (1 + RHODIUM_SURCHARGE);
    return Math.round(raw * m.gold);
  }

  // Gold group (9K–24K, any color family)
  const purity = KARAT_PURITY[karat];
  if (!purity) return 0;

  const perGram = input.spotGoldPerOz / OZ_TO_GRAM;
  const isWhite = input.colorFamily === 'white';
  const raw = BLENDED_GOLD_WEIGHT_G * purity * perGram * (isWhite ? 1 + RHODIUM_SURCHARGE : 1);
  return Math.round(raw * m.gold);
}

/**
 * Convenience: compute a price using the May-2026 reference spot prices.
 * Useful for static fallbacks where no live API call has been made.
 */
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
