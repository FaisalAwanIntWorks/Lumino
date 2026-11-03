import { describe, expect, it } from 'vitest';
import { bufferInRange, convertPrice, effectiveRate, parseDecimal, rateInRange, rateMove } from './diamond-fx';
import {
  normalizeRingOsCurrency,
  readRingOsPrice,
  ringOsPriceColumn,
  usesRingOsCurrency,
} from './ring-os-currency';

describe('diamond FX math (spec example)', () => {
  it('builds the effective rates with the buffer', () => {
    expect(effectiveRate('0.7450', '2.00')).toBe('0.7599000000');
    expect(effectiveRate('1.4015', '2.00')).toBe('1.4295300000');
  });

  it('converts and rounds half-up to 2 places', () => {
    expect(convertPrice('1350.00', '0.7599000000')).toBe('1025.87');
    expect(convertPrice('1350.00', '1.4295300000')).toBe('1929.87');
    expect(convertPrice('1350', '1')).toBe('1350.00');
  });

  it('rounds the half cent up', () => {
    expect(convertPrice('0.005', '1')).toBe('0.01');
    expect(convertPrice('0.004', '1')).toBe('0.00');
  });

  it('uses the live metals-api quote correctly (rates.GBP, not USDGBP)', () => {
    expect(rateInRange('GBP', '0.752205')).toBe(true);
    expect(rateInRange('GBP', '1.329424824349745')).toBe(false); // inverted USDGBP key
    expect(rateInRange('CAD', '1.404215')).toBe(true);
    expect(rateInRange('CAD', '0.7121416592188519')).toBe(false); // inverted USDCAD key
  });

  it('rejects bad input', () => {
    expect(parseDecimal('-1')).toBeNull();
    expect(parseDecimal('1e3')).toBeNull();
    expect(parseDecimal('')).toBeNull();
    expect(effectiveRate('abc', '2')).toBeNull();
    expect(bufferInRange('26')).toBe(false);
    expect(bufferInRange('2.5')).toBe(true);
  });

  it('measures rate moves', () => {
    expect(rateMove('0.7750', 0.75)).toBeCloseTo(0.0333, 3);
    expect(rateMove('0.75', null)).toBeNull();
  });
});

describe('Ring OS catalogue currency', () => {
  it('is limited to the Sandbox account', () => {
    expect(usesRingOsCurrency('dcd952fc-783b-4a92-be7f-62751265c650')).toBe(true);
    expect(usesRingOsCurrency('9311d1ea-09d1-4f5c-a03c-baf0101ab6c5')).toBe(false);
    expect(usesRingOsCurrency(null)).toBe(false);
  });

  it('normalizes and maps columns', () => {
    expect(normalizeRingOsCurrency('gbp')).toBe('GBP');
    expect(normalizeRingOsCurrency('EUR')).toBe('USD');
    expect(normalizeRingOsCurrency(undefined)).toBe('USD');
    expect(ringOsPriceColumn('CAD')).toBe('price_cad');
    expect(readRingOsPrice({ price_gbp: '500' }, 'GBP')).toBe(500);
    expect(readRingOsPrice({ price_gbp: null }, 'GBP')).toBeNull();
    expect(readRingOsPrice({}, 'USD')).toBeNull();
  });
});
