import { parsePhoneNumberFromString } from 'libphonenumber-js';
import { COUNTRY_CODES } from '@/lib/form-validation';

export interface AutofilledPhone {
  countryIso: string;
  countryCode: string;
  nationalNumber: string;
}

/**
 * Device autofill / paste often drops a full international number
 * ("+44 7700 900123") into the national-number box. Detect that and split it
 * into country + local digits. Returns null for ordinary typed digits so normal
 * typing behaviour is unchanged.
 */
export function parseAutofilledPhone(raw: string, currentIso?: string): AutofilledPhone | null {
  const trimmed = (raw || '').trim();
  const hasIntlPrefix = trimmed.startsWith('+') || trimmed.startsWith('00');
  if (!hasIntlPrefix) return null;
  const normalized = trimmed.startsWith('00') ? `+${trimmed.slice(2)}` : trimmed;
  const parsed = parsePhoneNumberFromString(normalized);
  if (!parsed || !parsed.nationalNumber) return null;
  const dial = `+${parsed.countryCallingCode}`;
  // Keep the current country if it shares the dial code (e.g. US vs CA on +1).
  const current = COUNTRY_CODES.find((c) => c.country === currentIso);
  let iso = current && current.code === dial ? current.country : parsed.country;
  if (!iso || !COUNTRY_CODES.some((c) => c.country === iso)) {
    iso = COUNTRY_CODES.find((c) => c.code === dial)?.country;
  }
  if (!iso) return null;
  return { countryIso: iso, countryCode: dial, nationalNumber: String(parsed.nationalNumber) };
}
