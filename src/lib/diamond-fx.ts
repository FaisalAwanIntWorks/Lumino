// Exact decimal helpers for the admin diamond FX panel preview.
//
// The database does the real pricing (NUMERIC, ROUND half-up to 2 places in
// diamond_fx_step). These helpers only reproduce the same numbers in the
// browser for the preview, using scaled BigInt so no binary floating point
// touches a money amount.

const RATE_DP = 10;

/** Parses a plain decimal string ("0.7450", "2", "1350.00"). Null when invalid. */
export function parseDecimal(input: string): { units: bigint; dp: number } | null {
  const s = input.trim();
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const [int, frac = ''] = s.split('.');
  return { units: BigInt(int + frac), dp: frac.length };
}

function toScale(value: { units: bigint; dp: number }, dp: number): bigint {
  if (value.dp === dp) return value.units;
  if (value.dp < dp) return value.units * 10n ** BigInt(dp - value.dp);
  return roundHalfUp(value.units, 10n ** BigInt(value.dp - dp));
}

function roundHalfUp(numerator: bigint, divisor: bigint): bigint {
  // Inputs are non-negative here.
  return (numerator * 2n + divisor) / (divisor * 2n);
}

function format(units: bigint, dp: number): string {
  const s = units.toString().padStart(dp + 1, '0');
  return dp === 0 ? s : `${s.slice(0, -dp)}.${s.slice(-dp)}`;
}

/** rate × (1 + buffer / 100), rounded to 10 places (as stored). */
export function effectiveRate(rate: string, bufferPct: string): string | null {
  const r = parseDecimal(rate);
  const b = parseDecimal(bufferPct);
  if (!r || !b) return null;
  // Work at 14 places, then round to the stored 10.
  const rS = toScale(r, 14);
  const bS = toScale(b, 14);
  const hundred = 100n * 10n ** 14n;
  const product = rS * (hundred + bS); // scale 14 + 14
  const eff = roundHalfUp(product, hundred * 10n ** BigInt(14 - RATE_DP)); // -> scale RATE_DP
  return format(eff, RATE_DP);
}

/** usdPrice × effectiveRate, rounded half-up to 2 places (as stored). */
export function convertPrice(usdPrice: string, effective: string): string | null {
  const p = parseDecimal(usdPrice);
  const e = parseDecimal(effective);
  if (!p || !e) return null;
  const product = p.units * e.units; // scale p.dp + e.dp
  const scale = p.dp + e.dp;
  const out = scale >= 2 ? roundHalfUp(product, 10n ** BigInt(scale - 2)) : product * 10n ** BigInt(2 - scale);
  return format(out, 2);
}

/** Sanity ranges; mirror _diamond_fx_check_rates in the migration. */
export const FX_RATE_LIMITS = {
  GBP: { min: 0.4, max: 1.2 },
  CAD: { min: 1.0, max: 2.0 },
} as const;

export function rateInRange(currency: 'GBP' | 'CAD', rate: string): boolean {
  const n = Number(rate);
  if (!parseDecimal(rate) || !Number.isFinite(n)) return false;
  return n >= FX_RATE_LIMITS[currency].min && n <= FX_RATE_LIMITS[currency].max;
}

export function bufferInRange(buffer: string): boolean {
  const n = Number(buffer);
  return !!parseDecimal(buffer) && n >= 0 && n <= 25;
}

/** Relative move between two rates (0.031 = 3.1%). */
export function rateMove(next: string, previous: number | string | null | undefined): number | null {
  const a = Number(next);
  const b = Number(previous);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= 0) return null;
  return Math.abs(a / b - 1);
}
