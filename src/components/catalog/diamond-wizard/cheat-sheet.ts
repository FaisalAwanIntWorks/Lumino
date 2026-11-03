/**
 * Ring OS Master Pricing Cheat Sheet — May 2026
 * Source: RingOS-Master-Cheat-Sheet.docx
 *
 * Formula:
 *   Retail = Wholesale Anchor (per carat, by stone type)
 *          × Clarity Multiplier (lab/natural specific)
 *          × Color Multiplier (lab/natural specific)
 *          × Shape Discount (shared)
 *          × (1 + Markup% per carat tier)
 *          → rounded to nearest $50
 *
 * Anchors quoted at G/VS2 round brilliant US wholesale.
 */

// Per-carat USD wholesale anchors (per-stone, not per-carat-of-weight).
// 0.50–3.00ct from cheat sheet. 3.50–5.00ct linearly extrapolated from the 2.50→3.00 trend.
export const WHOLESALE_ANCHORS_NATURAL: Record<number, number> = {
  0.50: 1000,
  1.00: 3700,
  1.50: 8250,
  2.00: 18000,
  2.50: 28750,
  3.00: 45000,
  3.50: 58000,
  4.00: 72000,
  4.50: 88000,
  5.00: 105000,
};

export const WHOLESALE_ANCHORS_LAB: Record<number, number> = {
  0.50: 125,
  1.00: 190,
  1.50: 345,
  2.00: 520,
  2.50: 725,
  3.00: 945,
  3.50: 1180,
  4.00: 1430,
  4.50: 1700,
  5.00: 1990,
};

// Clarity multipliers — VS2 = 1.00 baseline
export const CLARITY_MULTIPLIERS_NATURAL: Record<string, number> = {
  FL: 1.95,
  IF: 1.75,
  VVS1: 1.45,
  VVS2: 1.32,
  VS1: 1.15,
  VS2: 1.00,
  SI1: 0.82,
  SI2: 0.65,
  I1: 0.45,
  I2: 0.30,
  I3: 0.20,
};

export const CLARITY_MULTIPLIERS_LAB: Record<string, number> = {
  FL: 1.95,
  IF: 1.75,
  VVS1: 1.15,
  VVS2: 1.08,
  VS1: 1.04,
  VS2: 1.00,
  SI1: 0.88,
  SI2: 0.78,
  I1: 0.60,
  I2: 0.45,
  I3: 0.30,
};

// Color multipliers — G = 1.00 baseline
export const COLOR_MULTIPLIERS_NATURAL: Record<string, number> = {
  D: 1.35,
  E: 1.24,
  F: 1.14,
  G: 1.00,
  H: 0.90,
  I: 0.78,
  J: 0.66,
  K: 0.55,
  L: 0.48,
  M: 0.42,
};

export const COLOR_MULTIPLIERS_LAB: Record<string, number> = {
  D: 1.15,
  E: 1.10,
  F: 1.05,
  G: 1.00,
  H: 0.94,
  I: 0.85,
  J: 0.75,
  K: 0.65,
  L: 0.58,
  M: 0.52,
};

// Shape discounts — Round = 1.00, lab + natural shared
export const SHAPE_DISCOUNTS: Record<string, number> = {
  round: 1.00,
  oval: 0.83,
  pear: 0.78,
  cushion: 0.75,
  princess: 0.70,
  radiant: 0.70,
  marquise: 0.70,
  emerald: 0.68,
  asscher: 0.62,
  heart: 0.75,
};

// Default markups per carat tier (percentage applied after multipliers)
// Indexed by tier order matching STANDARD_CARAT_RANGES (0.50, 1.00, 1.50, 2.00, 2.50, 3.00, 3.50, 4.00, 4.50)
export const DEFAULT_MARKUPS_NATURAL = [110, 90, 75, 60, 50, 40, 35, 35, 35];
export const DEFAULT_MARKUPS_LAB = [220, 175, 140, 110, 95, 85, 80, 80, 80];

// Helper: lookup anchor for a carat (uses nearest standard anchor at-or-below)
export function getAnchor(carat: number, isLab: boolean): number {
  const table = isLab ? WHOLESALE_ANCHORS_LAB : WHOLESALE_ANCHORS_NATURAL;
  const keys = Object.keys(table).map(Number).sort((a, b) => a - b);
  let chosen = keys[0];
  for (const k of keys) {
    if (k <= carat + 0.001) chosen = k;
  }
  return table[chosen];
}
