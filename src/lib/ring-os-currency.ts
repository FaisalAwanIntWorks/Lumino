// Ring OS catalogue currency (USD / GBP / CAD).
//
// Only allow-listed accounts (currently the Sandbox account JewlX) can pick a
// catalogue currency; every other account keeps today's behaviour. Ring step
// prices (styles, shanks, metals) are typed in the chosen currency and never
// converted. Diamond prices in GBP / CAD come from the admin-approved FX
// version (diamond_pool_fx_prices) through get_diamond_presets_filtered.
//
// Mirrored in supabase/functions/_shared/ring-os-currency.ts and in SQL
// (ring_os_currency_client_allowed, migration 20261028120000) — keep all three
// in sync.

export const RING_OS_CURRENCY_CLIENT_IDS: ReadonlySet<string> = new Set([
  'dcd952fc-783b-4a92-be7f-62751265c650', // Sandbox · JewlX
]);

export const RING_OS_CURRENCIES = ['USD', 'GBP', 'CAD'] as const;
export type RingOsCurrency = (typeof RING_OS_CURRENCIES)[number];

export const RING_OS_CURRENCY_META: Record<RingOsCurrency, { label: string; symbol: string }> = {
  USD: { label: 'US Dollar', symbol: '$' },
  GBP: { label: 'British Pound', symbol: '£' },
  CAD: { label: 'Canadian Dollar', symbol: 'C$' },
};

/** Per-currency price column on client_option_prices / client_metal_variants. */
export type RingOsPriceColumn = 'price_usd' | 'price_gbp' | 'price_cad';

export function usesRingOsCurrency(clientId?: string | null): boolean {
  return !!clientId && RING_OS_CURRENCY_CLIENT_IDS.has(clientId);
}

export function isRingOsCurrency(value: unknown): value is RingOsCurrency {
  return typeof value === 'string' && (RING_OS_CURRENCIES as readonly string[]).includes(value);
}

export function normalizeRingOsCurrency(value: unknown): RingOsCurrency {
  const upper = typeof value === 'string' ? value.trim().toUpperCase() : '';
  return isRingOsCurrency(upper) ? upper : 'USD';
}

export function ringOsPriceColumn(currency: RingOsCurrency): RingOsPriceColumn {
  return `price_${currency.toLowerCase()}` as RingOsPriceColumn;
}

/** Saved amount for one currency, or null when none was entered in it yet. */
export function readRingOsPrice(
  row: Partial<Record<RingOsPriceColumn, number | string | null>> | null | undefined,
  currency: RingOsCurrency,
): number | null {
  const raw = row?.[ringOsPriceColumn(currency)];
  if (raw === null || raw === undefined || raw === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}
