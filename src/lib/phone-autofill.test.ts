import { describe, it, expect } from 'vitest';
import { parseAutofilledPhone } from './phone-autofill';

describe('parseAutofilledPhone', () => {
  it('splits an autofilled UK number into UK + local digits', () => {
    expect(parseAutofilledPhone('+44 7700 900123')).toEqual({
      countryIso: 'GB', countryCode: '+44', nationalNumber: '7700900123',
    });
  });
  it('splits an autofilled US number into +1 + 10 digits', () => {
    expect(parseAutofilledPhone('+1 (415) 555-2671', 'US')).toEqual({
      countryIso: 'US', countryCode: '+1', nationalNumber: '4155552671',
    });
  });
  it('accepts 00 international prefix', () => {
    expect(parseAutofilledPhone('0044 7700 900123')?.countryIso).toBe('GB');
  });
  it('leaves ordinary typed digits alone', () => {
    expect(parseAutofilledPhone('4155552671')).toBeNull();
  });
});
