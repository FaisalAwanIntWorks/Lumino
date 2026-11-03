# JewlX – Third-Party Integrations Reference

A summary of all external services integrated into the JewlX platform, with file references for each.

---

## 1. Stripe — Payments & Subscriptions
Handles checkout sessions, subscription billing, and CAD add-on purchases.

**Files:**
- `supabase/functions/create-checkout/index.ts`
- `supabase/functions/check-subscription/index.ts`
- `supabase/functions/purchase-cad-addon/index.ts`
- `supabase/functions/shopify-form-checkout/index.ts`

---

## 2. Shopify — E-commerce, Catalog Sync & Checkout
Syncs ring catalogs, diamond presets, stones, and form deposit products to Shopify. Handles cart creation, order webhooks, and storefront checkout.

**Files:**
- `supabase/functions/shopify-add-to-cart/index.ts`
- `supabase/functions/shopify-push-catalog/index.ts`
- `supabase/functions/shopify-push-stones/index.ts`
- `supabase/functions/shopify-push-diamond-presets/index.ts`
- `supabase/functions/shopify-push-form-product/index.ts`
- `supabase/functions/shopify-form-checkout/index.ts`
- `supabase/functions/shopify-test-connection/index.ts`
- `supabase/functions/shopify-order-webhook/index.ts`
- `supabase/functions/register-shopify-webhooks/index.ts`

---

## 3. Resend — Transactional Emails
Sends verification, welcome, lead notification, appointment, and CAD lifecycle emails.

**Files:**
- `supabase/functions/send-email/index.ts`
- `supabase/functions/send-verification-email/index.ts`
- `supabase/functions/send-client-welcome-email/index.ts`
- `supabase/functions/request-password-reset/index.ts`
- `supabase/functions/notify-new-lead/index.ts`
- `supabase/functions/notify-form-lead/index.ts`
- `supabase/functions/notify-lead-deleted/index.ts`
- `supabase/functions/notify-admins-new-client/index.ts`
- `supabase/functions/notify-admins-client-status/index.ts`
- `supabase/functions/notify-appointment-booking/index.ts`
- `supabase/functions/notify-customer-confirmation/index.ts`
- `supabase/functions/notify-cad-request/index.ts`
- `supabase/functions/notify-cad-delivery/index.ts`
- `supabase/functions/notify-cad-resize/index.ts`
- `supabase/functions/send-quote-estimate/index.ts`

---

## 4. Lovable AI Gateway — Google Gemini & OpenAI Models
Powers AI chat, ring/grillz/enquiry preview generation, and lead cost estimation. No external API key required.

**Files:**
- `supabase/functions/ring-assistant/index.ts`
- `supabase/functions/ring-chat/index.ts`
- `supabase/functions/jewelx-help/index.ts`
- `supabase/functions/generate-ring-preview/index.ts`
- `supabase/functions/generate-grillz-preview/index.ts`
- `supabase/functions/generate-enquiry-preview/index.ts`
- `supabase/functions/estimate-lead-cost/index.ts`

---

## 5. Unkey — API Key Management & Rate Limiting
Manages scoped API keys and provides sub-millisecond rate limiting and usage analytics.

**Files:**
- `supabase/functions/unkey-create-key/index.ts`
- `supabase/functions/unkey-list-keys/index.ts`
- `supabase/functions/unkey-revoke-key/index.ts`
- `supabase/functions/unkey-usage-analytics/index.ts`

---

## 6. Metals-API.com — Live Metal Prices
Fetches live Gold (XAU), Silver (XAG), and Platinum (XPT) prices for the Metal IQ feature.

**Files:**
- `supabase/functions/fetch-metal-prices/index.ts`

---

## 7. Google Tag Manager & Meta Pixel + CAPI — Analytics
Lead tracking and marketing attribution (active for Diamond Touch Toronto client).

**Files:**
- Frontend tracking utilities in `src/lib/` (Meta Pixel & GTM helpers)
- Diamond form integration: `src/pages/client/DiamondsForm.tsx`

---

## 8. Lovable Cloud (Supabase) — Database, Auth, Storage & Edge Functions
Core backend platform: PostgreSQL database, authentication, file storage, and serverless functions.

**Files:**
- `src/integrations/supabase/client.ts`
- `src/integrations/supabase/types.ts`
- All `supabase/functions/*` directories
- All `supabase/migrations/*` SQL files
- `supabase/config.toml`

---

_Generated for JewlX platform — internal reference document._
