# Shopify Add-to-Cart — Complete Workflow & File Reference

Single-source guide for every file, database object, and edge function that participates when a shopper clicks **Add to Cart** on the Ring OS widget and is redirected to Shopify checkout.

---

## 1. Overview

`shopify-add-to-cart` is the edge function invoked by the Ring OS embed widget (and Ring Builder pages) when the shopper finishes configuring a ring and clicks **Add to Cart**. It:

1. Validates the ring configuration (Zod).
2. Loads the client's Shopify credentials and decrypts the **Storefront API token**.
3. Matches the ring config (style + shank + metal + shape) against the client's `client_ring_catalog`.
4. Picks the correct **Shopify variant**:
   - **Custom Pricing mode** → real synced ring variant (carat-aware via `shopify_variants_map`).
   - **Estimates mode** → the client's **deposit variant** (`widget_shopify_variant_id`) at the configured `widget_deposit_amount`. If no exact catalog row exists, the function still proceeds with the deposit variant and passes the full config as line-item attributes.
5. Creates a **Storefront API cart** (or Cart Permalink fallback) with the ring + diamond passed as **line-item attributes** (diamonds are NEVER synced as Shopify products).
6. Returns `{ checkoutUrl, cartPermalinkUrl }`. The widget redirects the top window to checkout.

---

## 2. Architecture (ASCII)

```
Shopper (Ring OS embed / Ring Builder)
   │  clicks "Add to Cart"
   ▼
EmbedConfigurator.tsx ── validates style/shank/metal/shape
   │  supabase.functions.invoke('shopify-add-to-cart', { clientId, ringConfiguration, estimatedPrice, quantity })
   ▼
supabase/functions/shopify-add-to-cart/index.ts
   │
   ├── Zod validate request                       (RequestSchema)
   ├── SELECT clients (store URL, token cipher)   ── public.clients
   ├── RPC decrypt_storefront_token               ── pgsodium
   ├── SELECT client_ring_catalog rows            ── public.client_ring_catalog
   │       └── match style+shank+metal+shape
   ├── SELECT client_preferences                  ── widget_pricing_mode,
   │                                                  widget_deposit_amount,
   │                                                  widget_shopify_variant_id
   ├── Resolve variant
   │       ├── estimates → deposit variant
   │       └── custom   → shopify_variants_map[caratLabel] || shopify_variant_id
   ├── Build line-item attributes
   │       (ring style/shank/metal/shape/size/carat/engraving + diamond pass-through)
   ├── POST Shopify Storefront GraphQL  cartCreate
   │   (fallback) Cart Permalink URL  /cart/<variant>:<qty>?attributes=...
   └── INSERT activity log / analytics rows       ── public.client_activities
   ▼
Returns { checkoutUrl | cartPermalinkUrl }
   ▼
EmbedConfigurator.safeRedirect() → window.top.location = checkoutUrl
   ▼
Shopify Checkout (deposit amount in estimates mode, full ring price in custom mode)
```

---

## 3. Edge Function (primary)

| Path | Role |
|---|---|
| `supabase/functions/shopify-add-to-cart/index.ts` | The function. Validates payload, decrypts Storefront token, matches catalog row, resolves variant by mode, builds attributes, creates Shopify cart, returns checkout URL. |
| `supabase/config.toml` | Declares `[functions.shopify-add-to-cart] verify_jwt = false` (widget is anonymous). |

### Key behaviors inside `index.ts`

- **Imports**: `npm:@supabase/supabase-js@2`, `npm:zod@3.23.8`, `Deno.serve`.
- **Auth**: uses `SUPABASE_SERVICE_ROLE_KEY` (bypasses RLS; widget is unauthenticated).
- **Tables read**: `clients`, `client_ring_catalog`, `client_preferences`.
- **RPCs called**: `decrypt_storefront_token(client_user_id uuid)`.
- **Mode resolution** (`isEstimatesMode = widget_pricing_mode !== 'custom'`):
  - Estimates → `ringVariantId = widget_shopify_variant_id` (deposit).
  - Custom   → `ringVariantId = shopify_variants_map[caratLabel] || shopify_variant_id`.
- **Graceful fallback (post-fix)**: missing catalog match only blocks in **Custom Pricing mode**; in Estimates mode it proceeds with the deposit variant and the full config travels as line-item attributes. All downstream `matchingRing.id` reads are null-safe.
- **Diamond handling**: passed as cart **line-item properties** (`Stone Type`, `Carat`, `Color`, `Clarity`, `Report No`, `Price`). Never synced as a Shopify product.
- **Shopify call**: Storefront API `cartCreate` mutation (GraphQL) using the decrypted Storefront token; on failure, returns a Cart Permalink URL.

---

## 4. Frontend Files

| Path | Role |
|---|---|
| `src/pages/EmbedConfigurator.tsx` | Hosts the embed widget. Builds the ring config, calls `supabase.functions.invoke('shopify-add-to-cart', …)` at line ~641, parses errors, redirects top window to `data.checkoutUrl` / `cartPermalinkUrl` via `safeRedirect`. |
| `src/pages/RingBuilder.tsx` | Authenticated Ring Builder page — same add-to-cart flow when previewing/testing as a client. |
| `src/pages/CustomRingBuilder.tsx` | Custom ring builder variant — shares the same add-to-cart edge function. |
| `src/components/catalog/WidgetPricingModeCard.tsx` | Where the client toggles **Estimates vs Custom Pricing** and sets `widget_deposit_amount` / `widget_shopify_variant_id`. Directly controls how add-to-cart resolves the variant. |
| `src/components/form-wizard/DepositCheckoutButton.tsx` | Sibling flow for form-deposit checkouts — uses `shopify-form-checkout`, but shares deposit-variant infrastructure. |
| `src/lib/checkout-error-utils.ts` | `extractCheckoutErrorAsync` — parses the non-2xx `error.context` response body so the toast shows the real edge-function error message. |
| `src/lib/rate-limit-client.ts` | Client-side throttle for repeated add-to-cart attempts. |
| `src/lib/xss-sanitizer.ts` | Sanitizes engraving / free-text fields before they reach the edge function. |
| `src/contexts/SyncContext.tsx` | Background Shopify sync state — ensures `client_ring_catalog` rows actually have `shopify_product_id` / `shopify_variant_id` before custom-pricing checkout works. |
| `src/lib/encryption-utils.ts` | Client-side helper around `encrypt_storefront_token` / `decrypt_storefront_token` RPCs (used during setup, not at cart time). |

---

## 5. Database Objects

### Tables read at add-to-cart time

| Table | Columns used |
|---|---|
| `public.clients` | `id`, `user_id`, `shopify_store_url`, `shopify_checkout_domain`, `company_name`, `shopify_storefront_token_encrypted` |
| `public.client_ring_catalog` | `id`, `style`, `shank`, `metal`, `shape`, `shopify_product_id`, `shopify_variant_id`, `shopify_variants_map` |
| `public.client_preferences` | `widget_pricing_mode`, `widget_deposit_amount`, `widget_shopify_variant_id` |

### RPCs

- `public.decrypt_storefront_token(client_user_id uuid)` — pgsodium-backed decryption of Storefront API token.
- `public.encrypt_storefront_token(...)` — used during Shopify setup, not at cart time.

### Migrations that built the add-to-cart surface

| Migration | Purpose |
|---|---|
| `supabase/migrations/20251209150110_*.sql` | Initial diamond-preset / catalog Shopify sync columns. |
| `supabase/migrations/20251209151513_*.sql` | Catalog Shopify product/variant id columns on `client_ring_catalog`. |
| `supabase/migrations/20251227075435_*.sql` | `shopify_variants_map` JSONB (carat-aware variants). |
| `supabase/migrations/20260107085032_*.sql` | Storefront token encryption RPCs / columns. |
| `supabase/migrations/20260109043748_*.sql` | Storefront / webhook token encryption + decrypt RPC. |
| `supabase/migrations/20260109091355_*.sql` | RLS hardening on encrypted token columns. |
| `supabase/migrations/20260113171605_*.sql` | `widget_pricing_mode`, `widget_deposit_amount`, `widget_shopify_variant_id` on `client_preferences`. |
| `supabase/migrations/20260113171739_*.sql` | Deposit-variant indexes / defaults. |
| `supabase/migrations/20260331165227_*.sql` | Line-item attribute schema hardening (diamond pass-through). |
| `supabase/migrations/20260423161953_*.sql` | Catalog match indexes for fast lookup at cart time. |
| `supabase/migrations/20260507023431_*.sql` | Estimates-vs-Custom mode constraints / defaults. |
| `supabase/migrations/20260507194858_*.sql` | Deposit variant repair + back-fill. |
| `supabase/migrations/20260528100003_diamond-presets-return-report-no.sql` | Adds diamond `reportNo` so it flows into cart line-item attributes. |

> Token-encryption + Shopify infra migrations are also indexed in `ShopifyStudy/shopify-integration-reference-files.md`.

---

## 6. Adjacent Edge Functions (context)

| Function | Why it matters to add-to-cart |
|---|---|
| `shopify-push-catalog` | Populates `client_ring_catalog.shopify_product_id` / `shopify_variant_id` / `shopify_variants_map`. Without it, **Custom Pricing** add-to-cart fails ("Catalog item not synced"). |
| `shopify-push-form-product` | Creates the **deposit product/variant** that fills `widget_shopify_variant_id`. Without it, **Estimates mode** returns *"Deposit product is not yet set up…"*. |
| `shopify-test-connection` | Pre-flight check — verifies the Storefront/Admin tokens before cart time. |
| `shopify-form-checkout` | Sibling flow for form-deposit checkouts (rings/grillz/custom enquiry). |
| `shopify-order-webhook` | Receives the resulting Shopify order with all line-item attributes intact. |
| `register-shopify-webhooks` | Registers `ORDERS_CREATE` so cart → checkout → order round-trips back into the platform. |

---

## 7. End-to-End Workflow (step-by-step)

1. **Shopper** finishes ring config in the embed widget.
2. `EmbedConfigurator.handleAddToCart` validates `style/shank/metal/shape` present; calls `supabase.functions.invoke('shopify-add-to-cart', { clientId, ringConfiguration, estimatedPrice, quantity })`.
3. **Edge function** parses + Zod-validates body.
4. Loads `clients` row → confirms `shopify_store_url` exists.
5. Calls `decrypt_storefront_token` RPC → gets Storefront API token (returns 400 with actionable message if missing).
6. SELECTs all `client_ring_catalog` rows for the client and finds the row where normalized style/shank/metal/shape all match (color family aliasing: `platinum`/`silver` → `white`).
7. SELECTs `client_preferences` → reads `widget_pricing_mode`, `widget_deposit_amount`, `widget_shopify_variant_id`.
8. Resolves variant:
   - **Estimates** → `ringVariantId = widget_shopify_variant_id` (errors if not configured).
   - **Custom** → `ringVariantId = shopify_variants_map[caratLabel] || shopify_variant_id` (errors if catalog row is not synced to Shopify).
   - **Estimates + no catalog match** → proceeds with deposit variant, logs a warning, passes config as attributes.
9. Builds line-item attributes: ring details + engraving + diamond pass-through + `_pricing_mode` + `_catalog_item_id`.
10. Calls Shopify Storefront `cartCreate` GraphQL mutation → gets `checkoutUrl`. Falls back to Cart Permalink URL if needed.
11. Returns `{ success: true, checkoutUrl, cartPermalinkUrl }`.
12. **Frontend** redirects top window via `safeRedirect(checkoutUrl)`.
13. Shopper completes payment on Shopify → `shopify-order-webhook` ingests the order with all attributes intact.

---

## 8. Common Failure Modes & Where to Look

| Symptom | Root cause | Where |
|---|---|---|
| `"This ring configuration is not available in your catalog."` | Custom Pricing mode + no matching `client_ring_catalog` 4-tuple. | Catalog gap — sync the missing combo via `shopify-push-catalog`. |
| `"Deposit product is not yet set up…"` | Estimates mode + `widget_shopify_variant_id` is null. | `WidgetPricingModeCard.tsx` → save deposit amount; runs `shopify-push-form-product`. |
| `"Storefront token missing…"` | `decrypt_storefront_token` returned null. | Client → Settings → Shopify → paste Storefront API token. |
| `"Catalog item not synced to Shopify"` | Custom mode + matched row missing `shopify_product_id`/`shopify_variant_id`. | Re-run catalog sync; check `SyncContext` for retry state. |
| Generic "Failed to add to cart" toast | Frontend swallowed real edge error. | `checkout-error-utils.ts → extractCheckoutErrorAsync` parses `error.context`. |
| Cart loads but diamond missing | Line-item attributes dropped. | Ensure Cart Permalink fallback isn't used (it strips attrs in some themes); use `cartCreate` path. |

---

## 9. Key Architectural Notes

- **Diamonds are never Shopify products** — passed only as line-item attributes (memory: `integration/shopify-diamond-line-item-logic`).
- **Estimates mode = deposit variant** at checkout; the *full* ring price travels as metadata so the merchant can invoice the balance later.
- **Custom Pricing mode = real synced variant** with carat-aware variant resolution via `shopify_variants_map`.
- **Tokens** are encrypted at rest in `clients.shopify_storefront_token_encrypted`; only decrypted server-side inside the edge function via SECURITY DEFINER RPC.
- **No JWT** required on the function (widget is anonymous), but service role is used internally → all access is gated by `clientId` lookup.
- **Cart Permalink fallback** drops a blank cart session in some themes — `cartCreate` is the primary path because it preserves attributes.

---

## 10. Where to Start Debugging

- **Backend brain**: `supabase/functions/shopify-add-to-cart/index.ts`
- **Frontend trigger**: `src/pages/EmbedConfigurator.tsx` (line ~641)
- **Mode/deposit config**: `src/components/catalog/WidgetPricingModeCard.tsx`
- **Sync state for custom mode**: `src/contexts/SyncContext.tsx`
- **Error surfacing**: `src/lib/checkout-error-utils.ts`
- **Live logs**: Supabase Edge Function logs for `shopify-add-to-cart` (filter by client id prefix).

---

_Generated as a portable reference for the JewlX Ring OS Shopify add-to-cart pipeline._
