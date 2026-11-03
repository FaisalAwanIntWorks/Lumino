import type { CSSProperties } from 'react';
import type { DttFormColors } from '@/hooks/useClientDttFormConfig';
import { getContrastText, normalizeHex } from '@/lib/color-utils';

/** V3 uses its own version's existing form_colors. Unset roles fall back to global tokens. */
export function quoteV3ThemeStyle(colors?: DttFormColors | null): CSSProperties {
  const roles: [keyof DttFormColors, string][] = [
    ['background', '--quote-v3-paper'],
    ['fontColor', '--quote-v3-ink'],
    ['imageBg', '--quote-v3-surface'],
    ['tabBorder', '--quote-v3-accent'],
    ['highlight', '--quote-v3-selected'],
    ['submitButtonBg', '--quote-v3-button'],
    ['submitButtonText', '--quote-v3-action-text'],
  ];
  const style = Object.fromEntries(roles.flatMap(([key, token]) => {
    const color = normalizeHex(colors?.[key]);
    return color ? [[token, color]] : [];
  })) as Record<string, string>;
  const bg = normalizeHex(colors?.background) || '#000000';
  const ink = normalizeHex(colors?.fontColor) || '#ffffff';
  const accent = normalizeHex(colors?.tabBorder) || '#ffffff';
  style['--quote-v3-muted'] = `color-mix(in srgb, ${ink} 72%, ${bg})`;
  style['--quote-v3-line'] = `color-mix(in srgb, ${ink} 34%, ${bg})`;
  style['--quote-v3-indicator-text'] = getContrastText(accent);
  return style as CSSProperties;
}