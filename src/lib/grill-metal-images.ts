import { ASSET_CDN } from "@/lib/asset-cdn";
// Shared grillz metal image map.
// Source of truth for both the customer widget (GrillBuilderForm) and the
// admin Grillz configurator preview (GrillStepEditor). Keep these constants
// in sync with the customer widget so admin previews always match what the
// customer sees.

const GRILLZ_CDN = `${ASSET_CDN.main}/GrillzBuilder`;

export const GRILLZ_BASIC_IMAGES: Record<string, string> = {
  gold: `${GRILLZ_CDN}/Transparent-Gold+Grillz+without+mold.png`,
  silver: `${GRILLZ_CDN}/Transparent-Silver+grillz+without+mold.png`,
  white: `${GRILLZ_CDN}/Transparent-Silver+grillz+without+mold.png`,
  rose: `${GRILLZ_CDN}/Transparent+Rose+gold+grillz+without+mold+updated.png`,
};

export const GRILLZ_ICED_IMAGES: Record<string, string> = {
  gold: `${GRILLZ_CDN}/Iced-out+Transparent-Gold+Diamond+Grillz+without+mold.png`,
  silver: `${GRILLZ_CDN}/Iced-out+Transparent-Diamond+silver+grillz+without+mold.png`,
  white: `${GRILLZ_CDN}/Iced-out+Transparent-Diamond+silver+grillz+without+mold.png`,
  rose: `${GRILLZ_CDN}/Iced-out+Transparent-Diamond+Rose+Gold+Grillz+without+mold.png`,
};

export type GrillzVariant = 'basic' | 'iced-out';

/** Canonical master metal values shipped with the Grillz builder. */
export const MASTER_GRILL_METAL_VALUES = new Set<string>(['gold', 'silver', 'rose-gold', 'black']);

export function isMasterGrillMetal(metalValue: string): boolean {
  return MASTER_GRILL_METAL_VALUES.has(metalValue);
}

/**
 * Resolves a metal value to its master family ONLY for known master metals.
 * Returns null for anything else (custom metals must use an uploaded override).
 */
export function getGrillMetalFamily(metalValue: string): 'gold' | 'silver' | 'rose' | 'black' | null {
  const v = metalValue.toLowerCase();
  if (v === 'gold') return 'gold';
  if (v === 'silver') return 'silver';
  if (v === 'rose-gold' || v === 'rose_gold') return 'rose';
  if (v === 'black') return 'black';
  return null;
}

/**
 * Returns the master image URL for a known master metal, or undefined for
 * custom metals. Callers must handle the undefined case (use override or
 * a neutral placeholder) — we never silently borrow another metal's image.
 */
export function getGrillMetalImage(metalValue: string, variant: GrillzVariant = 'basic'): string | undefined {
  const family = getGrillMetalFamily(metalValue);
  if (!family) return undefined;
  const images = variant === 'iced-out' ? GRILLZ_ICED_IMAGES : GRILLZ_BASIC_IMAGES;
  // Map 'rose' → key, 'black' has no master image yet
  const key = family === 'rose' ? 'rose' : family;
  return images[key];
}

// ---------------------------------------------------------------------------
// Grillz Type step options
// ---------------------------------------------------------------------------

export interface GrillTypeOption {
  value: string;
  label: string;
  is_enabled: boolean;
  is_custom: boolean;
}

/** The two options that shipped with the Grillz builder. Never deletable. */
export const BUILTIN_GRILL_TYPE_VALUES = ['basic', 'iced-out'] as const;

export const DEFAULT_GRILL_TYPE_OPTIONS: GrillTypeOption[] = [
  { value: 'basic', label: 'Plain', is_enabled: true, is_custom: false },
  { value: 'iced-out', label: 'Iced Out', is_enabled: true, is_custom: false },
];

function isGrillTypeOption(v: any): v is GrillTypeOption {
  return !!v && typeof v.value === 'string' && typeof v.label === 'string';
}

/**
 * Normalises the stored `grill_type_options` value. Falls back to the two
 * built-in options when the client has never configured this step, so existing
 * Grillz forms behave exactly as before.
 */
export function resolveGrillTypeOptions(raw: unknown): GrillTypeOption[] {
  const list = Array.isArray(raw) ? raw.filter(isGrillTypeOption) : [];
  const normalised: GrillTypeOption[] = list.map(o => ({
    value: o.value,
    label: o.label,
    is_enabled: o.is_enabled !== false,
    is_custom: o.is_custom === true || !(BUILTIN_GRILL_TYPE_VALUES as readonly string[]).includes(o.value),
  }));
  // Built-ins are never lost, even if an older payload omitted them.
  for (const builtin of DEFAULT_GRILL_TYPE_OPTIONS) {
    if (!normalised.some(o => o.value === builtin.value)) normalised.push({ ...builtin });
  }
  return normalised.length ? normalised : DEFAULT_GRILL_TYPE_OPTIONS.map(o => ({ ...o }));
}

/**
 * Human label for a stored `grillz_type` lead value. New leads already store
 * the label; legacy leads store `basic` / `iced-out`.
 */
export function resolveGrillTypeLabel(value?: string | null, options?: GrillTypeOption[] | null): string {
  if (!value) return '';
  const match = options?.find(o => o.value === value);
  if (match) return match.label;
  if (value === 'basic') return 'Plain';
  if (value === 'iced-out') return 'Iced Out';
  return value;
}

/**
 * Only the built-in "Iced Out" option uses the iced master imagery. Custom
 * type options always fall back to the plain (basic) metal images.
 */
export function variantForGrillType(grillzType?: string | null): GrillzVariant {
  return grillzType === 'iced-out' ? 'iced-out' : 'basic';
}

/** Sorts metals by a persisted order array; unknown values keep their relative position at the end. */
export function sortByMetalOrder<T extends { value: string }>(items: T[], order?: string[] | null): T[] {
  if (!order || order.length === 0) return items;
  const index = new Map(order.map((v, i) => [v, i]));
  return [...items].sort((a, b) => {
    const ai = index.has(a.value) ? index.get(a.value)! : Number.MAX_SAFE_INTEGER;
    const bi = index.has(b.value) ? index.get(b.value)! : Number.MAX_SAFE_INTEGER;
    if (ai === bi) return 0;
    return ai - bi;
  });
}


// ---------------------------------------------------------------------------
// Per-Grillz-Type metal image overrides
// ---------------------------------------------------------------------------

/**
 * Namespaced `option_image_overrides` step key holding metal images for one
 * Grillz Type. The legacy, un-namespaced `metal` key remains as the shared
 * fallback so existing client uploads keep working for every type.
 */
export function metalOverrideStepKey(grillzType?: string | null): string {
  const v = (grillzType || 'basic').trim();
  return `metal__${v}`;
}

/**
 * Resolves the image for a metal card, taking the selected Grillz Type into
 * account. Order: per-type client image → legacy shared client image →
 * master CDN image (iced masters only for the built-in "Iced Out") →
 * undefined (caller renders a neutral placeholder / colour swatch).
 */
export function resolveGrillMetalImage(opts: {
  metalValue: string;
  grillzType?: string | null;
  overrides?: Record<string, Record<string, string>> | null;
}): string | undefined {
  const { metalValue, grillzType, overrides } = opts;
  const perType = overrides?.[metalOverrideStepKey(grillzType)]?.[metalValue];
  if (perType) return perType;
  const legacy = overrides?.metal?.[metalValue];
  if (legacy) return legacy;
  if (!isMasterGrillMetal(metalValue)) return undefined;
  return getGrillMetalImage(metalValue, variantForGrillType(grillzType));
}
