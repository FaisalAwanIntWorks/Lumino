/**
 * Quote Estimator V3 gemstone picker.
 *
 * After the "Pick your gemstone" cards (Ruby, Sapphire, Beryl, …) the next
 * screen lists the real stones of that gemstone from the JewlX gemstone pool
 * (Admin -> Gemstone Pool, the weekly Nivoda gemstone CSV) as product cards:
 * picture, carat, colour, cut, origin, treatment, lab, measurements and
 * price. The customer sorts by price, chooses how many cards to show per page
 * and pages through the rest; the picked stone travels on the lead as
 * `selected_gemstone`, on the quote and in both emails.
 *
 * Settings live in `form_content.gemstonePicker` of the V3 settings record;
 * the `get_quote_estimator_gemstones` RPC reads the markup server-side, so the
 * browser never sends prices.
 */
import type { DttFormContent } from '@/hooks/useClientDttFormConfig';
import { findQuoteGemstone } from '@/lib/quote-v3-gemstones';

export type QuoteGemstoneSort = 'low_to_high' | 'high_to_low';

export interface QuoteGemstonePickerConfig {
  /** Off skips the stone list: the gemstone card alone is the answer (first-release behaviour). */
  enabled?: boolean;
  /** Cards per page the list opens with (the customer can change it). */
  pageSize?: number;
  /** Markup % on pool prices. */
  markupPercent?: number;
  /** Price order the list opens with (the customer can change it). */
  defaultSort?: QuoteGemstoneSort;
}

export const QUOTE_GEMSTONE_PAGE_SIZES: readonly number[] = [10, 20, 30, 50];

export const QUOTE_GEMSTONE_PICKER_DEFAULTS = {
  enabled: true,
  pageSize: 10,
  markupPercent: 0,
  defaultSort: 'low_to_high' as QuoteGemstoneSort,
} as const;

export interface ResolvedQuoteGemstonePickerConfig {
  enabled: boolean;
  pageSize: number;
  markupPercent: number;
  defaultSort: QuoteGemstoneSort;
}

const clampPageSize = (n: unknown) => {
  const v = typeof n === 'number' && Number.isFinite(n) ? Math.round(n) : QUOTE_GEMSTONE_PICKER_DEFAULTS.pageSize;
  return Math.max(1, Math.min(100, v));
};

export function resolveQuoteGemstonePickerConfig(content?: DttFormContent | null): ResolvedQuoteGemstonePickerConfig {
  const c = content?.gemstonePicker || {};
  return {
    enabled: c.enabled !== false,
    pageSize: clampPageSize(c.pageSize),
    markupPercent: typeof c.markupPercent === 'number' && Number.isFinite(c.markupPercent) ? Math.max(0, c.markupPercent) : QUOTE_GEMSTONE_PICKER_DEFAULTS.markupPercent,
    defaultSort: c.defaultSort === 'high_to_low' ? 'high_to_low' : 'low_to_high',
  };
}

/**
 * Pool gemType ("LAPIS LAZULI", "Spinel") -> V3 gemstone card value
 * ("lapis-lazuli", "spinel"). Same rule as the SQL gemstone_type_key().
 */
export function gemstoneTypeKey(gemType: string | null | undefined): string {
  return String(gemType ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

/** One stone as returned by get_quote_estimator_gemstones. */
export interface QuoteEstimatorGemstone {
  pool_id: string;
  gem_key: string;
  gem_type: string;
  carats: number | null;
  color: string | null;
  color_shade: string | null;
  clarity: string | null;
  cut: string | null;
  shape: string | null;
  lab: string | null;
  treatment: string | null;
  mine_of_origin: string | null;
  length: number | null;
  width: number | null;
  price: number;
  price_per_carat: number | null;
  image: string | null;
  video: string | null;
  pdf_url: string | null;
  report_no: string | null;
  stock_id: string | null;
  total_count: number;
}

/** The stone a customer picked, stored on the lead as `selected_gemstone`. */
export interface QuoteSelectedGemstone {
  poolId: string;
  gemKey: string;
  gemType: string;
  carat: number | null;
  color: string | null;
  colorShade: string | null;
  clarity: string | null;
  cut: string | null;
  shape: string | null;
  lab: string | null;
  treatment: string | null;
  origin: string | null;
  length: number | null;
  width: number | null;
  price: number;
  image: string | null;
  video: string | null;
  pdf: string | null;
  reportNo: string | null;
  stockId: string | null;
}

const num = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};

export function toSelectedGemstone(g: QuoteEstimatorGemstone): QuoteSelectedGemstone {
  return {
    poolId: g.pool_id,
    gemKey: g.gem_key,
    gemType: g.gem_type,
    carat: num(g.carats),
    color: g.color || null,
    colorShade: g.color_shade || null,
    clarity: g.clarity || null,
    cut: g.cut || null,
    shape: g.shape || null,
    lab: g.lab || null,
    treatment: g.treatment || null,
    origin: g.mine_of_origin || null,
    length: num(g.length),
    width: num(g.width),
    price: Number(g.price),
    image: g.image || null,
    video: g.video || null,
    pdf: g.pdf_url || null,
    reportNo: g.report_no || null,
    stockId: g.stock_id || null,
  };
}

/** "Sapphire" from the pool gemType, via the V3 card name when there is one. */
export function gemstoneDisplayName(g: Pick<QuoteSelectedGemstone, 'gemKey' | 'gemType'>): string {
  return findQuoteGemstone(g.gemKey)?.name ?? titleCase(g.gemType);
}

/** Readable form of an upper-case pool value ("MEDIUM BLUE" -> "Medium Blue", "SRILANKA" -> "Srilanka"). */
export function titleCase(value: string | null | undefined): string {
  return String(value ?? '')
    .toLowerCase()
    .split(/(\s+|_|-)/)
    .map(part => (/^[a-z]/.test(part) ? part[0].toUpperCase() + part.slice(1) : part))
    .join('')
    .replace(/_/g, ' ');
}

/** "1.83 ct Blue Aquamarine · Emerald · Faceted" */
export function formatQuoteGemstoneLabel(g: Pick<QuoteSelectedGemstone, 'gemKey' | 'gemType' | 'carat' | 'color' | 'shape' | 'cut'>): string {
  const carat = g.carat !== null && Number.isFinite(g.carat) ? `${Number(g.carat.toFixed(2))} ct` : '';
  const stone = [titleCase(g.color), gemstoneDisplayName(g)].filter(Boolean).join(' ');
  return [[carat, stone].filter(Boolean).join(' '), titleCase(g.shape), titleCase(g.cut)].filter(Boolean).join(' · ');
}

/** "6.98 × 6.01 mm" */
export function formatQuoteGemstoneMeasurements(g: Pick<QuoteSelectedGemstone, 'length' | 'width'>): string {
  const parts = [g.length, g.width].filter((v): v is number => v !== null && Number.isFinite(v)).map(v => Number(v.toFixed(2)));
  return parts.length ? `${parts.join(' × ')} mm` : '';
}

/** Label → value rows for the quote, the lead note, the lead view and both emails (empty values dropped). */
export function quoteGemstoneDetailRows(g: QuoteSelectedGemstone): { label: string; value: string }[] {
  const rows: { label: string; value: string }[] = [
    { label: 'Gemstone', value: gemstoneDisplayName(g) },
    { label: 'Carat', value: g.carat !== null && Number.isFinite(g.carat) ? `${Number(g.carat.toFixed(2))} ct` : '' },
    { label: 'Color', value: [titleCase(g.color), g.colorShade ? `(${titleCase(g.colorShade)})` : ''].filter(Boolean).join(' ') },
    { label: 'Clarity', value: g.clarity ?? '' },
    { label: 'Shape', value: titleCase(g.shape) },
    { label: 'Cut', value: titleCase(g.cut) },
    { label: 'Origin', value: titleCase(g.origin) },
    { label: 'Treatment', value: titleCase(g.treatment) },
    { label: 'Lab', value: g.lab && g.lab.toUpperCase() !== 'NONE' ? g.lab : '' },
    { label: 'Measurements', value: formatQuoteGemstoneMeasurements(g) },
    { label: 'Report No', value: g.reportNo ?? '' },
    { label: 'Stock ID', value: g.stockId ?? '' },
  ];
  return rows.filter(r => r.value && r.value.trim());
}

export const formatQuoteGemstonePrice = (price: number, currency: string) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(price);
