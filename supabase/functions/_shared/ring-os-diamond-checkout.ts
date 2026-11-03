// Server mirror of src/lib/ring-os-diamond-checkout.ts — keep both in sync.
// Accounts listed here split Ring OS checkout by diamond type:
// natural -> lead capture only (no cart), lab -> full-price ring + diamond cart.

export const DIAMOND_TYPE_CHECKOUT_CLIENT_IDS: ReadonlySet<string> = new Set([
  '9311d1ea-09d1-4f5c-a03c-baf0101ab6c5', // 24k Carat Jewelers
]);

export function usesDiamondTypeCheckout(clientId?: string | null): boolean {
  return !!clientId && DIAMOND_TYPE_CHECKOUT_CLIENT_IDS.has(clientId);
}
