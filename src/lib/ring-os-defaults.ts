/**
 * Ring OS — Single source of truth for default add-on prices.
 * Source: RingOS-Pricing-Guide.docx v1.0 (May 2026).
 *
 * Lego pricing model:
 *   Total = Style + Shank + Metal + Diamond
 *
 * Carat selection is a marketplace FILTER only — it never adds to the total.
 *
 * Style and Shank prices below are the doc's recommended starting defaults.
 * They sit at or just below the entry tier of major online configurators
 * (James Allen / Blue Nile / Brilliant Earth / Ritani), leaving room for
 * independent jewelers to mark up while remaining competitive.
 *
 * Used as fallbacks when:
 *   - A client has not yet customised a value in their catalogue, OR
 *   - A row is missing in client_option_prices / client_metal_variants /
 *     client_carat_options.
 *
 * Existing clients keep whatever they have edited; only newly seeded
 * clients pick up these numbers.
 */

import type { StyleOption, ShankOption, MetalOption, ShapeOption } from '@/types/ring-builder';

// ── STYLES ───────────────────────────────────────────────────────────────────
// 14K gold baseline, setting only (no center stone).
export const RING_OS_DEFAULT_STYLE_PRICES: Record<string, number> = {
  'solitaire': 1000,
  'halo': 1500,
  'pave-rail': 1800,
  'three-stone': 2000,
};

export const RING_OS_DEFAULT_STYLES: StyleOption[] = [
  { id: 'solitaire', name: 'Solitaire', description: 'One center stone, plain band. The most classic engagement ring.', price: RING_OS_DEFAULT_STYLE_PRICES['solitaire'] },
  { id: 'three-stone', name: 'Three Stone', description: 'Center stone plus two matching side stones. Past, present, future.', price: RING_OS_DEFAULT_STYLE_PRICES['three-stone'] },
  { id: 'halo', name: 'Halo', description: 'A ring of tiny diamonds wraps the center stone, making it look larger.', price: RING_OS_DEFAULT_STYLE_PRICES['halo'] },
  { id: 'pave-rail', name: 'Pavé Rail', description: 'Tiny diamonds flush-set along the top edge of the shank.', price: RING_OS_DEFAULT_STYLE_PRICES['pave-rail'] },
];

// ── SHANKS ───────────────────────────────────────────────────────────────────
// Add-on applied on top of the style base price.
// Plain shanks (high-polish, tapered) add no diamonds.
// Diamond shanks add melee diamond carat weight and labour.
export const RING_OS_DEFAULT_SHANK_PRICES: Record<string, number> = {
  'high-polish': 100,
  'tapered': 200,
  'marquise-cut': 400,
  'castel-pave': 500,
  '3-row-pave': 1300,
  'eternity': 1500,
};

export const RING_OS_DEFAULT_SHANKS: ShankOption[] = [
  { id: 'high-polish', name: 'High Polish', description: 'Plain smooth band. The default.', price: RING_OS_DEFAULT_SHANK_PRICES['high-polish'] },
  { id: 'tapered', name: 'Tapered', description: 'Plain band that narrows toward the center stone.', price: RING_OS_DEFAULT_SHANK_PRICES['tapered'] },
  { id: 'marquise-cut', name: 'Marquise Cut', description: 'Marquise-shaped accents on the shoulders (~0.10–0.20 ctw).', price: RING_OS_DEFAULT_SHANK_PRICES['marquise-cut'] },
  { id: 'castel-pave', name: 'Castel Pavé', description: 'French/scalloped pavé with diamond sides visible (~0.15–0.25 ctw).', price: RING_OS_DEFAULT_SHANK_PRICES['castel-pave'] },
  { id: '3-row-pave', name: '3 Row Pavé', description: 'Three parallel rows of pavé diamonds along the shank (~0.40–0.75 ctw).', price: RING_OS_DEFAULT_SHANK_PRICES['3-row-pave'] },
  { id: 'eternity', name: 'Eternity', description: 'Diamonds 360° around the band. Cannot be resized (~0.50–1.0+ ctw).', price: RING_OS_DEFAULT_SHANK_PRICES['eternity'] },
];

// ── METALS ───────────────────────────────────────────────────────────────────
// Customer add-on = weight × purity × spot/g × markup (+5% rhodium on white).
// Default markups: Gold/Pt 2.5×, Silver 2.0×. Numbers below are computed at the
// May-2026 reference spot prices (see ring-os-metal-pricing.ts) so the static
// fallback always reflects realistic, current market math instead of $0 / $450.
import { computeMetalAddOnAtReferenceSpot, type ColorFamily } from './ring-os-metal-pricing';

export interface RingOsMetalVariant {
  id: string;
  colorFamily: ColorFamily;
  variantName: string;
  price: number;
  displayHex: string;
}

export const RING_OS_DEFAULT_METAL_VARIANTS: RingOsMetalVariant[] = [
  { id: 'default-14k-yellow', colorFamily: 'yellow', variantName: '14K Yellow Gold', price: computeMetalAddOnAtReferenceSpot('14k', 'yellow'),  displayHex: '#FFD700' },
  { id: 'default-14k-rose',   colorFamily: 'rose',   variantName: '14K Rose Gold',   price: computeMetalAddOnAtReferenceSpot('14k', 'rose'),    displayHex: '#E0BFB8' },
  { id: 'default-14k-white',  colorFamily: 'white',  variantName: '14K White Gold',  price: computeMetalAddOnAtReferenceSpot('14k', 'white'),   displayHex: '#E8E8E8' },
  { id: 'default-18k-yellow', colorFamily: 'yellow', variantName: '18K Yellow Gold', price: computeMetalAddOnAtReferenceSpot('18k', 'yellow'),  displayHex: '#FFDF00' },
  { id: 'default-18k-rose',   colorFamily: 'rose',   variantName: '18K Rose Gold',   price: computeMetalAddOnAtReferenceSpot('18k', 'rose'),    displayHex: '#D6968B' },
  { id: 'default-18k-white',  colorFamily: 'white',  variantName: '18K White Gold',  price: computeMetalAddOnAtReferenceSpot('18k', 'white'),   displayHex: '#F0F0F0' },
  { id: 'default-platinum',   colorFamily: 'platinum', variantName: 'Platinum',        price: computeMetalAddOnAtReferenceSpot('platinum', 'platinum'), displayHex: '#C0C0C0' },
  { id: 'default-silver',     colorFamily: 'silver',   variantName: 'Sterling Silver', price: computeMetalAddOnAtReferenceSpot('silver',   'silver'),   displayHex: '#B8B8B8' },
];

// Flat list used by the catalogue card UI (id-based lookup).
export const RING_OS_DEFAULT_METALS: MetalOption[] = [
  { id: '14k-yellow', name: '14K Yellow Gold', color: '#FFD700', price: computeMetalAddOnAtReferenceSpot('14k', 'yellow'),     colorFamily: 'yellow' },
  { id: '14k-rose',   name: '14K Rose Gold',   color: '#E0BFB8', price: computeMetalAddOnAtReferenceSpot('14k', 'rose'),       colorFamily: 'rose' },
  { id: '14k-white',  name: '14K White Gold',  color: '#E8E8E8', price: computeMetalAddOnAtReferenceSpot('14k', 'white'),      colorFamily: 'white' },
  { id: '18k-yellow', name: '18K Yellow Gold', color: '#FFDF00', price: computeMetalAddOnAtReferenceSpot('18k', 'yellow'),     colorFamily: 'yellow' },
  { id: '18k-rose',   name: '18K Rose Gold',   color: '#D6968B', price: computeMetalAddOnAtReferenceSpot('18k', 'rose'),       colorFamily: 'rose' },
  { id: '18k-white',  name: '18K White Gold',  color: '#F0F0F0', price: computeMetalAddOnAtReferenceSpot('18k', 'white'),      colorFamily: 'white' },
  { id: 'platinum',   name: 'Platinum',        color: '#C0C0C0', price: computeMetalAddOnAtReferenceSpot('platinum', 'platinum'), colorFamily: 'platinum' },
  { id: 'sterling-silver', name: 'Sterling Silver', color: '#B8B8B8', price: computeMetalAddOnAtReferenceSpot('silver', 'silver'), colorFamily: 'silver' },
];

// ── SHAPES ───────────────────────────────────────────────────────────────────
export const RING_OS_DEFAULT_SHAPES: ShapeOption[] = [
  { id: 'round', name: 'Round' },
  { id: 'oval', name: 'Oval' },
  { id: 'princess', name: 'Princess' },
  { id: 'radiant', name: 'Radiant' },
  { id: 'emerald', name: 'Emerald' },
  { id: 'cushion', name: 'Cushion' },
];

// ── CARATS ───────────────────────────────────────────────────────────────────
// Carat is a marketplace FILTER ONLY — it never adds to the ring total.
// The diamond's actual price comes from the diamond wizard / marketplace.
export interface RingOsCaratOption {
  value: number;
  name: string;
  adjustment: number;
}

export const RING_OS_DEFAULT_CARAT_OPTIONS: RingOsCaratOption[] = [
  { value: 0.5, name: '0.5 Carat', adjustment: 0 },
  { value: 1.0, name: '1 Carat',   adjustment: 0 },
  { value: 1.5, name: '1.5 Carat', adjustment: 0 },
  { value: 2.0, name: '2 Carat',   adjustment: 0 },
  { value: 2.5, name: '2.5 Carat', adjustment: 0 },
  { value: 3.0, name: '3 Carat+',  adjustment: 0 },
];

// ── METAL NAME HELPERS ───────────────────────────────────────────────────────
/**
 * Build a metal variant name without duplicating the word "Gold".
 * e.g. ('14K', 'Yellow Gold') → '14K Yellow Gold' (not '14K Yellow Gold Gold').
 */
export function normalizeMetalName(karatLabel: string, colorName: string): string {
  const base = `${karatLabel} ${colorName}`.trim().replace(/\s+/g, ' ');
  if (/gold$/i.test(base)) return base;
  return `${base} Gold`;
}
