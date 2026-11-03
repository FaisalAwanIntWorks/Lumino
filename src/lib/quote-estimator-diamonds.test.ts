import { describe, expect, it } from 'vitest';
import {
  formatQuoteDiamondCertificate,
  formatQuoteDiamondLabel,
  isQuoteDiamondPickerEnabled,
  quoteDiamondQualityValue,
  quoteShapeToPoolShape,
  quoteSizeToCaratWindow,
  resolveQuoteDiamondPickerConfig,
  sortByGradeOrder,
  DIAMOND_CLARITY_ORDER,
} from './quote-estimator-diamonds';

const SANDBOX = 'dcd952fc-783b-4a92-be7f-62751265c650';

describe('quote-estimator-diamonds', () => {
  it('maps size options to Ring OS half-carat windows', () => {
    expect(quoteSizeToCaratWindow('1ct')).toEqual({ min: 1, max: 1.49 });
    expect(quoteSizeToCaratWindow('1.5ct')).toEqual({ min: 1.5, max: 1.99 });
    expect(quoteSizeToCaratWindow('5ct+')).toEqual({ min: 5, max: null });
    expect(quoteSizeToCaratWindow(null)).toEqual({ min: null, max: null });
    expect(quoteSizeToCaratWindow('unknown')).toEqual({ min: null, max: null });
  });

  it('maps form shapes to pool shape ids and leaves fancy cuts unfiltered', () => {
    expect(quoteShapeToPoolShape('round')).toBe('round');
    expect(quoteShapeToPoolShape('dutch-marquise')).toBe('marquise');
    expect(quoteShapeToPoolShape('portuguese-cut')).toBeNull();
    expect(quoteShapeToPoolShape(null)).toBeNull();
  });

  it('is limited to the allowlisted accounts and on by default there', () => {
    expect(isQuoteDiamondPickerEnabled(SANDBOX, null)).toBe(true);
    expect(isQuoteDiamondPickerEnabled('9d43af60-4e42-4b48-ac9a-b0fa9e608385', null)).toBe(true); // fsl / fbe
    expect(isQuoteDiamondPickerEnabled(SANDBOX, { diamondPicker: { enabled: false } })).toBe(false);
    expect(isQuoteDiamondPickerEnabled('aeec6491-bd1f-4787-97f9-6a47a2ddc8af', null)).toBe(false);
    expect(isQuoteDiamondPickerEnabled(null, { diamondPicker: { enabled: true } })).toBe(false);
  });

  it('resolves settings with defaults and clamps', () => {
    expect(resolveQuoteDiamondPickerConfig(null)).toEqual({ enabled: true, limit: 12, filter: {}, markupNatural: 0, markupLab: 0 });
    const r = resolveQuoteDiamondPickerConfig({ diamondPicker: { limit: 500, markupNatural: 12.5, markupLab: -5, filter: { shapes: ['round'], labs: ['GIA'] } } });
    expect(r.limit).toBe(50);
    expect(r.markupNatural).toBe(12.5);
    expect(r.markupLab).toBe(0);
    expect(r.filter).toEqual({ shapes: ['round'], labs: ['GIA'] });
  });

  it('keeps first-release colour / clarity / markup keys working until re-saved', () => {
    const r = resolveQuoteDiamondPickerConfig({ diamondPicker: { colors: [' g', 'h'], clarities: ['vs1'], markupPercent: 8 } });
    expect(r.filter).toEqual({ colors: ['G', 'H'], clarities: ['VS1'] });
    expect(r.markupNatural).toBe(8);
    expect(r.markupLab).toBe(8);
    // A saved filter wins over the legacy lists.
    expect(resolveQuoteDiamondPickerConfig({ diamondPicker: { colors: ['G'], filter: { labs: ['GIA'] } } }).filter).toEqual({ labs: ['GIA'] });
  });

  it('formats the stone, certificate and quality value', () => {
    const d = { carat: 1.51, color: 'L', clarity: 'VS1', lab: 'GIA', reportNo: '123' };
    expect(formatQuoteDiamondLabel(d)).toBe('1.51 ct L Color VS1');
    expect(formatQuoteDiamondCertificate(d)).toBe('GIA 123');
    expect(formatQuoteDiamondCertificate({ lab: null, reportNo: null })).toBe('');
    expect(quoteDiamondQualityValue(d)).toBe('L Color, VS1 Clarity');
  });

  it('sorts grades in GIA order', () => {
    expect(sortByGradeOrder(['SI1', 'VVS1', 'VS2', 'IF'], DIAMOND_CLARITY_ORDER)).toEqual(['IF', 'VVS1', 'VS2', 'SI1']);
  });
});
