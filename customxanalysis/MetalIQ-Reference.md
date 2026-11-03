# Metal IQ — File Reference (Updated)

Metal IQ is the metal-buying widget that lets jewelers offer instant cash quotes for gold/silver/platinum jewelry, with live spot price tracking, a deposit/contact lead flow, lead lifecycle management, and an admin operations panel.

---

## 1. Public Embed Route (Widget Entry Point)

| File | Purpose |
|---|---|
| `src/pages/EmbedMetalBuying.tsx` | Public iframe widget; runs domain whitelisting, feature gate, Meta Pixel init, branding load, screenshot protection |
| `src/lib/domain-config.ts` | Subdomain → route mapping |
| `src/hooks/useScreenshotProtection.ts` | Screenshot/print protection on widget |
| `src/lib/trusted-referrer.ts` | Server-side domain whitelisting (`client_branding.allowed_domains`) |

Embed snippet now appends a cache-busting `?v={timestamp}` param so jewelers don't see stale widget bundles.

---

## 2. Customer-Facing Form Components (`src/components/metal-buying/`)

| File | Purpose |
|---|---|
| `MetalBuyingForm.tsx` | Main multi-step wizard (metal → karat → weight → contact → offer) |
| `MetalEstimateTimeline.tsx` | Animated "Calculating Estimates" timeline (uses shared `AIGenerationTimeline`) |
| `metal-estimate-phases.ts` | Timeline phase definitions |
| `MetalBookAppointmentDialog.tsx` | "Book appointment" CTA dialog |
| `MetalIQLeadDetailView.tsx` | Unified Offer Overview block (used in lead detail) |

Loading header is explicitly set to **"Calculating Estimates"** in `MetalEstimateTimeline.tsx` and remounts on each submission via a unique `key` to avoid the default fallback flash.

---

## 3. Configuration Hook & Data Layer

| File | Purpose |
|---|---|
| `src/hooks/useClientMetalBuyingConfig.ts` | Read/write `client_metal_buying_config` (metals, karats, buy %, competitor %, refinery sell %, deposit amount, CTA, colors, step order) |
| `src/hooks/useClientFeatures.ts` | Gates `metal_buying` feature flag |
| `src/lib/metal-prices-api.ts` | Live spot price fetcher (Metals-API: XAU / XAG / XPT) |
| `src/lib/metal-buying-embed.ts` | Iframe embed snippet generator (with cache-busting `?v=` param) |
| `src/lib/meta-pixel.ts` | Meta Pixel + CAPI tracking |
| `src/lib/analytics-utils.ts` | `trackWidgetView(clientId, 'metal_buying')` |
| `src/lib/apply-theme-colors.ts` | Branded color injection for the widget |

---

## 4. Jeweler Configurator (Client Portal)

| File | Purpose |
|---|---|
| `src/pages/client/MetalBuyingConfig.tsx` | Config page (60/40 split) |
| `src/components/metal-buying-config/MetalBuyingConfigurator.tsx` | Top-level layout |
| `src/components/metal-buying-config/MetalBuyingConfigPanel.tsx` | Config panel: metals enabled, per-karat buy %, competitor %, refinery sell %, deposit amount, CTA URLs, form colors |

### Lead Management (Client Portal)
| File | Purpose |
|---|---|
| `src/pages/client/MetalBuyingLeads.tsx` | Jeweler-facing list of Metal IQ leads (newest-first ordering) |
| `src/components/leads/LeadDetailView.tsx` | Lead detail (renders `MetalIQLeadDetailView` for Metal IQ source) |
| `src/components/leads/LeadFollowUpSection.tsx` | Follow-up notes/status |
| `src/components/leads/LeadEmailHistory.tsx` | Email log per lead |
| `src/components/leads/SendQuoteSection.tsx` | Re-send quote / recalculate quote action |
| `src/components/leads/LinkedBookingsPanel.tsx` | Linked appointment bookings |

---

## 5. Admin Portal

| File | Purpose |
|---|---|
| `src/pages/admin/MetalBuyingAdmin.tsx` | Platform-wide Metal IQ management / monitoring |

---

## 6. Database Tables

| Table | Purpose |
|---|---|
| `client_metal_buying_config` | Per-jeweler config: `metals_config` (gold/silver/platinum → karat-level `buy_pct` + `competitor_pct`), `refinery_sell_pct`, `deposit_amount`, `submission_mode`, `step_order`, `step_labels`, `required_contact_fields`, `form_colors`, `cta_config`, `dont_know_enabled` |
| `client_metal_buying_questions` | Optional jeweler-defined custom questions for the metal flow |
| `metal_buying_leads` | Submissions: customer info, metal, karat, weight, `estimated_offer`, `competitor_offer`, `estimated_profit`, `spot_price_at_time`, `spot_price_date`, `buy_percentage`, `lead_score`, photo_urls, status |
| `metal_price_snapshots` | Historical spot-price snapshots captured per lead |
| `lookup_metals` | Reference table (XAU/XAG/XPT, troy-oz constants) |
| `clients.enabled_features` | Toggles `metal_buying` feature flag |
| `client_branding` | `allowed_domains`, Meta Pixel ID, currency, accent colors |
| `appointment_bookings` | Linked appointment bookings from CTA |
| `analytics_events` | `metal_buying` widget view + interaction events |
| `email_logs` | Per-lead notification email log (`email_type = 'metal_iq_lead_notification'`) |
| `client_notification_preferences` | Per-client opt-out for `new_lead` emails |

---

## 7. Edge Functions

| Function | Purpose |
|---|---|
| `supabase/functions/fetch-metal-prices/` | Calls Metals-API, refreshes XAU/XAG/XPT spot prices |
| `supabase/functions/calculate-metal-offer/` | Server-side offer calculation. Includes 60s in-memory spot-price cache, 60s quote validity, per-metal refinery yields (gold ≈99%, silver ≈92%, platinum ≈95% — derived from configured baseline), $25 flat refining fee, and a 5% small-lot penalty for lots <7g. **Karat is required** when weight is provided. |
| `supabase/functions/notify-metal-iq-lead/` | Branded HTML email to the jeweler on every new Metal IQ lead (lead-score badge, customer block, metal details, quote breakdown, photo thumbnails, CTA to lead detail). Honors `client_notification_preferences`. |
| `supabase/functions/notify-customer-confirmation/` | Customer-side confirmation email |
| `supabase/functions/notify-appointment-booking/` | Triggered when CTA "Book Appointment" is used |
| `supabase/functions/customer-portal/` | Stripe customer portal (deposit mode) |
| `supabase/functions/_shared/error-logger.ts` | Centralized edge-function error logging |

---

## 8. CDN / Storage

- **Bucket:** `ring-assets` (Supabase Storage) — shared with all widgets
- **Base URL:** `https://wcfxtsyhrpephimyrpbx.supabase.co/storage/v1/object/public/ring-assets`
- **Used for:** customer-uploaded item photos, optional metal/karat illustration overrides, jeweler logo for the branded widget

---

## 9. External APIs

| API | Purpose |
|---|---|
| `Metals-API.com` | Live spot prices for Gold (XAU), Silver (XAG), Platinum (XPT) — symbol+currency cached server-side for 60s |
| Resend | Transactional email delivery for jeweler notifications |
| Meta Pixel + CAPI | Conversion tracking |
| Stripe | Deposit checkout (when `submission_mode = 'deposit'`) |
| Shopify Storefront API | Optional deposit line-item flow |

---

## 10. Migrations (Initial Table Creation)

| Table | Migration |
|---|---|
| `client_metal_buying_config` | `supabase/migrations/20260217173545_56ab7877-0208-4846-9005-1ebe870cd30a.sql` |
| Related table updates | `supabase/migrations/20260218063650_d8123d67-78e0-4d7d-a627-deb68f3212b4.sql` |
| Related table updates | `supabase/migrations/20260403010632_e1f320fe-3ef8-43b6-af22-afda5dcbd594.sql` |

---

## 11. Pricing Logic Summary (Current)

```
purity_factor    = PURITY_FACTORS[metal][karat]        # namespaced per metal
spot_per_gram    = spot_price_per_oz / 31.1035
pure_value       = weight_grams × spot_per_gram × purity_factor

# Small-lot penalty: lots < 7g get 5% shaved off the buy %
adjusted_buy_pct = weight < 7g ? buy_pct × 0.95 : buy_pct

our_offer        = pure_value × (adjusted_buy_pct / 100)
competitor_offer = pure_value × (competitor_pct  / 100)

# Refinery yield differs by metal (gold tightest)
refinery_payout  = pure_value × (refinery_sell_pct / 100)
estimated_profit = max(0, refinery_payout − our_offer − $25 flat refining fee)
```

- Per-gram display rates (`ourRatePerGram`, `competitorRatePerGram`) are computed **without** the small-lot penalty so the headline rate stays consistent with the configured buy %.
- Quotes include `validUntil = now + 60s`; the lead detail "Recalculate quote" button re-invokes `calculate-metal-offer`.
- All percentages are configured per-karat per-metal in `client_metal_buying_config.metals_config`.
- Lead capture is decoupled from price calculation: contact info is always saved even if the spot-price API fails, so jewelers never lose a lead.

---

## 12. Lead Lifecycle & Lead-Score Coloring

`metal_buying_leads.lead_score` drives the badge color in jeweler email + lead list:

| Score | Color | Label |
|---|---|---|
| `hot` | red | 🔥 Hot Lead |
| `warm` | orange | 🌡️ Warm Lead |
| `cold` | blue | ❄️ Cold Lead |
| `suspect` | gray | ⚠️ Suspect |

New leads always sort to the top of `MetalBuyingLeads.tsx` (created_at DESC).
