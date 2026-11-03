/**
 * Zero-cost phone validation for lead forms.
 *
 * Uses libphonenumber-js (offline, no network calls, no per-lead cost) for real
 * per-country numbering-plan rules, plus a junk-pattern filter for obviously
 * fake input (repeated digits, sequential runs, 555 placeholders).
 *
 * Nothing here talks to a paid API. It cannot prove a number is reachable — it
 * only rejects numbers that cannot exist and flags the ones that look fake.
 */
import {
  parsePhoneNumberFromString,
  type CountryCode,
  type PhoneNumber,
} from 'libphonenumber-js';

export type PhoneLineType = 'mobile' | 'fixed_line' | 'fixed_or_mobile' | 'other' | 'unknown';

export interface PhoneCheckResult {
  /** Passes the country's numbering plan and is not an obvious junk pattern. */
  valid: boolean;
  /** User-facing message when invalid. */
  error?: string;
  /** E.164 string when parseable (e.g. "+14165551234"). */
  e164?: string;
  /** National digits only, normalised. */
  nationalNumber?: string;
  /** Best-effort line type from the numbering plan (no API call). */
  lineType: PhoneLineType;
  /** Machine-readable reasons used by the lead quality score. */
  reasons: string[];
}

const digitsOnly = (v: string) => (v || '').replace(/\D/g, '');

/** Numbers reserved for fiction/tests, or patterns nobody actually owns. */
function junkReason(national: string): string | null {
  if (!national) return null;

  // All the same digit: 1111111111
  if (/^(\d)\1+$/.test(national)) return 'repeated_digits';

  // Straight ascending or descending run of 6+ digits: 1234567890 / 9876543210
  const asc = '01234567890123456789';
  const desc = '09876543210987654321';
  if (national.length >= 6 && (asc.includes(national) || desc.includes(national))) {
    return 'sequential_digits';
  }

  // Short repeating block, e.g. 1212121212 / 123123123
  for (const size of [2, 3, 4]) {
    if (national.length >= size * 3 && national.length % size === 0) {
      const block = national.slice(0, size);
      if (national === block.repeat(national.length / size)) return 'repeated_pattern';
    }
  }

  // North American fictional range: NPA-555-01XX
  if (national.length === 10 && national.slice(3, 6) === '555') return 'placeholder_555';

  // Obvious keyboard-mash prefixes for NANP: area codes 000/111/123
  if (national.length === 10 && ['000', '111', '123'].includes(national.slice(0, 3))) {
    return 'invalid_area_code';
  }

  return null;
}

function toLineType(parsed: PhoneNumber): PhoneLineType {
  let type: string | undefined;
  try {
    type = parsed.getType();
  } catch {
    type = undefined;
  }
  switch (type) {
    case 'MOBILE':
      return 'mobile';
    case 'FIXED_LINE':
      return 'fixed_line';
    case 'FIXED_LINE_OR_MOBILE':
      return 'fixed_or_mobile';
    case undefined:
      return 'unknown';
    default:
      return 'other';
  }
}

/**
 * Validate a phone number entered as (country dial code, national digits).
 *
 * @param countryCode dial code, e.g. "+1"
 * @param phoneNumber national digits as typed
 * @param countryIso optional ISO country (e.g. "CA") — improves accuracy when
 *                   several countries share a dial code (+1, +7, +44 …)
 */
export function checkPhone(
  countryCode: string,
  phoneNumber: string,
  countryIso?: string,
): PhoneCheckResult {
  const national = digitsOnly(phoneNumber);
  const reasons: string[] = [];

  if (!national) {
    return { valid: false, error: 'Phone number is required', lineType: 'unknown', reasons: ['empty'] };
  }

  const dial = digitsOnly(countryCode);
  const parsed = parsePhoneNumberFromString(
    `+${dial}${national}`,
    countryIso ? (countryIso as CountryCode) : undefined,
  );

  if (!parsed || !parsed.isValid()) {
    return {
      valid: false,
      error: 'Please enter a valid phone number for the selected country',
      nationalNumber: national,
      lineType: 'unknown',
      reasons: ['invalid_format'],
    };
  }

  const junk = junkReason(parsed.nationalNumber.toString());
  if (junk) {
    return {
      valid: false,
      error: 'That phone number does not look real — please enter a number we can reach you on',
      e164: parsed.number,
      nationalNumber: parsed.nationalNumber.toString(),
      lineType: 'unknown',
      reasons: [junk],
    };
  }

  const lineType = toLineType(parsed);
  if (lineType === 'fixed_line') reasons.push('landline');
  if (lineType === 'unknown') reasons.push('line_type_unknown');

  return {
    valid: true,
    e164: parsed.number,
    nationalNumber: parsed.nationalNumber.toString(),
    lineType,
    reasons,
  };
}

/** Convenience boolean for schemas / quick checks. */
export function isPlausiblePhone(countryCode: string, phoneNumber: string, countryIso?: string) {
  return checkPhone(countryCode, phoneNumber, countryIso).valid;
}
