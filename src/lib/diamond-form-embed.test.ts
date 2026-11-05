import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateDiamondsFormEmbedCode, getDiamondsFormUrl, getQuoteEstimatorThemePreviewUrl, getQuoteEstimatorUrl, getQuoteEstimatorVersionPreviewUrl } from './diamond-form-embed';

afterEach(() => vi.unstubAllGlobals());

describe('Quote Estimator embed sizing scope', () => {
  const setup = () => vi.stubGlobal('window', { location: { hostname: 'localhost', origin: 'http://localhost:8080' } });

  it('defaults Classic and Glass quote snippets to content-following phone height', () => {
    setup();
    const snippet = generateDiamondsFormEmbedCode('client', '800px', [], 'dtt');
    expect(snippet).toContain('min-height: 260px');
    expect(snippet).toContain('if (isMobile && !true) return');
    expect(snippet).not.toContain('max-height: 100dvh');
  });

  it('keeps non-quote diamond widgets screen-height on phones', () => {
    setup();
    const snippet = generateDiamondsFormEmbedCode('client');
    expect(snippet).toContain('max-height: 100dvh');
    expect(snippet).toContain('if (isMobile && !false) return');
    expect(snippet).not.toContain('prefers-reduced-motion');
  });

  it('preserves explicit fixed-height opt-out for V3 and legacy snippets', () => {
    setup();
    const snippet = generateDiamondsFormEmbedCode('client', '800px', [], 'dtt', undefined, false);
    expect(snippet).toContain('max-height: 100dvh');
    expect(snippet).toContain('if (isMobile && !false) return');
  });
});

describe('Quote Estimator URLs carry no variant parameter', () => {
  it('uses the dedicated /quote path on production and never ?variant=dtt', () => {
    vi.stubGlobal('window', { location: { hostname: 'studio.aurezotech.com', origin: 'https://studio.aurezotech.com' } });
    expect(getQuoteEstimatorUrl('abc')).toBe('https://widget.aurezotech.com/quote/abc');
    expect(getQuoteEstimatorThemePreviewUrl('abc', 'glass')).toBe('https://widget.aurezotech.com/quote/abc?quoteTheme=glass');
    expect(getQuoteEstimatorVersionPreviewUrl('abc', 'v3')).toBe('https://widget.aurezotech.com/quote/abc?quoteVersion=v3');
    expect(getDiamondsFormUrl('abc')).toBe('https://widget.aurezotech.com/diamonds/abc');
    const snippet = generateDiamondsFormEmbedCode('abcdefgh-1234', '800px', [], 'dtt');
    expect(snippet).toContain('src="https://widget.aurezotech.com/quote/abcdefgh-1234"');
    expect(snippet).not.toContain('variant=dtt');
    expect(snippet).toContain('id="aurezo-quote-abcdefgh"');
  });

  it('keeps the Ring Builder snippet on /diamonds', () => {
    vi.stubGlobal('window', { location: { hostname: 'studio.aurezotech.com', origin: 'https://studio.aurezotech.com' } });
    const snippet = generateDiamondsFormEmbedCode('abcdefgh-1234');
    expect(snippet).toContain('src="https://widget.aurezotech.com/diamonds/abcdefgh-1234"');
    expect(snippet).toContain('id="aurezo-diamonds-abcdefgh"');
  });

  it('falls back to /embed-quote in development', () => {
    vi.stubGlobal('window', { location: { hostname: 'localhost', origin: 'http://localhost:8080' } });
    expect(getQuoteEstimatorUrl('abc')).toBe('http://localhost:8080/embed-quote/abc');
  });
});
