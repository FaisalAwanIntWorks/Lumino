# Shopify — E-commerce, Catalog Sync & Checkout

## 1. Current Implementation

**Files (inbound + outbound):**
- `supabase/functions/shopify-add-to-cart/index.ts` — Storefront API cart creation (most complex flow).
- `supabase/functions/shopify-push-catalog/index.ts` — batched Admin API product push (15 items/batch).
- `supabase/functions/shopify-push-stones/index.ts`, `shopify-push-diamond-presets/index.ts` — stones & preset push.
- `supabase/functions/shopify-push-form-product/index.ts` — deposit product push for lead forms.
- `supabase/functions/shopify-form-checkout/index.ts` — Shopify-hosted checkout for deposits.
- `supabase/functions/shopify-test-connection/index.ts` — credential validation.
- `supabase/functions/shopify-order-webhook/index.ts` — receives `orders/create` events.
- `supabase/functions/register-shopify-webhooks/index.ts` — registers webhook URL via GraphQL Admin API.

**APIs used:**
- Admin API (GraphQL) `2024-01` — catalog push, webhook registration.
- Storefront API (GraphQL) `2024-01` — cart creation.

**Auth model:**
- Admin token encrypted at rest via pgcrypto RPC `decrypt_shopify_token` / `encrypt_shopify_token`.
- Storefront token encrypted via `decrypt_storefront_token` / `encrypt_storefront_token`.
- Webhook secret encrypted via `decrypt_webhook_secret` / `encrypt_webhook_secret`.
- Dual-auth on push endpoints: JWT (client/admin) OR Unkey API key (via `_shared/unkey.ts::dualAuth`).

**Flow:**
1. Admin pushes catalog in batches (retries via `retryFailedOnly` flag).
2. Customer uses Ring Builder widget → `shopify-add-to-cart` → Storefront API `cartCreate` → returns `checkoutUrl`.
3. Customer completes payment on Shopify checkout.
4. Shopify fires `orders/create` webhook → `shopify-order-webhook` inserts into `orders` table + cross-posts leads + fires Meta CAPI Purchase event.

## 2. What's Working Well

- ✅ Encryption-at-rest for Shopify tokens via pgcrypto (good).
- ✅ HMAC-SHA256 verification function present (`verifyShopifyWebhook`, `shopify-order-webhook/index.ts:11-38`).
- ✅ Source detection via `_source: "JewelX Ring Builder"` note-attribute — ignores non-JewelX orders cleanly.
- ✅ Duplicate-order guard by `shopify_order_id` uniqueness check (`:279-288`).
- ✅ Zod input validation on `shopify-add-to-cart` (`:12-41`) — schema-level guard against malicious payloads.
- ✅ Batched catalog push (15 items/batch) prevents Shopify rate-limit blowups on large catalogs.
- ✅ Generic error messages to client, details to internal logs (`shopify-add-to-cart/index.ts:565-590`).
- ✅ Cart permalink fallback URL built for environments where the `cartCreate` GraphQL response isn't enough.
- ✅ Webhook registration avoids duplicates via `webhookSubscriptions` query first.

## 3. Critical Gaps / Security Concerns

### 🔴 P0 — HMAC verification is optional, not enforced

`shopify-order-webhook/index.ts:264-275`:
```ts
if (hmacHeader) {
  ...
  if (!isValid) {
    console.warn('HMAC signature mismatch for order:', orderData.id, '- proceeding with client_id auth');
  }
}
```

**Why this is dangerous:**
- If `hmacHeader` is missing or the stored secret is null, verification is skipped entirely.
- Even when HMAC fails, the function "proceeds with client_id auth" — but `client_id` is a UUID passed via `?client_id=...` in the publicly-known webhook URL (registered in the Shopify dashboard). An attacker who discovers or brute-forces a valid client UUID can POST a fake `orders/create` payload and insert phantom orders.
- Phantom orders trigger customer email notifications (`notify-customer-confirmation`) and Meta CAPI `Purchase` events (inflating ad spend ROAS metrics).

**Fix:**
1. Make HMAC verification **mandatory** — if `hmacHeader` missing or signature invalid → return 401 immediately.
2. If no stored secret for this client, reject.

### 🔴 P0 — `client_id` as URL query param is a weak auth factor

Anyone who inspects the registered webhook URL in Shopify (anyone with Shopify admin access = store owner + collaborators + any staff) sees the client UUID. Combined with the HMAC bypass above, this is the primary attack vector.

**Fix:** Always rely on HMAC. Remove `client_id` from URL; instead look up the client from the `X-Shopify-Shop-Domain` header + verified HMAC pair.

### 🟠 P1 — Webhook registration uses deprecated `webhookSubscriptionCreate` format

Shopify GraphQL Admin API `2024-01` is supported but the 2025 versions move to `webhookSubscription` with different fields. API version upgrade cadence is quarterly; current code will break ~9 months from pinning.

**Fix:** Add a `SHOPIFY_API_VERSION` constant and bump quarterly; monitor Shopify deprecation emails.

### 🟠 P1 — Webhook secret generation path is broken

`register-shopify-webhooks/index.ts:84` generates a random secret on the client side and stores it via `encrypt_webhook_secret`. **But Shopify itself generates the signing secret** — it's shown in the Shopify admin → Settings → Notifications page, not accepted as input when you create a webhook via API. So your locally-generated secret will never match what Shopify signs with.

Expected behavior: the HMAC verification **can never succeed** the way this is wired — which explains why the code falls back silently instead of rejecting.

**Fix:** Fetch the real webhook secret from Shopify (it's returned in the `webhookSubscriptionCreate` response for mandatory webhooks, or admin must paste it manually) and store that. Alternative: use the **App-level API secret** (not per-subscription) that Shopify signs all webhooks from a single app with.

### 🟠 P1 — Webhook processing is not idempotent by `event.id`

Only duplicate-guard is by `shopify_order_id`. But Shopify can retry webhooks on 5xx / timeout — if the `orders.insert` succeeds but the response never reaches Shopify, a retry with a new `X-Shopify-Webhook-Id` may race ahead of the duplicate check and fire duplicate notifications (`notify-customer-confirmation`, `notify-order-update`, Meta CAPI).

**Fix:** Insert `X-Shopify-Webhook-Id` into a `webhook_events_seen` table with unique constraint. Return 200 fast if already seen.

### 🟠 P1 — Orders webhook returns 200 on errors

`shopify-order-webhook/index.ts:488-500`:
```ts
} catch (error) {
  ...
  return new Response(..., { status: 200 ... });  // Always 200 to prevent Shopify retry
}
```

The intent is correct (don't let Shopify DDoS retry), but you're swallowing real DB failures silently. No DLQ.

**Fix:** On error, write the raw payload to `dead_letter_shopify_webhooks` table, alert ops, then return 200. Replayable later.

### 🟠 P1 — Fire-and-forget cross-posting

`crossPostGrillLead` / `crossPostCustomEnquiryLead` (`:131-189`) are invoked without `await` inside the main webhook handler (`:374-378`). If the order insert succeeds but cross-posting fails, the lead is lost and no one knows.

**Fix:** Either `await` (accept the latency) or explicitly queue to a background function.

### 🟡 P2 — Storefront Access Token can hit customer-exposed API limits

Storefront API has a 60 req/min bucket per IP by default. `shopify-add-to-cart` is called from every customer add-to-cart click — if one customer is behind a corporate NAT with 100 other customers, they share that bucket. No per-store token pooling.

### 🟡 P2 — CORS `*` on `shopify-add-to-cart`

Allows any origin to call cart creation with a valid `clientId`. Combined with no rate-limit on this function, a bot can create millions of fake carts in the client's Shopify store → skew inventory analytics, hit Shopify's plan limits.

**Fix:** Restrict `Access-Control-Allow-Origin` to the client's known storefront domains + JewlX vault domain. Add a per-IP rate limit.

### 🟡 P2 — GraphQL query strings are inline, not typed

Long GraphQL strings (`cartCreateMutation`, `listWebhooksQuery`) are template literals. No type-check on response shape → silent NPE if Shopify changes shape.

**Fix:** Add a minimal typed client (e.g., `graphql-request` + codegen from Shopify schema).

## 4. Performance & Optimization Issues

| Issue | File:Line | Impact |
|-------|-----------|--------|
| `shopify-push-catalog` does serial GraphQL calls with `await delay(…)` between each | `shopify-push-catalog/index.ts:96` | Catalog of 500 products = ~8+ minutes — blocks UI |
| No parallel push within a batch | same | Wastes Shopify's 2-req/sec burst allowance (Admin API) |
| Catalog push has no resume token on error | same | Failed batch must be retried whole |
| `notify-order-update` and `notify-customer-confirmation` are chained via `supabase.functions.invoke` (not `await`-ed consistently) | `shopify-order-webhook/index.ts:382,416` | Each is a cold-start edge invocation — adds 200-500ms latency each |
| Ring-match normalization regex compiled per call | `shopify-add-to-cart/index.ts:142-149` | Minor — acceptable |
| `catalogItems?.find(item => ...)` scans entire catalog per cart creation | `shopify-add-to-cart/index.ts:195-214` | O(N) per request; for a 2k-item catalog this is wasteful |

**Optimizations:**
- Add a `(style, shank, metal_color, shape) → catalog_item_id` unique index and look up by key instead of `.find()`.
- Use Shopify's `bulkOperationRunMutation` for catalog pushes > 50 items — asynchronous but massively more throughput.
- Background-queue the lead cross-posting and the email notifications (pg_cron or a `jobs` table).
- Cache `shopify_store_url` / `accessToken` decrypt result in-memory per invocation (already ephemeral, but decrypt RPC is called on every add-to-cart).

## 5. Industry-Standard SaaS Checklist

- [ ] **HMAC verification mandatory** on every webhook; reject on failure.
- [ ] **Webhook event-ID dedup table** with unique constraint.
- [ ] **Dead-letter queue** for failed webhook processing.
- [ ] **Per-store rate-limit budget tracking** — know your cost of every request against Shopify's leaky-bucket.
- [ ] **Bulk operations API** for catalog pushes > 50 items.
- [ ] **Retry with exponential backoff** on 429 / 5xx from Admin + Storefront APIs.
- [ ] **Structured GraphQL client** with schema codegen, not inline strings.
- [ ] **API version rotation policy** — test the next Shopify API version at least a month before forced migration.
- [ ] **Typed responses** for every GraphQL call — no `any` chains.
- [ ] **Webhook replay tool** for ops to manually re-process DLQ entries.
- [ ] **Storefront CORS allowlist** — origin locked to client's domains.
- [ ] **Per-client rate limit** on cart creation (e.g., 30/min/IP).
- [ ] **Synthetic canary order** nightly to detect broken webhook or auth expiry.
- [ ] **Token expiry monitoring** — Shopify private apps with offline tokens don't expire but app tokens do; track.
- [ ] **Catalog sync state machine**: `pending → syncing → synced | failed` with clear retry paths (already partially done via `shopify_sync_status`).
- [ ] **Webhook fan-out isolation** — order webhook doesn't directly call email/analytics; it enqueues, a worker processes.
- [ ] **Per-client scopes minimized** — don't request more Shopify scopes than you need.

## 6. Action Items (Prioritized)

### P0

1. **Enforce HMAC on `shopify-order-webhook`.**
   - Reject (401) if `X-Shopify-Hmac-SHA256` header is missing.
   - Reject (401) if signature doesn't match stored secret.
   - Never fall back to `client_id` query-param auth.
2. **Fix the webhook secret flow.** Currently `register-shopify-webhooks` generates a local random secret but Shopify signs with its own. Options:
   - (a) Use the **Shopify App API shared secret** (single app-level secret) — fetch once, store encrypted, use to verify all subscriptions.
   - (b) If using private/custom app, document that admin must paste the app's API secret into the JewlX settings, then store it encrypted.
3. **Add webhook-event idempotency** — insert `X-Shopify-Webhook-Id` into a table with unique constraint before processing.
4. **Add DLQ table** `dead_letter_shopify_webhooks(payload jsonb, error text, created_at timestamptz)` and write to it on any processing failure.

### P1

5. Stop using `client_id` in the webhook URL. Route by `X-Shopify-Shop-Domain` + HMAC only.
6. Replace inline GraphQL strings with a typed client.
7. Await or queue the cross-post / notification calls inside `shopify-order-webhook` — don't fire-and-forget.
8. Restrict `Access-Control-Allow-Origin` on cart creation to known storefront domains.
9. Add a unique index on `client_ring_catalog(client_id, style, shank, color_family, shape)` and switch `.find()` lookup to indexed query.
10. Add retry/backoff wrapper for Shopify GraphQL calls (on 429 / 5xx).

### P2

11. Migrate catalog push to Shopify `bulkOperationRunMutation` for > 50 items.
12. Add per-IP + per-client rate limits on `shopify-add-to-cart`.
13. Pin Shopify API version in a single constant and create a quarterly rotation checklist.
14. Add a synthetic nightly canary order to confirm webhook + email + CAPI pipeline.

### P3

15. Monitor token expiry (custom app tokens can be revoked by store owner).
16. Build a webhook replay admin UI from the DLQ.
