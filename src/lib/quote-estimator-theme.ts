/**
 * Quote Estimator — token-driven theme layer.
 *
 * Every visual value used by the glass skin (colour, corner radius, blur,
 * border, glow, type) comes from this token object. Components never hardcode
 * a colour, radius, blur or shadow — they read a token.
 *
 * Resolution order (later wins):
 *   1. Built-in defaults (identical to today's Quote Estimator look)
 *   2. The account's existing Form Colors (client_dtt_form_config.form_colors)
 *   3. The new `theme` group inside client_dtt_form_config.form_content
 *
 * Which skin renders is a per-account choice ("Theme 1 · Classic" or
 * "Theme 2 · Glass") stored in client_dtt_form_config.form_content.quoteTheme.
 * Nothing stored means Classic, so every existing account keeps today's look
 * until it picks Theme 2 in Configure. See resolveQuoteTheme() below.
 */

import type { DttFormColors } from '@/hooks/useClientDttFormConfig';
import { normalizeHex, withAlpha, getContrastText } from '@/lib/color-utils';

/**
 * Sandbox account (Aurezo): the only account with the V1 / V2 / V3 version lab
 * (separate storage per version, ?quoteVersion= test links). Its V2 is always
 * the glass skin. Every other account is a plain V2-storage account that
 * chooses its skin with the Theme setting instead.
 */
export const QUOTE_ESTIMATOR_GLASS_CLIENTS: readonly string[] = [
  'dcd952fc-783b-4a92-be7f-62751265c650',
];

/** True for the Sandbox version-lab account (kept under its historical name). */
export function isGlassQuoteEstimator(clientId?: string | null): boolean {
  return !!clientId && QUOTE_ESTIMATOR_GLASS_CLIENTS.includes(clientId);
}
export const isQuoteLabClient = isGlassQuoteEstimator;

/** Theme 1 = the classic step form; Theme 2 = the glass skin + claim screen. */
export type QuoteTheme = 'classic' | 'glass';
export const QUOTE_THEMES: readonly QuoteTheme[] = ['classic', 'glass'];
export const QUOTE_THEME_META: Record<QuoteTheme, { number: 1 | 2; label: string; title: string; description: string }> = {
  classic: { number: 1, label: 'Theme 1', title: 'Classic', description: 'The step-by-step form with the estimate summary and thank-you screen.' },
  glass: { number: 2, label: 'Theme 2', title: 'Glass', description: 'Token-driven glass skin with a unified phone field and the design-credit claim screen.' },
};
export const DEFAULT_QUOTE_THEME: QuoteTheme = 'classic';

export function isQuoteTheme(value: unknown): value is QuoteTheme {
  return typeof value === 'string' && (QUOTE_THEMES as readonly string[]).includes(value);
}

/**
 * Resolve which skin an account's Quote Estimator renders.
 *
 *  - Sandbox lab account: V2 is always glass, V1/V3 never are (unchanged).
 *  - Every other account: the saved `quoteTheme` (Classic when missing), or a
 *    `?quoteTheme=` request for the dashboard's test previews.
 */
export function resolveQuoteTheme(
  clientId: string | null | undefined,
  version: string,
  content: { quoteTheme?: string | null } | null | undefined,
  requested?: string | null,
): QuoteTheme {
  if (isGlassQuoteEstimator(clientId)) return version === 'v2' ? 'glass' : 'classic';
  if (isQuoteTheme(requested)) return requested;
  return isQuoteTheme(content?.quoteTheme) ? content.quoteTheme : DEFAULT_QUOTE_THEME;
}

/**
 * True when a dashboard theme test link (?quoteTheme=) is open on a non-lab
 * account: nothing is saved or sent, exactly like the Sandbox version links.
 */
export function isQuoteThemePreview(clientId: string | null | undefined, requested: string | null | undefined): boolean {
  return !isGlassQuoteEstimator(clientId) && isQuoteTheme(requested);
}

/** Flat design-token object. Nothing visual lives outside this shape. */
export interface QuoteEstimatorTheme {
  // Group A — already configurable today under different names
  background: string;
  tileBackground: string;
  fontColor: string;
  accentColor: string;
  highlightColor: string;
  buttonColor: string;
  buttonTextColor: string;
  inputBorderColor: string;
  borderRadius: number;
  buttonBorderRadius: number;
  fontFamilyDisplay: string;
  fontFamilyBody: string;

  // Group B — new
  mutedTextColor: string;
  surfaceColor: string;
  /** 0..1 — at 0 the card is a plain solid tile. */
  surfaceOpacity: number;
  /** px — at 0 no backdrop-filter is emitted at all. */
  surfaceBlur: number;
  borderColor: string;
  /** 0..1 — at 0 no border rule is emitted at all. */
  borderOpacity: number;
  glowColor: string;
  /** 0..1 — at 0 no glow layer is rendered. */
  glowIntensity: number;
  highlightMutedColor: string;
  errorColor: string;
  successColor: string;
}

export type QuoteEstimatorThemeOverrides = Partial<QuoteEstimatorTheme>;

/**
 * Defaults are the "Champagne" direction: light cream ground, warm ivory
 * cards, gold highlights, black primary button, serif display over a clean
 * body face. Every value is overridable per account from the configuration
 * tab — nothing here is baked into a component.
 */
export const QUOTE_ESTIMATOR_THEME_DEFAULTS: QuoteEstimatorTheme = {
  background: '#F5EFE7',
  tileBackground: '#FFFDF9',
  fontColor: '#1B1713',
  accentColor: '#A98A55',
  highlightColor: '#A9803F',
  buttonColor: '#111111',
  buttonTextColor: '#FFFFFF',
  inputBorderColor: '#E4D9C8',
  borderRadius: 18,
  // Pill button, as in the reference direction.
  buttonBorderRadius: 999,

  fontFamilyDisplay: "'Cormorant Garamond', serif",
  fontFamilyBody: "'Jost', sans-serif",

  mutedTextColor: '#7C736A',
  surfaceColor: '#FFFFFF',
  surfaceOpacity: 0.75,
  surfaceBlur: 12,
  borderColor: '#FFFFFF',
  borderOpacity: 0.55,
  glowColor: '#D9B87C',
  glowIntensity: 0.3,
  highlightMutedColor: '#8C7A62',
  errorColor: '#DC2626',
  successColor: '#15803D',
};

/**
 * Readability floor. A theme that pushes surfaceOpacity towards 0 while also
 * blurring heavily can make its own text unreadable, so once any glass effect
 * is switched on the fill never drops below this.
 */
export const MIN_GLASS_SURFACE_OPACITY = 0.12;

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
const num = (v: unknown, fallback: number) =>
  typeof v === 'number' && Number.isFinite(v) ? v : fallback;
const hex = (v: unknown, fallback: string) => normalizeHex(typeof v === 'string' ? v : null) || fallback;

/** Resolve the full token set from the account's saved settings. */
export function resolveQuoteEstimatorTheme(
  colors?: DttFormColors | null,
  overrides?: QuoteEstimatorThemeOverrides | null
): QuoteEstimatorTheme {
  const d = QUOTE_ESTIMATOR_THEME_DEFAULTS;
  const o = overrides || {};
  const c = colors || {};

  const base: QuoteEstimatorTheme = {
    ...d,
    background: hex(c.background, d.background),
    tileBackground: hex(c.imageBg, d.tileBackground),
    fontColor: hex(c.fontColor, d.fontColor),
    accentColor: hex(c.tabBorder, d.accentColor),
    highlightColor: hex(c.highlight, d.highlightColor),
    buttonColor: hex(c.submitButtonBg, d.buttonColor),
    buttonTextColor: hex(c.submitButtonText, d.buttonTextColor),
  };
  // Surface defaults to the tile colour unless the theme names its own.
  base.surfaceColor = base.tileBackground;

  const t: QuoteEstimatorTheme = {
    ...base,
    background: hex(o.background, base.background),
    tileBackground: hex(o.tileBackground, base.tileBackground),
    fontColor: hex(o.fontColor, base.fontColor),
    accentColor: hex(o.accentColor, base.accentColor),
    highlightColor: hex(o.highlightColor, base.highlightColor),
    buttonColor: hex(o.buttonColor, base.buttonColor),
    buttonTextColor: hex(o.buttonTextColor, base.buttonTextColor),
    inputBorderColor: hex(o.inputBorderColor, base.inputBorderColor),
    borderRadius: Math.max(0, num(o.borderRadius, base.borderRadius)),
    buttonBorderRadius: Math.max(0, num(o.buttonBorderRadius, base.buttonBorderRadius)),
    fontFamilyDisplay: o.fontFamilyDisplay || base.fontFamilyDisplay,
    fontFamilyBody: o.fontFamilyBody || base.fontFamilyBody,

    mutedTextColor: hex(o.mutedTextColor, base.mutedTextColor),
    surfaceColor: hex(o.surfaceColor, base.surfaceColor),
    surfaceOpacity: clamp01(num(o.surfaceOpacity, base.surfaceOpacity)),
    surfaceBlur: Math.max(0, num(o.surfaceBlur, base.surfaceBlur)),
    borderColor: hex(o.borderColor, base.borderColor),
    borderOpacity: clamp01(num(o.borderOpacity, base.borderOpacity)),
    glowColor: hex(o.glowColor, base.glowColor),
    glowIntensity: clamp01(num(o.glowIntensity, base.glowIntensity)),
    highlightMutedColor: hex(o.highlightMutedColor, base.highlightMutedColor),
    errorColor: hex(o.errorColor, base.errorColor),
    successColor: hex(o.successColor, base.successColor),
  };

  // Readability floor: only applies once the theme actually asks for glass.
  const wantsGlass = t.surfaceBlur > 0 || t.surfaceOpacity > 0 || t.borderOpacity > 0;
  if (wantsGlass && t.surfaceOpacity > 0 && t.surfaceOpacity < MIN_GLASS_SURFACE_OPACITY) {
    t.surfaceOpacity = MIN_GLASS_SURFACE_OPACITY;
  }

  return t;
}

/** True when the tokens describe a plain solid card (no glass effects at all). */
export function isSolidTheme(t: QuoteEstimatorTheme): boolean {
  return t.surfaceOpacity === 0 && t.surfaceBlur === 0 && t.borderOpacity === 0 && t.glowIntensity === 0;
}

/**
 * CSS custom properties for the whole form. Consumed by the `.qe-glass`
 * layer in index.css (which re-skins the existing step components) and by the
 * glass components themselves.
 */
export function buildQuoteEstimatorVars(t: QuoteEstimatorTheme): Record<string, string> {
  const vars: Record<string, string> = {
    '--qe-bg': t.background,
    '--qe-tile': t.tileBackground,
    '--qe-font': t.fontColor,
    '--qe-muted': t.mutedTextColor,
    '--qe-accent': t.accentColor,
    '--qe-highlight': t.highlightColor,
    '--qe-highlight-muted': t.highlightMutedColor,
    '--qe-btn-bg': t.buttonColor,
    '--qe-btn-text': t.buttonTextColor,
    '--qe-input-border': t.inputBorderColor,
    '--qe-radius': `${t.borderRadius}px`,
    '--qe-btn-radius': `${t.buttonBorderRadius}px`,
    '--qe-font-display': t.fontFamilyDisplay,
    '--qe-font-body': t.fontFamilyBody,
    '--qe-error': t.errorColor,
    '--qe-success': t.successColor,
    // Card fill: solid tile when no opacity is asked for, otherwise a mix.
    '--qe-surface': t.surfaceOpacity > 0 ? withAlpha(t.surfaceColor, t.surfaceOpacity) : t.tileBackground,
  };

  // Only emit the effect declarations when the theme actually asks for them —
  // a 0 value means "not present", not "present but transparent".
  if (t.surfaceBlur > 0) vars['--qe-blur'] = `blur(${t.surfaceBlur}px)`;
  if (t.borderOpacity > 0) {
    vars['--qe-border'] = withAlpha(t.borderColor, t.borderOpacity);
    vars['--qe-border-top'] = withAlpha(t.borderColor, Math.min(1, t.borderOpacity * 1.8));
  }
  if (t.glowIntensity > 0) {
    vars['--qe-glow'] = withAlpha(t.glowColor, t.glowIntensity * 0.55);
  }
  return vars;
}

/** Text colour guaranteed to read on the button fill. */
export function buttonTextOn(t: QuoteEstimatorTheme): string {
  return t.buttonTextColor || getContrastText(t.buttonColor);
}

export { withAlpha };
