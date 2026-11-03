// Ring OS final action resolution.
//
// Most accounts get one final action from their stored widget pricing mode.
// A small allowlist of accounts (currently 24k Carat Jewelers) instead split
// the final action by the diamond type the shopper picked:
//   natural -> lead capture (no prices shown, Name / Email / Phone form)
//   lab     -> full-price Shopify checkout (ring + diamond)
// The stored pricing mode is never changed, so the admin Estimates option
// stays exactly as it is. Mirrored server-side in
// supabase/functions/_shared/ring-os-diamond-checkout.ts — keep both in sync.

export const DIAMOND_TYPE_CHECKOUT_CLIENT_IDS: ReadonlySet<string> = new Set([
  '9311d1ea-09d1-4f5c-a03c-baf0101ab6c5', // 24k Carat Jewelers
]);

export type RingOsFinalAction = 'deposit_checkout' | 'full_checkout' | 'lead_capture';

export function usesDiamondTypeCheckout(clientId?: string | null): boolean {
  return !!clientId && DIAMOND_TYPE_CHECKOUT_CLIENT_IDS.has(clientId);
}

export function resolveRingOsFinalAction(
  clientId: string | null | undefined,
  storedPricingMode: string | null | undefined,
  stoneType: string | null | undefined,
): RingOsFinalAction {
  if (usesDiamondTypeCheckout(clientId)) {
    return stoneType === 'natural' ? 'lead_capture' : 'full_checkout';
  }
  const mode = storedPricingMode || 'estimates';
  if (mode === 'no_deposit') return 'lead_capture';
  if (mode === 'estimates') return 'deposit_checkout';
  return 'full_checkout';
}

/** True when prices must be hidden for this selection (24k natural path). */
export function hidesRingOsPrices(clientId?: string | null, stoneType?: string | null): boolean {
  return usesDiamondTypeCheckout(clientId) && stoneType === 'natural';
}
