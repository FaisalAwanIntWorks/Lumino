import { describe, expect, it } from 'vitest';
import { getQuoteStorage, isQuoteTestPreview, resolveQuoteVersion } from './quote-estimator-version';

const sandbox = 'dcd952fc-783b-4a92-be7f-62751265c650';

describe('Sandbox Quote Estimator version resolver', () => {
  it('keeps the existing sandbox embed on V2 by default', () => expect(resolveQuoteVersion(sandbox, undefined, null)).toBe('v2'));
  it('uses the live version until explicitly switched', () => expect(resolveQuoteVersion(sandbox, 'v1', null)).toBe('v1'));
  it('previews V1 without changing the live choice', () => expect(resolveQuoteVersion(sandbox, 'v2', 'v1')).toBe('v1'));
  it('ignores unknown preview values', () => expect(resolveQuoteVersion(sandbox, 'v1', 'unknown')).toBe('v1'));
  it('never versions a client outside Sandbox', () => expect(resolveQuoteVersion('aeec6491-bd1f-4787-97f9-6a47a2ddc8af', 'v1', 'v1')).toBe('v2'));
  it('previews V3 only in Sandbox without switching live', () => { expect(resolveQuoteVersion(sandbox, 'v2', 'v3')).toBe('v3'); expect(isQuoteTestPreview(sandbox, 'v3')).toBe(true); expect(isQuoteTestPreview('aeec6491-bd1f-4787-97f9-6a47a2ddc8af', 'v3')).toBe(false); });
  it('routes V3 settings and options to isolated storage', () => { expect(getQuoteStorage(sandbox, 'v3').config).toBe('sandbox_quote_v3_config'); expect(getQuoteStorage(sandbox, 'v3').options).toBe('get_sandbox_quote_v3_options'); expect(getQuoteStorage('aeec6491-bd1f-4787-97f9-6a47a2ddc8af', 'v3').config).toBe('client_dtt_form_config'); });
});