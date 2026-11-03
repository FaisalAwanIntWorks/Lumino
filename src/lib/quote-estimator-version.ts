import { createContext, useContext } from 'react';
import { isGlassQuoteEstimator, type QuoteTheme } from '@/lib/quote-estimator-theme';

export type QuoteVersion = 'v1' | 'v2' | 'v3';
export const QUOTE_VERSIONS: QuoteVersion[] = ['v1', 'v2', 'v3'];
/** Display names for the Sandbox lab's three Quote Estimator versions (Configure panels, previews, embed tab). */
export const QUOTE_VERSION_META: Record<QuoteVersion, { label: string; title: string; description: string; testOnly?: boolean }> = {
  v1: { label: 'V1', title: 'Classic', description: 'Step-by-step form with the estimate summary and thank-you screen.' },
  v2: { label: 'V2', title: 'Glass', description: 'Glass skin with the unified phone field and the design-credit claim screen.' },
  v3: { label: 'V3', title: 'Atelier', description: 'Single-page atelier flow with transparent option imagery and the claim screen.', testOnly: true },
};
export const quoteVersionName = (v: QuoteVersion) => `${QUOTE_VERSION_META[v].label} · ${QUOTE_VERSION_META[v].title}`;
export const quoteVersionStorage = {
  v1: { config: 'sandbox_quote_v1_config', overrides: 'sandbox_quote_v1_overrides', options: 'get_sandbox_quote_v1_options' },
  v2: { config: 'client_dtt_form_config', overrides: 'client_diamond_step_overrides', options: 'get_client_diamond_form_options' },
  v3: { config: 'sandbox_quote_v3_config', overrides: 'sandbox_quote_v3_overrides', options: 'get_sandbox_quote_v3_options' },
} as const;
export function getQuoteStorage(clientId: string | null | undefined, version: QuoteVersion) {
  return quoteVersionStorage[isGlassQuoteEstimator(clientId) ? version : 'v2'];
}
export const QuoteVersionContext = createContext<QuoteVersion>('v2');
export const useQuoteVersion = () => useContext(QuoteVersionContext);

export function resolveQuoteVersion(clientId: string | null | undefined, live: QuoteVersion | null | undefined, requested: string | null): QuoteVersion {
  if (!isGlassQuoteEstimator(clientId)) return 'v2';
  if (QUOTE_VERSIONS.some(v => v === requested)) return requested as QuoteVersion;
  return live && QUOTE_VERSIONS.includes(live) ? live : 'v2';
}
/** True when a Sandbox version test link (?quoteVersion=) is open: ad conversions are skipped; V3 additionally skips all writes. */
export const QuoteTestPreviewContext = createContext(false);
export const useQuoteTestPreview = () => useContext(QuoteTestPreviewContext);
export function isQuoteTestPreview(clientId: string | null | undefined, requested: string | null): boolean {
  return isGlassQuoteEstimator(clientId) && QUOTE_VERSIONS.some(v => v === requested);
}
/** Skin the surrounding form renders with (see resolveQuoteTheme). Defaults to Theme 1 · Classic. */
export const QuoteThemeContext = createContext<QuoteTheme>('classic');
export const useQuoteTheme = () => useContext(QuoteThemeContext);
