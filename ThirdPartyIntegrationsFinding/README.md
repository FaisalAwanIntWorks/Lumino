# JewlX — Third-Party Integrations: In-Depth Audit

This folder contains a complete, integration-by-integration audit of every third-party service wired into the JewlX SaaS platform. Each file follows the same structure:

1. **Current Implementation** — what the code actually does today (based on real file reads).
2. **What's Working Well** — correctly implemented patterns worth preserving.
3. **Critical Gaps / Security Concerns** — items that can cause outages, data loss, fraud, or compliance failure.
4. **Performance & Optimization Issues** — speed, caching, rate-limit, and cost problems.
5. **Industry-Standard SaaS Checklist** — what a best-in-class implementation looks like.
6. **Action Items (Prioritized)** — P0 → P3 checklist to implement. P0 items must be fixed before scaling beyond early clients.

## Integrations Audited

| # | Integration | Purpose | File |
|---|-------------|---------|------|
| 1 | Stripe | Payments & subscriptions | [Stripe.md](./Stripe.md) |
| 2 | Shopify | Catalog sync, carts, order webhooks | [Shopify.md](./Shopify.md) |
| 3 | Resend | Transactional email | [Resend.md](./Resend.md) |
| 4 | Lovable AI Gateway | Gemini/OpenAI proxy for chat & image | [LovableAI.md](./LovableAI.md) |
| 5 | Unkey | API-key management & rate limiting | [Unkey.md](./Unkey.md) |
| 6 | Metals-API | Live metal prices | [MetalsAPI.md](./MetalsAPI.md) |
| 7 | Meta Pixel + CAPI / GTM | Analytics & attribution | [MetaPixelGTM.md](./MetaPixelGTM.md) |
| 8 | Supabase (Lovable Cloud) | DB, auth, storage, edge functions | [Supabase.md](./Supabase.md) |

## Cross-Cutting Themes (read before individual files)

### P0 — Must-fix before scaling

- **No Stripe webhook handler exists.** `check-subscription` polls the Stripe API on every page load. One `customer.subscription.deleted` event that happens between polls silently grants paid access to a cancelled user. Grep confirmed: zero files use `stripe.webhooks.constructEvent` or `STRIPE_WEBHOOK_SECRET`.
- **Zero idempotency keys across integrations.** No edge function passes an `Idempotency-Key` header to Stripe, Shopify, Resend, or Meta CAPI. A retry of a failing checkout can double-charge; a retry of a webhook can double-insert.
- **Shopify webhook HMAC verification is advisory, not enforced.** `shopify-order-webhook/index.ts:271` logs "HMAC signature mismatch" but proceeds with `client_id` query-param auth. An attacker who discovers a `client_id` (UUID is visible in script tags and form URLs) can POST fake orders.
- **CORS `Access-Control-Allow-Origin: *` on authenticated endpoints.** Every shared `corsHeaders` uses `*`. Combined with cookie-based Supabase auth, this weakens CSRF posture.
- **No outbound circuit breaker / retry policy.** A Stripe or Shopify outage cascades into every request timing out for 25s (AI router) or forever (most integrations) — the edge function billing meter runs the whole time.

### P1 — Should-fix soon

- **Secrets written to logs via `console.log` of full errors** in several older functions (`fetch-metal-prices` echoes `error.message` back to the client at line 108). Good examples in `_shared/secrets-validation.ts` exist — not consistently applied.
- **No webhook endpoint for Resend** (bounce / complaint events). Bounced transactional emails are silently lost; no suppression list.
- **Chat cache key ignores `currentConfig`**. Two users in different budget states can collide on identical first-turn queries (mitigated in `ring-chat` by early-return disable flags, but logic is fragile).
- **Meta CAPI missing `event_id` for dedup.** Pixel + CAPI fire the same event without a shared `eventId`, so Facebook can't dedupe browser+server events → inflated "Purchase" metrics and ad-bidding mis-optimization.
- **No observability on third-party latency or error rates.** Each integration logs to console; no aggregated dashboard or alerts.

### P2 — Hardening

- Rotate encryption keys for Shopify/storefront tokens on a schedule.
- Add structured Dead-Letter Queue (DLQ) for failed Shopify webhook inserts.
- Move `STRIPE_PRICE_IDS` / `PRODUCT_TO_PLAN` from code to DB or config table — current hardcoding requires a redeploy per pricing change.

### P3 — Nice-to-have

- Automated synthetic monitoring ("canary orders" on Shopify, test checkouts on Stripe).
- SBOM / SCA scan of `https://esm.sh/*` pins — `stripe@18.5.0`, `resend@2.0.0`, `zod@v3.22.4` are pinned but not centrally tracked.

## How to Use This Audit

1. Read `README.md` for cross-cutting items that apply to all integrations.
2. Pick one integration file.
3. Work top-to-bottom on the **Action Items (Prioritized)** checklist.
4. Every P0 item has the exact file path + line number where the fix belongs.

_Generated 2026-04-17 for JewlX platform — based on live code reads, not assumptions._
