// Single source of truth for the 24k Carat Jewelers exclusive Ring OS theme.
// The new theme key 'twentyfourk' is ONLY available to this client, and this
// client cannot see any of the standard themes (luxury / modern / chat / elegant).
//
// Admins and staff are NOT gated — they continue to see and impersonate this
// client normally; gating only applies to the client-side Embed UI and the
// public widget runtime.
//
// Fill in TWENTYFOURK_CLIENT_ID once the 24k Carat Jewelers client account has
// been created via Admin → Clients → Add Client.

import type { WidgetTheme } from '@/contexts/WidgetThemeContext';

/** Client id of the 24k Carat Jewelers account. Empty until provisioned. */
export const TWENTYFOURK_CLIENT_ID: string = '9311d1ea-09d1-4f5c-a03c-baf0101ab6c5';

export const TWENTYFOURK_THEME_KEY: WidgetTheme = 'twentyfourk';

export const STANDARD_THEMES: WidgetTheme[] = ['luxury', 'modern', 'chat', 'elegant'];

export const isTwentyFourKClient = (clientId?: string | null): boolean => {
  if (!clientId || !TWENTYFOURK_CLIENT_ID) return false;
  return clientId === TWENTYFOURK_CLIENT_ID;
};

/**
 * Themes the client-side Embed picker is allowed to show.
 * - 24k client → only the exclusive theme
 * - everyone else → the four standard themes (24k hidden)
 */
export const getAvailableThemes = (clientId?: string | null): WidgetTheme[] => {
  return isTwentyFourKClient(clientId) ? [TWENTYFOURK_THEME_KEY] : STANDARD_THEMES;
};

/**
 * Coerce any theme value (from DB, URL ?theme=, or preview branding) to one
 * that is allowed for this client. Tamper-proof: a non-24k client cannot land
 * on the 24k theme via URL override, and a 24k client cannot escape it.
 */
export const coerceThemeForClient = (
  clientId: string | null | undefined,
  requested: string | null | undefined,
  fallback: WidgetTheme = 'luxury',
): WidgetTheme => {
  if (isTwentyFourKClient(clientId)) return TWENTYFOURK_THEME_KEY;
  if (requested === TWENTYFOURK_THEME_KEY) return fallback;
  if (
    requested === 'luxury' ||
    requested === 'modern' ||
    requested === 'chat' ||
    requested === 'elegant'
  ) {
    return requested;
  }
  return fallback;
};
