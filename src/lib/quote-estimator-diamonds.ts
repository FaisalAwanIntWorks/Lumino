/**
 * Quote Estimator "mini Nivoda" diamond picker.
 *
 * Allowlisted accounts only for now: after Natural / Lab, shape and carat
 * size, the Quality step offers real stones with Colour / Clarity filters,
 * like the Ring OS Stone step. The stones always come from the complete Aurezo
 * diamond pool — never from a client's Ring OS catalogue — narrowed by the
 * Quote Estimator's own "Diamond Configuration" (same options as the Ring OS
 * catalogue screen) and priced with its own Natural / Lab markup.
 *
 * Settings live in `form_content.diamondPicker` of each version's settings
 * record (V1 / V2 / V3 on the Sandbox lab); the `get_quote_estimator_diamonds`
 * RPC reads them server-side, so the browser never sends prices or filters.
 */
import type { DttFormContent } from '@/hooks/useClientDttFormConfig';
import { isGlassQuoteEstimator } from '@/lib/quote-estimator-theme';

/**
 * Same keys as the Ring OS catalogue filter (`client_diamond_catalog_filter.filter`)
 * so the shared SQL matcher applies. Only restrictions are stored; a missing
 * key means "everything in stock".
 */
export interface QuoteDiamondCatalogFilter {
  stoneTypes?: string[];
  shapes?: string[];
  colors?: string[];
  clarities?: string[];
  cuts?: string[];
  polish?: string[];
  symmetry?: string[];
  fluorescence?: string[];
  labs?: string[];
  caratMin?: string;
  caratMax?: string;
  caratRanges?: number[];
  lengthMin?: string;
  lengthMax?: string;
  canadianOnly?: boolean;
  priceMinNatural?: number;
  priceMaxNatural?: number;
  priceMinLab?: number;
  priceMaxLab?: number;
  priceSort?: 'high_to_low' | 'low_to_high';
}

export interface QuoteDiamondPickerConfig {
  /** Off switches the Quality step back to the classic quality cards. */
  enabled?: boolean;
  /** How many stones are listed. */
  limit?: number;
  /** Which pool stones may be offered (Diamond Configuration tab). */
  filter?: QuoteDiamondCatalogFilter;
  /** Markup % on natural pool prices. */
  markupNatural?: number;
  /** Markup % on lab pool prices. */
  markupLab?: number;
  /** @deprecated first release: colour list, now `filter.colors`. */
  colors?: string[];
  /** @deprecated first release: clarity list, now `filter.clarities`. */
  clarities?: string[];
  /** @deprecated first release: single markup, now markupNatural / markupLab. */
  markupPercent?: number;
}

export const QUOTE_DIAMOND_PICKER_DEFAULTS = {
  enabled: true,
  limit: 12,
  markupNatural: 0,
  markupLab: 0,
} as const;

export const QUOTE_DIAMOND_LIMIT_MIN = 1;
export const QUOTE_DIAMOND_LIMIT_MAX = 50;

/** GIA grade order so lists read best -> lowest, not alphabetically. */
export const DIAMOND_COLOR_ORDER = ['D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z'];
export const DIAMOND_CLARITY_ORDER = ['FL', 'IF', 'VVS1', 'VVS2', 'VS1', 'VS2', 'SI1', 'SI2', 'SI3', 'I1', 'I2', 'I3'];

export const normalizeGrade = (value?: string | null) => String(value ?? '').trim().toUpperCase();

export function sortByGradeOrder(values: string[], order: string[]): string[] {
  return [...values].sort((a, b) => {
    const ia = order.indexOf(a);
    const ib = order.indexOf(b);
    if (ia !== -1 && ib !== -1) return ia - ib;
    if (ia !== -1) return -1;
    if (ib !== -1) return 1;
    return a.localeCompare(b);
  });
}

/** Resolved settings with every default filled in. */
export interface ResolvedQuoteDiamondPickerConfig {
  enabled: boolean;
  limit: number;
  filter: QuoteDiamondCatalogFilter;
  markupNatural: number;
  markupLab: number;
}

const clampLimit = (n: unknown) => {
  const v = typeof n === 'number' && Number.isFinite(n) ? Math.round(n) : QUOTE_DIAMOND_PICKER_DEFAULTS.limit;
  return Math.max(QUOTE_DIAMOND_LIMIT_MIN, Math.min(QUOTE_DIAMOND_LIMIT_MAX, v));
};
const pct = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, v) : fallback);

export function resolveQuoteDiamondPickerConfig(content?: DttFormContent | null): ResolvedQuoteDiamondPickerConfig {
  const c = content?.diamondPicker || {};
  const grades = (list: unknown) => Array.isArray(list) ? list.map(normalizeGrade).filter(Boolean) : [];
  let filter: QuoteDiamondCatalogFilter = c.filter && typeof c.filter === 'object' ? { ...c.filter } : {};
  // First-release keys keep working until the account saves the new configuration.
  if (!c.filter) {
    const colors = grades(c.colors);
    const clarities = grades(c.clarities);
    if (colors.length) filter = { ...filter, colors };
    if (clarities.length) filter = { ...filter, clarities };
  }
  const legacyMarkup = pct(c.markupPercent, 0);
  return {
    enabled: c.enabled !== false,
    limit: clampLimit(c.limit),
    filter,
    markupNatural: pct(c.markupNatural, legacyMarkup),
    markupLab: pct(c.markupLab, legacyMarkup),
  };
}

/**
 * Accounts allowed to use the diamond picker (explicit allowlist until the
 * general roll-out): the Sandbox lab and the "fsl" account
 * (faisal914awan@gmail.com, company "fbe"). Nothing else about those accounts
 * changes — the Sandbox-lab versioning stays tied to isGlassQuoteEstimator.
 */
export const QUOTE_DIAMOND_PICKER_CLIENTS: readonly string[] = [
  'dcd952fc-783b-4a92-be7f-62751265c650', // Sandbox · Aurezo
  '9d43af60-4e42-4b48-ac9a-b0fa9e608385', // fsl / fbe · faisal914awan@gmail.com
];

export function isQuoteDiamondPickerClient(clientId?: string | null): boolean {
  return (!!clientId && QUOTE_DIAMOND_PICKER_CLIENTS.includes(clientId)) || isGlassQuoteEstimator(clientId);
}

/** True when this account's Quote Estimator replaces the quality cards with the stone list. */
export function isQuoteDiamondPickerEnabled(clientId: string | null | undefined, content?: DttFormContent | null): boolean {
  return isQuoteDiamondPickerClient(clientId) && resolveQuoteDiamondPickerConfig(content).enabled;
}

/** One stone as returned by get_quote_estimator_diamonds. */
export interface QuoteEstimatorDiamond {
  pool_id: string | null;
  stone_type: string;
  shape_id: string | null;
  carat_value: number;
  color: string;
  clarity: string;
  price: number;
  report_no: string | null;
  lab: string | null;
  pdf: string | null;
  source: 'catalog' | 'pool';
}

/** The stone a customer picked, stored on the lead as `selected_diamond`. */
export interface QuoteSelectedDiamond {
  poolId: string | null;
  stoneType: string;
  shapeId: string | null;
  carat: number;
  color: string;
  clarity: string;
  price: number;
  reportNo: string | null;
  lab: string | null;
  pdf: string | null;
  source: 'catalog' | 'pool';
}

export function toSelectedDiamond(d: QuoteEstimatorDiamond): QuoteSelectedDiamond {
  return {
    poolId: d.pool_id,
    stoneType: d.stone_type,
    shapeId: d.shape_id,
    carat: Number(d.carat_value),
    color: normalizeGrade(d.color),
    clarity: normalizeGrade(d.clarity),
    price: Number(d.price),
    reportNo: d.report_no || null,
    lab: d.lab || null,
    pdf: d.pdf || null,
    source: d.source,
  };
}

/** "1.51 ct L Color VS1" */
export function formatQuoteDiamondLabel(d: Pick<QuoteSelectedDiamond, 'carat' | 'color' | 'clarity'>): string {
  const carat = Number.isFinite(d.carat) ? `${Number(d.carat.toFixed(2))} ct` : '';
  return [carat, d.color ? `${d.color} Color` : '', d.clarity].filter(Boolean).join(' ');
}

/** "GIA 1234567890" — the certificate line for emails and the lead view. */
export function formatQuoteDiamondCertificate(d: Pick<QuoteSelectedDiamond, 'lab' | 'reportNo'>): string {
  return [d.lab, d.reportNo].filter(Boolean).join(' ');
}

/** Value stored in `diamond_quality` when an exact stone replaces the quality card. */
export function quoteDiamondQualityValue(d: Pick<QuoteSelectedDiamond, 'color' | 'clarity'>): string {
  return `${d.color} Color, ${d.clarity} Clarity`;
}

/**
 * Carat window for a Quote Estimator size option ("1ct", "1.5ct", "5ct+").
 * Same half-carat buckets Ring OS uses; "5ct+" is open-ended.
 */
export function quoteSizeToCaratWindow(size: string | null | undefined): { min: number | null; max: number | null } {
  const m = /^(\d+(?:\.\d+)?)\s*ct(\+)?$/i.exec(String(size ?? '').trim());
  if (!m) return { min: null, max: null };
  const start = Number(m[1]);
  if (!Number.isFinite(start)) return { min: null, max: null };
  if (m[2]) return { min: start, max: null };
  return { min: start, max: Number((start + 0.49).toFixed(2)) };
}

/**
 * Quote Estimator shape option -> pool shape id (first word of the pool's
 * shape, lower-case). Fancy cuts with no pool equivalent return null, which
 * lists every shape instead of nothing.
 */
const SHAPE_TO_POOL: Record<string, string> = {
  round: 'round',
  oval: 'oval',
  cushion: 'cushion',
  radiant: 'radiant',
  emerald: 'emerald',
  marquise: 'marquise',
  'dutch-marquise': 'marquise',
  pear: 'pear',
  princess: 'princess',
  asscher: 'asscher',
  heart: 'heart',
  // Pool shape ids are the first word of the pool's shape ("OLD MINER" -> old,
  // "EUROPEAN CUT" -> european, "ROSE CUT" -> rose, "SQUARE EMERALD" -> square).
  'old-mine': 'old',
  'old-miner': 'old',
  'european-cut': 'european',
  'rose-cut': 'rose',
  'square-emerald': 'square',
  'square-radiant': 'square',
  moval: 'oval',
};
export function quoteShapeToPoolShape(shape: string | null | undefined): string | null {
  if (!shape) return null;
  return SHAPE_TO_POOL[shape] ?? null;
}

export const formatQuoteDiamondPrice = (price: number, currency: string) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(price);
