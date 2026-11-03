import { describe, it, expect } from 'vitest';
import { normalizeTierConfig, tierBonusFor, effectiveLineRate, DEFAULT_VOLUME_TIER_CONFIG } from './metal-offer-tiers';

const cfg = normalizeTierConfig({ ...DEFAULT_VOLUME_TIER_CONFIG, enabled: true })!;
const line = (karat: string, base = 60, refinery = 99) => ({ metal: 'gold', karat, baseBuyPct: base, refinerySellPct: refinery });

describe('Metal IQ volume tiers', () => {
  it('disabled config changes nothing', () => {
    expect(normalizeTierConfig({ ...DEFAULT_VOLUME_TIER_CONFIG })).toBeNull();
    expect(effectiveLineRate(line('14K'), 150, 0, null).buyPct).toBe(60);
  });
  it('under 20g total gets the normal rate', () => {
    expect(tierBonusFor(19.99, cfg).bonus).toBe(0);
  });
  it('20g to 100g total gets +2', () => {
    expect(tierBonusFor(20, cfg).bonus).toBe(2);
    expect(effectiveLineRate(line('14K'), 50, 0, cfg).buyPct).toBe(62);
  });
  it('100g+ total gets +5', () => {
    expect(effectiveLineRate(line('14K'), 100, 0, cfg).buyPct).toBe(65);
  });
  it('whole submission decides the tier for every piece', () => {
    // 10g ring + 15g chain = 25g -> both pieces get +2
    expect(effectiveLineRate(line('14K'), 25, 0, cfg).buyPct).toBe(62);
    expect(effectiveLineRate(line('18K', 65), 25, 0, cfg).buyPct).toBe(67);
  });
  it('24K over 5 oz gets 87.5%', () => {
    const r = effectiveLineRate(line('24K', 75), 160, 160, cfg);
    expect(r.buyPct).toBe(87.5);
    expect(r.bullionApplied).toBe(true);
  });
  it('24K at exactly 5 oz does not get the bullion rate', () => {
    expect(effectiveLineRate(line('24K', 75), 155.5175, 155.5175, cfg).buyPct).toBe(80);
  });
  it('bullion rate only applies to 24K gold', () => {
    expect(effectiveLineRate(line('22K', 70), 200, 160, cfg).buyPct).toBe(75);
  });
  it('never exceeds the refinery rate', () => {
    const r = effectiveLineRate(line('24K', 75, 85), 200, 200, cfg);
    expect(r.buyPct).toBe(85);
    expect(r.capped).toBe(true);
  });
});
