/**
 * Ring-metal karat / purity variants for the Quote Estimator (DTT) form.
 *
 * Each top-level metal option (`ring_metal_options.option_value`) carries a
 * fixed list of variants. Clients can enable/disable each variant and set a
 * per-variant price in Configure → Options → Ring Metal; those overrides live
 * in `client_dtt_form_config.form_content.metalKarats`, keyed
 * `{ [metalValue]: { [karatValue]: { enabled?, price? } } }`. Anything not
 * overridden falls back to the defaults below, so existing clients see every
 * variant enabled at the default price without any data migration.
 */

export interface MetalKaratVariant {
  /** Stable slug stored on the lead (`diamond_form_leads.diamond_metal_karat`). */
  value: string;
  /** Label shown to the customer and in the dashboard. */
  name: string;
  /** Default add-on price (USD) — clients can override per variant. */
  price: number;
}

export interface MetalKaratOverride {
  enabled?: boolean;
  price?: number;
}

/** `form_content.metalKarats` shape: metal value → karat value → override. */
export type MetalKaratsConfig = Record<string, Record<string, MetalKaratOverride>>;

/** Resolved variant after merging client overrides onto the defaults. */
export interface ResolvedMetalKarat extends MetalKaratVariant {
  enabled: boolean;
}

// 14K is the baseline at $200; every step above adds $200 (18K $400, 20K $600,
// 22K $800, 24K $1,000). 10K / 12K sit below the baseline.
const GOLD_KARATS: MetalKaratVariant[] = [
  { value: '10k', name: '10K', price: 0 },
  { value: '12k', name: '12K', price: 100 },
  { value: '14k', name: '14K', price: 200 },
  { value: '18k', name: '18K', price: 400 },
  { value: '20k', name: '20K', price: 600 },
  { value: '22k', name: '22K', price: 800 },
  { value: '24k', name: '24K', price: 1000 },
];

const SILVER_VARIANTS: MetalKaratVariant[] = [
  { value: '925-sterling', name: '925 Sterling Silver', price: 0 },
  { value: '999-silver', name: '999 Silver', price: 0 },
  { value: '958-silver', name: '958 Silver', price: 0 },
  { value: '900-silver', name: '900 Silver', price: 0 },
];

const PLATINUM_VARIANTS: MetalKaratVariant[] = [
  { value: 'pt950', name: 'Pt950', price: 500 },
  { value: 'pt900', name: 'Pt900', price: 500 },
  { value: 'pt850', name: 'Pt850', price: 500 },
  { value: 'pt999', name: 'Pt999', price: 500 },
];

/** Default variants per `ring_metal_options.option_value`. */
export const DEFAULT_METAL_KARATS: Record<string, MetalKaratVariant[]> = {
  'yellow-gold': GOLD_KARATS,
  'white-gold': GOLD_KARATS,
  'rose-gold': GOLD_KARATS,
  // Two Tone is a combination of the gold colours above, so it shares the
  // same karat list (the karat applies to both gold parts).
  'two-tone': GOLD_KARATS,
  silver: SILVER_VARIANTS,
  platinum: PLATINUM_VARIANTS,
};

/** Every variant for a metal (enabled or not), with client overrides applied. */
export function getMetalKaratVariants(
  metalValue: string | null | undefined,
  config?: MetalKaratsConfig | null,
): ResolvedMetalKarat[] {
  if (!metalValue) return [];
  const defaults = DEFAULT_METAL_KARATS[metalValue];
  if (!defaults) return [];
  const overrides = config?.[metalValue] ?? {};
  return defaults.map((v) => {
    const o = overrides[v.value] ?? {};
    const price = typeof o.price === 'number' && Number.isFinite(o.price) && o.price >= 0 ? o.price : v.price;
    return { ...v, price, enabled: o.enabled !== false };
  });
}

/** Only the variants the client has left enabled — what the customer sees. */
export function getEnabledMetalKaratVariants(
  metalValue: string | null | undefined,
  config?: MetalKaratsConfig | null,
): ResolvedMetalKarat[] {
  return getMetalKaratVariants(metalValue, config).filter((v) => v.enabled);
}

/** Resolve one selected variant (name + effective price) for summaries/leads. */
export function findMetalKarat(
  metalValue: string | null | undefined,
  karatValue: string | null | undefined,
  config?: MetalKaratsConfig | null,
): ResolvedMetalKarat | undefined {
  if (!karatValue) return undefined;
  return getMetalKaratVariants(metalValue, config).find((v) => v.value === karatValue);
}

/* ------------------------------------------------------------------------ */
/* Two Tone: which two metals are combined (shown before the karat choice).  */
/* ------------------------------------------------------------------------ */

export interface TwoToneCombo {
  /** Stable slug stored on the lead (`diamond_form_leads.diamond_two_tone_metals`). */
  value: string;
  /** Label shown to the customer and in the dashboard. */
  name: string;
  /**
   * Fallback add-on price (USD) when no metal prices are supplied. In
   * practice the default is derived from the two metals' configured prices
   * (see `getTwoToneCombos`), and clients can still override per combination.
   */
  price: number;
  /** The two metal option values, used to draw the colour swatches. */
  parts: [string, string];
}

/** Effective price per `ring_metal_options.option_value` for one client. */
export type MetalPriceMap = Record<string, number>;

/**
 * Default price of a combination = the two metals' configured prices added
 * together (e.g. Yellow Gold $200 + White Gold $400 = $600). A metal with no
 * price contributes $0.
 */
function derivedComboPrice(combo: TwoToneCombo, metalPrices?: MetalPriceMap | null): number {
  if (!metalPrices) return combo.price;
  return combo.parts.reduce((sum, part) => {
    const p = metalPrices[part];
    return sum + (typeof p === 'number' && Number.isFinite(p) ? p : 0);
  }, 0);
}

/** `form_content.twoToneCombos` shape: combo value → override. */
export type TwoToneCombosConfig = Record<string, MetalKaratOverride>;

export interface ResolvedTwoToneCombo extends TwoToneCombo {
  enabled: boolean;
}

// Default combination price is $0 — the karat add-on still applies on top.
export const DEFAULT_TWO_TONE_COMBOS: TwoToneCombo[] = [
  { value: 'yellow-white', name: 'Yellow Gold + White Gold', price: 0, parts: ['yellow-gold', 'white-gold'] },
  { value: 'yellow-rose', name: 'Yellow Gold + Rose Gold', price: 0, parts: ['yellow-gold', 'rose-gold'] },
  { value: 'white-rose', name: 'White Gold + Rose Gold', price: 0, parts: ['white-gold', 'rose-gold'] },
  { value: 'yellow-platinum', name: 'Yellow Gold + Platinum', price: 0, parts: ['yellow-gold', 'platinum'] },
  { value: 'rose-platinum', name: 'Rose Gold + Platinum', price: 0, parts: ['rose-gold', 'platinum'] },
];

/**
 * Every Two Tone combination (enabled or not) with client overrides applied.
 * Pass the client's metal prices so un-overridden combinations default to the
 * sum of their two metals' prices.
 */
export function getTwoToneCombos(
  config?: TwoToneCombosConfig | null,
  metalPrices?: MetalPriceMap | null,
): ResolvedTwoToneCombo[] {
  return DEFAULT_TWO_TONE_COMBOS.map((c) => {
    const o = config?.[c.value] ?? {};
    const price = typeof o.price === 'number' && Number.isFinite(o.price) && o.price >= 0
      ? o.price
      : derivedComboPrice(c, metalPrices);
    return { ...c, price, enabled: o.enabled !== false };
  });
}

/** Only the combinations the client has left enabled — what the customer sees. */
export function getEnabledTwoToneCombos(
  config?: TwoToneCombosConfig | null,
  metalPrices?: MetalPriceMap | null,
): ResolvedTwoToneCombo[] {
  return getTwoToneCombos(config, metalPrices).filter((c) => c.enabled);
}

/** Resolve one selected combination (name + effective price) for summaries/leads. */
export function findTwoToneCombo(
  comboValue: string | null | undefined,
  config?: TwoToneCombosConfig | null,
  metalPrices?: MetalPriceMap | null,
): ResolvedTwoToneCombo | undefined {
  if (!comboValue) return undefined;
  return getTwoToneCombos(config, metalPrices).find((c) => c.value === comboValue);
}

/**
 * Keep only overrides that differ from the derived defaults (see
 * `cleanMetalKaratsConfig`). A price equal to the current derived default is
 * dropped so the combination keeps following the metal prices.
 */
export function cleanTwoToneCombosConfig(
  config?: TwoToneCombosConfig | null,
  metalPrices?: MetalPriceMap | null,
): TwoToneCombosConfig | undefined {
  if (!config) return undefined;
  const out: TwoToneCombosConfig = {};
  for (const [combo, o] of Object.entries(config)) {
    const def = DEFAULT_TWO_TONE_COMBOS.find((c) => c.value === combo);
    if (!def || !o) continue;
    const entry: MetalKaratOverride = {};
    if (o.enabled === false) entry.enabled = false;
    const derived = derivedComboPrice(def, metalPrices);
    if (typeof o.price === 'number' && Number.isFinite(o.price) && o.price >= 0 && o.price !== derived) entry.price = o.price;
    if (Object.keys(entry).length) out[combo] = entry;
  }
  return Object.keys(out).length ? out : undefined;
}

/** Build a `MetalPriceMap` from option rows (`option_value` + effective `price`). */
export function toMetalPriceMap(
  options: ReadonlyArray<{ option_value: string; price: number | string | null | undefined }>,
): MetalPriceMap {
  const map: MetalPriceMap = {};
  for (const o of options) map[o.option_value] = Number(o.price ?? 0) || 0;
  return map;
}

/**
 * Strip a client's karat config down to real deviations from the defaults so
 * `form_content` only stores what was actually changed. Returns `undefined`
 * when nothing differs.
 */
export function cleanMetalKaratsConfig(config?: MetalKaratsConfig | null): MetalKaratsConfig | undefined {
  if (!config) return undefined;
  const out: MetalKaratsConfig = {};
  for (const [metal, karats] of Object.entries(config)) {
    const defaults = DEFAULT_METAL_KARATS[metal];
    if (!defaults || !karats) continue;
    for (const [karat, o] of Object.entries(karats)) {
      const def = defaults.find((v) => v.value === karat);
      if (!def || !o) continue;
      const entry: MetalKaratOverride = {};
      if (o.enabled === false) entry.enabled = false;
      if (typeof o.price === 'number' && Number.isFinite(o.price) && o.price >= 0 && o.price !== def.price) entry.price = o.price;
      if (Object.keys(entry).length) (out[metal] ??= {})[karat] = entry;
    }
  }
  return Object.keys(out).length ? out : undefined;
}
