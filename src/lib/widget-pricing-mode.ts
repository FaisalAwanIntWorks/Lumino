// Ring OS widget pricing modes (client_onboarding_preferences.widget_pricing_mode).
//
//   estimates      — products priced at a fixed deposit on Shopify; the widget
//                    sends the shopper to Shopify checkout for that deposit.
//   custom_pricing — full dynamic pricing (coming soon).
//   no_deposit     — no checkout at all. The widget shows the estimate and then
//                    collects the shopper's contact details, which are stored as
//                    a lead (saved_designs) and synced to the CRM.
//
// The column is plain text with no DB check constraint, so adding a mode needs
// no migration — only the places listed below need to know about it.

export type WidgetPricingMode = 'estimates' | 'custom_pricing' | 'no_deposit';

export const NO_DEPOSIT_MODE = 'no_deposit' as const;

/** True for the lead-capture mode that replaces Add to Cart with a contact form. */
export function isNoDepositMode(mode?: string | null): boolean {
  return mode === NO_DEPOSIT_MODE;
}

/**
 * Modes where the client's ring products are never pushed to Shopify — either
 * because only the deposit product is used (estimates) or because checkout is
 * skipped entirely (no_deposit).
 */
export function skipsShopifyCatalog(mode?: string | null): boolean {
  return mode === 'estimates' || mode === NO_DEPOSIT_MODE;
}
