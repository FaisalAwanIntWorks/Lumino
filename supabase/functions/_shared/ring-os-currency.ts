// Server mirror of src/lib/ring-os-currency.ts (and the SQL
// ring_os_currency_client_allowed) — keep all three in sync.
// Only these accounts can pick a Ring OS catalogue currency (USD / GBP / CAD).

export const RING_OS_CURRENCY_CLIENT_IDS: ReadonlySet<string> = new Set([
  'dcd952fc-783b-4a92-be7f-62751265c650', // Sandbox · JewlX
]);

export const RING_OS_CURRENCIES = ['USD', 'GBP', 'CAD'] as const;
export type RingOsCurrency = (typeof RING_OS_CURRENCIES)[number];

const SYMBOLS: Record<RingOsCurrency, string> = { USD: '$', GBP: '£', CAD: 'C$' };

export function usesRingOsCurrency(clientId?: string | null): boolean {
  return !!clientId && RING_OS_CURRENCY_CLIENT_IDS.has(clientId);
}

export function normalizeRingOsCurrency(value: unknown): RingOsCurrency {
  const upper = typeof value === 'string' ? value.trim().toUpperCase() : '';
  return (RING_OS_CURRENCIES as readonly string[]).includes(upper) ? (upper as RingOsCurrency) : 'USD';
}

export function ringOsCurrencySymbol(currency: RingOsCurrency): string {
  return SYMBOLS[currency];
}

/** Catalogue currency for an allow-listed client; USD for everyone else. */
// deno-lint-ignore no-explicit-any
export async function resolveRingOsCurrency(supabase: any, clientId: string): Promise<RingOsCurrency> {
  if (!usesRingOsCurrency(clientId)) return 'USD';
  const { data } = await supabase
    .from('clients')
    .select('ring_catalog_currency')
    .eq('id', clientId)
    .maybeSingle();
  return normalizeRingOsCurrency(data?.ring_catalog_currency);
}
