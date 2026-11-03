import { describe, expect, it } from 'vitest';
import { hidesRingOsPrices, resolveRingOsFinalAction } from './ring-os-diamond-checkout';
import { RING_SIZE_GUIDE } from './ring-size-guide';

const TWENTYFOURK = '9311d1ea-09d1-4f5c-a03c-baf0101ab6c5';
const OTHER = '08279731-f36e-45f3-a258-b0f7f31ce177';

describe('Ring OS final action', () => {
  it('24k natural diamond collects a lead even though the stored mode is estimates', () => {
    expect(resolveRingOsFinalAction(TWENTYFOURK, 'estimates', 'natural')).toBe('lead_capture');
  });

  it('24k lab diamond goes to full-price checkout, not the deposit', () => {
    expect(resolveRingOsFinalAction(TWENTYFOURK, 'estimates', 'lab')).toBe('full_checkout');
  });

  it('other accounts keep their stored pricing mode regardless of diamond type', () => {
    expect(resolveRingOsFinalAction(OTHER, 'estimates', 'natural')).toBe('deposit_checkout');
    expect(resolveRingOsFinalAction(OTHER, 'no_deposit', 'lab')).toBe('lead_capture');
    expect(resolveRingOsFinalAction(OTHER, 'custom_pricing', 'natural')).toBe('full_checkout');
  });

  it('prices are hidden only for 24k natural selections', () => {
    expect(hidesRingOsPrices(TWENTYFOURK, 'natural')).toBe(true);
    expect(hidesRingOsPrices(TWENTYFOURK, 'lab')).toBe(false);
    expect(hidesRingOsPrices(OTHER, 'natural')).toBe(false);
  });
});

describe('Ring size guide', () => {
  it('maps US 7 to UK N½ and EU 54', () => {
    const row = RING_SIZE_GUIDE.find((r) => r.us === '7');
    expect(row).toMatchObject({ uk: 'N½', eu: '54.5', diameterMm: '17.3', aroundMm: '54.4' });
  });
});
