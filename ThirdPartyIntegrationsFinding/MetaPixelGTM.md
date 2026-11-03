# Meta Pixel + CAPI & Google Tag Manager — Analytics & Attribution

## 1. Current Implementation

**Frontend:**
- `src/lib/meta-pixel.ts` — injects `fbevents.js`, initializes pixel, tracks standard + custom events. Queues events fired before the script loads.
- `src/lib/google-tag.ts` — injects GTM container, pushes to `dataLayer`.
- Active client: "Diamond Touch Toronto" (per integrations doc).

**Backend (CAPI — Conversions API):**
- `supabase/functions/shopify-order-webhook/index.ts:431-473` fires server-side `Purchase` event to Meta via Graph API after order creation.
- Uses SHA-256 hashed `email` + `phone` (`em`, `ph`) for user matching.
- Fires only if `meta_pixel_id` AND `meta_capi_access_token` are set on the `clients` row.

**Frontend integration point:** `src/pages/client/DiamondsForm.tsx` (per integrations doc).

## 2. What's Working Well

- ✅ **Hybrid browser + server tracking**. Meta heavily penalizes browser-only tracking (iOS 14+, ad blockers). Your CAPI from `shopify-order-webhook` is the durable signal.
- ✅ **PII hashed server-side** before sending to Meta (`:436`) — compliant with Meta's CAPI spec.
- ✅ **Event queuing** in `meta-pixel.ts` — events fired before `fbevents.js` loads are replayed once ready. Safe re-init guard against duplicate initialization.
- ✅ **Noscript fallback pixel** for users with JS disabled (`:118-130`).
- ✅ **GTM dataLayer pattern** — correct single push on init, then push per event.
- ✅ **Ad-blocker resilience** — when `fbevents.js` fails to load, pending events are still flushed through the stub (`:104-107`).
- ✅ **Per-client config** — pixel ID and CAPI token are stored per-client (multi-tenancy-aware).

## 3. Critical Gaps / Security Concerns

### 🔴 P0 — No `event_id` for browser + server dedup

When the same event fires from both Pixel (browser) and CAPI (server), Meta needs a shared `event_id` to deduplicate. Without it, Meta counts each event twice → inflated Purchase metrics → mis-optimized ad bids (Meta thinks ROAS is 2× reality).

`shopify-order-webhook/index.ts:444-455` — no `event_id`, no `event_source_url`, no `fbp`/`fbc` cookies.

**Fix:**
- Generate a deterministic `event_id = sha256(orderId + timestamp_minute)`.
- In the browser Pixel firing `Purchase`, include the same `event_id` via `{ eventID: '...' }`.
- Capture `fbp` / `fbc` cookies from browser → include in CAPI `user_data` for improved match rate.
- Set `event_source_url` on CAPI payload.

### 🔴 P0 — CAPI access token stored without encryption-at-rest verification

`shopify-order-webhook/index.ts:231,247` reads `meta_capi_access_token` directly from `clients`. No `decrypt_*` RPC seen. Compare to Shopify's `decrypt_shopify_token` pattern — likely missing here.

**Fix:** Encrypt at rest via pgcrypto (same pattern as Shopify tokens). This token is high-value — leaked CAPI tokens can be used to poison a competitor's ad data.

### 🔴 P0 — Pixel ID and CAPI token appear in server logs when errors occur

`shopify-order-webhook/index.ts:465`:
```ts
console.error('Meta CAPI error:', capiRes.status, errText);
```

If Meta returns an error that includes the request URL (which has `?access_token=...`), you log the token.

**Fix:** Redact tokens via `redactSecretsFromString` (already available in `_shared/secrets-validation.ts`).

### 🟠 P1 — No CSP / consent management

GTM + Meta Pixel load with no consent gate. Under GDPR (EU users), CCPA (California), PIPEDA (Canada) — you need explicit consent before dropping marketing cookies / sending PII to Meta.

**Fix:**
- Integrate a Consent Management Platform (CookieYes, Cookiebot, or build a minimal banner).
- Gate `initMetaPixel()` and `initGTM()` behind consent.
- Respect `navigator.doNotTrack`.
- Per-region defaults (EU: opt-in; US: opt-out).

### 🟠 P1 — No Content Security Policy

`fbevents.js` and `gtm.js` load from third parties. Without CSP, a compromised GTM workspace can inject arbitrary JS that exfiltrates form data (including Stripe checkout tokens via copy-paste).

**Fix:** Add CSP headers:
```
script-src 'self' https://connect.facebook.net https://www.googletagmanager.com;
connect-src 'self' https://*.facebook.com https://www.google-analytics.com;
```
And strict-dynamic with nonces for inline scripts.

### 🟠 P1 — Meta CAPI failure is fire-and-forget

`shopify-order-webhook/index.ts:458-473` — errors are logged but not retried. A transient Meta API 503 means that Purchase event is lost forever → lower signal to Meta's optimization → worse ad performance.

**Fix:** Queue failed CAPI calls to a `meta_capi_retry` table, retry with backoff for up to 7 days (Meta's deduplication window).

### 🟠 P1 — No GTM server-side container

Relying on client-side GTM means ad blockers (uBlock, Pi-hole) strip events. Standard for serious e-commerce is **server-side GTM** (sGTM) — a container on your domain (e.g., `tag.jewlx.ai`) that relays to Google/Meta/etc. Bypasses ad blockers, respects user privacy settings better, gives you control over what fires.

**Fix:** Stand up a server-side GTM container (can run on Google Cloud Run or a Supabase edge function).

### 🟡 P2 — `window.fbq` / `window.dataLayer` typed as `any`

`src/lib/meta-pixel.ts:11, src/lib/google-tag.ts:11` declare ambient globals with `any`. Loose typing invites silent breaks.

**Fix:** Use the community-maintained `@types/facebook-pixel` and `@types/gtag.js` type packages.

### 🟡 P2 — No standard e-commerce events wired beyond Purchase

Industry standard for jewelry: `ViewContent`, `AddToCart`, `InitiateCheckout`, `AddPaymentInfo`, `Lead`, `Schedule` (for appointment bookings). The code supports firing these (`trackMetaEvent`) but a grep of the frontend would tell if they're actually used. This matters because Meta's advantage+ optimization needs ≥ 50 events/week of the right type.

**Fix:** Audit the customer flow and fire the full funnel events.

### 🟡 P2 — No UTM persistence

Without storing UTM params in first-party cookies / DB, attribution is lost on multi-session journeys.

**Fix:** Capture `utm_*` params on first landing, persist in a first-party cookie (`_jx_utm`), replay on every event + on the order record.

### 🟡 P2 — No alternative tracking during ad blocker hits

When `fbevents.js` fails to load (`onerror:104-107`), you log a warning but lose the client-side data. CAPI picks up server-side events but client-side engagement (ViewContent, scroll depth) is gone.

**Fix:** First-party event collection → relay server-side. (Overlaps with sGTM above.)

## 4. Performance & Optimization Issues

| Issue | File:Line | Impact |
|-------|-----------|--------|
| `fbevents.js` blocks downstream scripts in some browsers | `meta-pixel.ts:94-116` | +100-300ms TTI on slow connections |
| GTM container fetches all tags synchronously on init | `google-tag.ts:38-44` | Same — can bloat if many tags configured |
| CAPI call in order webhook is sequential after DB insert | `shopify-order-webhook/index.ts:431-473` | Delays webhook 200 response by ~200-500ms |
| No deduplication of same event fired twice in the same session | `meta-pixel.ts` | Minor — Meta does some dedup internally |

**Optimizations:**
- Preconnect / preload hints for `connect.facebook.net` and `www.googletagmanager.com`.
- Defer non-critical GTM tags via triggers, not initial load.
- Move the CAPI call to a background worker (don't block webhook response).

## 5. Industry-Standard SaaS Checklist

- [ ] **Consent Management Platform (CMP)** — cookie banner gating marketing scripts.
- [ ] **CSP headers** pinning third-party script sources.
- [ ] **Browser + server dedup via `event_id`** on every event.
- [ ] **fbp + fbc cookies** captured and sent to CAPI for match-rate.
- [ ] **CAPI retry queue** with exponential backoff over 7-day dedup window.
- [ ] **Server-side GTM** to bypass ad blockers.
- [ ] **Standard funnel events wired**: ViewContent, AddToCart, InitiateCheckout, AddPaymentInfo, Purchase, Lead, Schedule.
- [ ] **UTM persistence** in first-party cookie + order record.
- [ ] **CAPI access token encrypted at rest**.
- [ ] **Secrets never logged** — redaction on every error path.
- [ ] **Event test tool** — Meta Events Manager "Test Events" validated before launch.
- [ ] **Aggregated Event Measurement (AEM)** config for iOS 14+ users — 8 priority events configured per domain.
- [ ] **Data processing region** — Meta CAPI allows EU routing; use if serving EU.
- [ ] **Data minimization** — only send fields actually needed for optimization; strip raw PII.
- [ ] **DPA signed** with Meta (EU compliance).
- [ ] **First-party tracking** fallback for ad-block users.
- [ ] **Match-quality score** monitored in Meta dashboard (target ≥ 7/10).
- [ ] **PII hashing done server-side** (already done — good).
- [ ] **Scheduled "pixel health check"** — synthetic test user runs checkout, verifies events appeared in Meta.

## 6. Action Items (Prioritized)

### P0

1. **Add `event_id` deduplication** — generate deterministic ID in `shopify-order-webhook`, pass to both browser Pixel and CAPI.
2. **Encrypt CAPI access token at rest** (same pattern as `decrypt_shopify_token`).
3. **Redact tokens in error logs** — never log raw URL with `?access_token=...`.
4. **Consent banner** before firing Pixel / GTM (GDPR / CCPA / PIPEDA requirement).

### P1

5. Capture `fbp` / `fbc` cookies + `event_source_url` + `client_user_agent` → include in CAPI `user_data`.
6. CAPI failure retry queue.
7. Content Security Policy on all pages.
8. Wire the full funnel events (ViewContent, AddToCart, InitiateCheckout, AddPaymentInfo, Lead, Schedule).
9. Move CAPI call out of webhook critical path (background worker).

### P2

10. Server-side GTM container on `tag.jewlx.ai`.
11. UTM persistence in first-party cookie + order record.
12. AEM priority-event configuration.
13. Type the `window.fbq` / `window.dataLayer` globals properly.
14. Synthetic pixel health check cron.

### P3

15. Per-client AEM / CAPI config onboarding wizard.
16. Match-quality score dashboard for clients.
17. Signed DPA with Meta for EU clients.
