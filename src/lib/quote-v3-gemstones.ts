/**
 * Gemstone choices for the Quote Estimator V3 "Pick your gemstone" screen.
 *
 * The screen opens only after the Gemstone shape card (`ruby-sapphire-emerald`)
 * is picked. Pictures are served from the V3 stock CDN; until each file is
 * uploaded the card falls back to a tinted swatch so the layout stays intact.
 */

/** Shape option value whose selection opens the gemstone screen. */
export const GEMSTONE_SHAPE_VALUE = 'ruby-sapphire-emerald';

/** Shape option value whose selection opens the colored-diamond shape screen. */
export const COLORED_DIAMOND_SHAPE_VALUE = 'colored-diamond';

/** Folder on the V3 stock CDN that holds `<file>.webp` for every gemstone below. */
export const V3_GEMSTONE_IMAGE_BASE = 'https://d1cekhbdtlmikd.cloudfront.net/jewlx3updatedtransparentimages/gemstones';

export interface QuoteGemstone {
  /** Stable value stored on the form data and lead note. */
  value: string;
  /** Customer-facing name. */
  name: string;
  /** File name on the CDN (without extension), matching the uploaded set. */
  file: string;
  /** Representative colour used by the placeholder swatch before the picture exists. */
  tint: string;
}

export const QUOTE_GEMSTONES: QuoteGemstone[] = [
  { value: 'alexandrite', name: 'Alexandrite', file: 'Alexandrite', tint: '#2f7f74' },
  { value: 'apatite', name: 'Apatite', file: 'Apatite', tint: '#1fb6c9' },
  { value: 'aquamarine', name: 'Aquamarine', file: 'Aquamarine', tint: '#6fc3e6' },
  { value: 'beryl', name: 'Beryl', file: 'Beryl', tint: '#a9d47c' },
  { value: 'chrysoberyl', name: 'Chrysoberyl', file: 'Chrysoberyl', tint: '#d9b14a' },
  { value: 'emerald', name: 'Emerald', file: 'Emerald', tint: '#1d8a4e' },
  { value: 'garnet', name: 'Garnet', file: 'Garnet', tint: '#3fae3a' },
  { value: 'iolite', name: 'Iolite', file: 'Iolite', tint: '#3c48b3' },
  { value: 'kunzite', name: 'Kunzite', file: 'Kunzite', tint: '#e58bc8' },
  { value: 'lapis-lazuli', name: 'Lapis Lazuli', file: 'Lapis-Lazuli', tint: '#23459c' },
  { value: 'moonstone', name: 'Moonstone', file: 'Moonstone', tint: '#cfd8e6' },
  { value: 'morganite', name: 'Morganite', file: 'Morganite', tint: '#f0a58d' },
  { value: 'opal', name: 'Opal', file: 'Opal', tint: '#4d6fa3' },
  { value: 'peridot', name: 'Peridot', file: 'Peridot', tint: '#a8c62a' },
  { value: 'quartz', name: 'Quartz', file: 'Quartz', tint: '#7b4fc4' },
  { value: 'ruby', name: 'Ruby', file: 'Ruby', tint: '#c2153a' },
  { value: 'sapphire', name: 'Sapphire', file: 'Sapphire', tint: '#1e4fd1' },
  { value: 'sphene', name: 'Sphene', file: 'Sphene', tint: '#b8b92c' },
  { value: 'spinel', name: 'Spinel', file: 'Spinel', tint: '#d12a63' },
  { value: 'tanzanite', name: 'Tanzanite', file: 'Tanzanite', tint: '#3a3fc2' },
  { value: 'topaz', name: 'Topaz', file: 'Topaz', tint: '#2a8fe6' },
  { value: 'tourmaline', name: 'Tourmaline', file: 'Tourmaline', tint: '#2f9a6b' },
  { value: 'zircon', name: 'Zircon', file: 'Zircon', tint: '#2bb3d9' },
];

export function quoteGemstoneImageUrl(gem: QuoteGemstone): string {
  return `${V3_GEMSTONE_IMAGE_BASE}/${gem.file}.webp`;
}

export function findQuoteGemstone(value: string | null | undefined): QuoteGemstone | undefined {
  return value ? QUOTE_GEMSTONES.find(g => g.value === value) : undefined;
}

/** Customer-facing name for a stored gemstone value (falls back to the raw value). */
export function quoteGemstoneLabel(value: string | null | undefined): string {
  return findQuoteGemstone(value)?.name ?? value ?? '';
}
