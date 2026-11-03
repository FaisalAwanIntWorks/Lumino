// Shared E.164 phone formatting for the DTT GHL functions.
//
// sync-dtt-ghl-lead (contact creation) and backfill-dtt-ghl-leads (duplicate
// lookup) MUST produce identical phone strings, otherwise GHL fails to match an
// existing contact and creates a duplicate. Keep this the single source of truth.
//
// Rules: strip everything but digits from the number, strip everything but
// digits from the country code, and prefix with "+". Returns undefined when
// there is no usable number.
export function toE164(countryCode: unknown, phoneNumber: unknown): string | undefined {
  const num = String(phoneNumber ?? "").replace(/[^\d]/g, "");
  if (!num) return undefined;
  const ccDigits = String(countryCode ?? "").replace(/[^\d]/g, "");
  return ccDigits ? `+${ccDigits}${num}` : `+${num}`;
}
