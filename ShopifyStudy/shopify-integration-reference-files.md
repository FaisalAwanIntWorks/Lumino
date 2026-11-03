# Shopify Integration — Reference Files

A complete map of all source files, edge functions, and database migrations related to the **Shopify integration** in the JewlX platform.

---

## 1. Edge Functions (Backend)

Located in `supabase/functions/`.

| Function | Purpose |
|---|---|
| `shopify-test-connection/index.ts` | Validates Shopify Admin API credentials (store URL + access token). |
| `shopify-push-catalog/index.ts` | Syncs ring catalog to Shopify as products (batched, with retry logic). |
| `shopify-push-stones/index.ts` | Pushes stone/diamond catalog presets to Shopify. |
| `shopify-push-form-product/index.ts` | Creates deposit/form-specific Shopify products (custom rings, grillz, custom enquiries). |
| `shopify-add-to-cart/index.ts` | Builds Shopify cart permalinks (with diamond passed as line-item attributes). |
| `shopify-form-checkout/index.ts` | Generates checkout URL for form-based deposit flows (rings, grillz, custom). |
| `shopify-order-webhook/index.ts` | Webhook handler for `orders/create` from Shopify (HMAC-verified). |
| `register-shopify-webhooks/index.ts` | Registers ORDERS_CREATE webhook on Shopify with rotated secret. |

**Related supporting functions:**
- `supabase/functions/notify-order-update/index.ts` — triggered by Shopify order events.
- `supabase/functions/_shared/activity-logger.ts` — logs Shopify sync events.

---

## 2. Frontend Source Files

### Pages
| Path | Purpose |
|---|---|
| `src/pages/client/Shopify.tsx` | Main client-facing Shopify connection & settings page. |
| `src/pages/client/Catalog.tsx` | Ring catalog with sync-to-Shopify controls. |
| `src/pages/client/Orders.tsx` | Client orders synced from Shopify. |
| `src/pages/admin/Orders.tsx` | Admin order management (Shopify-sourced). |
| `src/pages/client/Embed.tsx` | Embed widget configuration (uses Shopify checkout). |
| `src/pages/client/DiamondsForm.tsx` | Diamond form leads (Shopify deposit flow). |

### Components
| Path | Purpose |
|---|---|
| `src/components/catalog/ShopifySyncProgress.tsx` | UI for Shopify sync progress & retry. |
| `src/components/catalog/WidgetPricingModeCard.tsx` | Pricing mode controls tied to Shopify push. |
| `src/components/catalog/DiamondPresetEditor.tsx` | Diamond presets pushed to Shopify. |
| `src/components/catalog/LabDiamondPresetEditor.tsx` | Lab diamond presets for Shopify. |
| `src/components/form-wizard/DepositCheckoutButton.tsx` | "Proceed to checkout" button → `shopify-form-checkout`. |
| `src/components/orders/OrderDetailView.tsx` | Order details (Shopify metadata). |
| `src/components/orders/OrderDetailDialog.tsx` | Modal view of Shopify order. |
| `src/components/orders/CadFilesSection.tsx` | CAD files linked to Shopify orders. |
| `src/components/ring-builder-wizard/RingBuilderWizardForm.tsx` | Wizard ending in Shopify checkout. |
| `src/components/grill-builder/GrillBuilderForm.tsx` | Grillz wizard ending in Shopify checkout. |
| `src/components/custom-enquiry/CustomEnquiryForm.tsx` | Custom enquiry deposit → Shopify. |
| `src/components/settings/LoggingTabContent.tsx` | Shopify sync logs UI. |

### Contexts & Hooks
| Path | Purpose |
|---|---|
| `src/contexts/SyncContext.tsx` | Global sync state (Shopify ring sync orchestrator with batched retries). |
| `src/hooks/useOnboardingChecklist.ts` | Checks if Shopify is connected during onboarding. |
| `src/hooks/useCustomerHub.ts` | Surfaces Shopify orders in customer timeline. |
| `src/hooks/useClientActivityLogger.ts` | Logs Shopify-related events. |
| `src/hooks/useClientRingFormConfig.ts` | Form config tied to Shopify deposit products. |

### Libraries / Utilities
| Path | Purpose |
|---|---|
| `src/lib/encryption-utils.ts` | Encrypt/decrypt Shopify Admin & Storefront tokens via Supabase RPCs. |
| `src/lib/checkout-error-utils.ts` | Parse Shopify checkout errors. |
| `src/lib/order-utils.ts` | Order helpers (Shopify mapping). |
| `src/lib/secrets-utils.ts` | Secret retrieval helpers (Shopify tokens). |
| `src/lib/auth-utils.ts` | Auth helpers used by Shopify API calls. |
| `src/lib/rate-limit-client.ts` | Throttling for Shopify-bound calls. |
| `src/lib/activity-logger.ts` | Activity log entries for Shopify events. |

---

## 3. Database Migrations

Migrations that introduced or modified Shopify-related schema (encrypted tokens, sync state, deposit products, webhook secrets, order mappings):

- `supabase/migrations/20251117202023_*.sql` — Initial Shopify connection columns on `clients`.
- `supabase/migrations/20251118022203_*.sql` — Encrypted Shopify Admin token storage.
- `supabase/migrations/20251118080616_*.sql` — Storefront token encryption.
- `supabase/migrations/20251120181011_*.sql` — Shopify sync queue / state tracking.
- `supabase/migrations/20251124143316_*.sql` — Shopify product mapping table.
- `supabase/migrations/20251124150500_*.sql` — Sync retry & failure tracking.
- `supabase/migrations/20251209150110_*.sql` — Diamond presets sync columns.
- `supabase/migrations/20260109043748_*.sql` → `20260109095023_*.sql` — Webhook secret encryption + order webhook tables.
- `supabase/migrations/20260113122940_*.sql` — Order line item attributes (diamond pass-through).
- `supabase/migrations/20260119074118_*.sql` — Form deposit product mapping.
- `supabase/migrations/20260125104602_*.sql`, `20260125105340_*.sql`, `20260125114911_*.sql` — Multi-form deposit products (ring/grillz/custom).
- `supabase/migrations/20260131215155_*.sql`, `20260131225936_*.sql`, `20260131232144_*.sql` — Sync logs and retry queue.
- `supabase/migrations/20260201130106_*.sql` — Order-to-CAD linking.
- `supabase/migrations/20260223104845_*.sql` — Shopify order metadata expansion.
- `supabase/migrations/20260304074313_*.sql` — Stones/diamond presets sync.
- `supabase/migrations/20260314142503_*.sql`, `20260315155916_*.sql` — Catalog price sync hardening.
- `supabase/migrations/20260324141826_*.sql` — Shopify webhook idempotency.
- `supabase/migrations/20260409185939_*.sql`, `20260414094731_*.sql`, `20260416095555_*.sql` — Order sync & customer linkage.
- `supabase/migrations/20260418060213_*.sql` — Final Shopify deposit/order schema cleanup.

---

## 4. Documentation

- `IntegrationsStudy/jewlx-integrations.md` — Master integration index (Shopify section).
- `ThirdPartyIntegrationsFinding/Shopify.md` — Detailed Shopify integration findings.

---

## 5. Architectural Notes

- **Token Security**: Shopify Admin & Storefront tokens are AES-encrypted server-side via Postgres RPCs (`encrypt_shopify_token`, `decrypt_shopify_token`, `encrypt_storefront_token`, `decrypt_storefront_token`). Never exposed to the client.
- **Checkout Strategy**: Uses **Cart Permalinks** instead of Storefront API draft orders — diamonds are passed as **line-item attributes**, never synced as standalone products.
- **Sync Architecture**: Background batched sync (15 items/batch) with 3 inner retries + 5 outer retries. Persistent across navigation via `SyncContext`.
- **Webhooks**: `ORDERS_CREATE` registered with HMAC-verified secret; idempotent processing.
- **Required Scopes**: See memory `integration/shopify-custom-app-permissions` for full Admin & Storefront API scope list.
- **Self-Healing Checkout**: Missing Shopify variants are auto-recreated; deferred deposit CTA prevents broken checkouts.

---

_Generated for JewlX platform — internal reference document._
