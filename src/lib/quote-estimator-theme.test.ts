import { describe, expect, it } from 'vitest';
import { DEFAULT_QUOTE_THEME, isQuoteThemePreview, resolveQuoteTheme } from './quote-estimator-theme';

const sandbox = 'dcd952fc-783b-4a92-be7f-62751265c650';
const client = 'aeec6491-bd1f-4787-97f9-6a47a2ddc8af';

describe('resolveQuoteTheme', () => {
  it('defaults every account to Theme 1 · Classic', () => {
    expect(DEFAULT_QUOTE_THEME).toBe('classic');
    expect(resolveQuoteTheme(client, 'v2', null, null)).toBe('classic');
    expect(resolveQuoteTheme(client, 'v2', {}, null)).toBe('classic');
    expect(resolveQuoteTheme(client, 'v2', { quoteTheme: 'classic' }, null)).toBe('classic');
  });
  it('renders Theme 2 · Glass once an account saves it', () => {
    expect(resolveQuoteTheme(client, 'v2', { quoteTheme: 'glass' }, null)).toBe('glass');
  });
  it('ignores junk stored values', () => {
    expect(resolveQuoteTheme(client, 'v2', { quoteTheme: 'neon' }, null)).toBe('classic');
  });
  it('lets a dashboard test link preview either theme without changing the saved one', () => {
    expect(resolveQuoteTheme(client, 'v2', { quoteTheme: 'classic' }, 'glass')).toBe('glass');
    expect(resolveQuoteTheme(client, 'v2', { quoteTheme: 'glass' }, 'classic')).toBe('classic');
    expect(resolveQuoteTheme(client, 'v2', { quoteTheme: 'glass' }, 'bogus')).toBe('glass');
  });
  it('keeps the Sandbox lab on V2 = glass regardless of the theme setting or request', () => {
    expect(resolveQuoteTheme(sandbox, 'v2', null, null)).toBe('glass');
    expect(resolveQuoteTheme(sandbox, 'v2', { quoteTheme: 'classic' }, 'classic')).toBe('glass');
    expect(resolveQuoteTheme(sandbox, 'v1', { quoteTheme: 'glass' }, 'glass')).toBe('classic');
    expect(resolveQuoteTheme(sandbox, 'v3', null, null)).toBe('classic');
  });
});

describe('isQuoteThemePreview', () => {
  it('is a test preview only for a valid ?quoteTheme= on a non-lab account', () => {
    expect(isQuoteThemePreview(client, 'glass')).toBe(true);
    expect(isQuoteThemePreview(client, 'classic')).toBe(true);
    expect(isQuoteThemePreview(client, null)).toBe(false);
    expect(isQuoteThemePreview(client, 'bogus')).toBe(false);
    expect(isQuoteThemePreview(sandbox, 'glass')).toBe(false);
  });
});
