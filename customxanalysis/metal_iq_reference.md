# Metal IQ — File Reference

Metal IQ is the metal-buying widget that lets jewelers offer instant cash quotes for gold/silver/platinum jewelry, with live spot price tracking, a deposit/contact lead flow, and an admin operations panel.

---

## 1. Public Embed Route (Widget Entry Point)

| File | Purpose |
|---|---|
| `src/pages/EmbedMetalBuying.tsx` | Public iframe widget; runs domain whitelisting, feature gate, Meta Pixel init, branding load |
| `src/lib/domain-config.ts` | Subdomain → route mapping |
| `src/hooks/useScreenshotProtection.ts` | Screenshot/print protection on widget |

---

## 2. Customer-Facing Form Components (`src/components/metal-buying/`)

| File | Purpose |
|---|---|
| `MetalBuyingForm.tsx` | Main multi-step wizard (metal → karat → weight → contact → offer) |
| `MetalEstimateTimeline.tsx` | Animated "calculating offer" timeline |
| `metal-estimate-phases.ts` | Timeline phase definitions |
| `MetalBookAppointmentDialog.tsx` | "Book appointment" CTA dialog |
| `MetalIQLeadDetailView.tsx` | Unified Offer Overview (used in lead detail) |

---

## 3. Configuration Hook & Data Layer

| File | Purpose |
|---|---|
| `src/hooks/useClientMetalBuyingConfig.ts` | Read/write `client_metal_buying_config` (metals, karats, buy %, refinery sell %, deposit amount, CTA, colors) |
| `src/hooks/useClientFeatures.ts` | Gates `metal_buying` feature flag |
| `src/lib/metal-prices-api.ts` | Live spot price fetcher (Metals-API: XAU / XAG / XPT) |
| `src/lib/metal-buying-embed.ts` | Iframe embed snippet generator |
| `src/lib/trusted-referrer.ts` | Domain whitelisting |
| `src/lib/meta-pixel.ts` | Meta Pixel + CAPI tracking |
| `src/lib/analytics-utils.ts` | `trackWidgetView(clientId, 'metal_buying')` |

---

## 4. Jeweler Configurator (Client Portal)

| File | Purpose |
|---|---|
| `src/pages/client/MetalBuyingConfig.tsx` | Config page (60/40 split) |
| `src/components/metal-buying-config/MetalBuyingConfigurator.tsx` | Top-level layout |
| `src/components/metal-buying-config/MetalBuyingConfigPanel.tsx` | Config panel: metals, karats, buy/competitor %, refinery %, CTA URLs, colors |

### Lead Management (Client Portal)
| File | Purpose |
|---|---|
| `src/pages/client/MetalBuyingLeads.tsx` | Jeweler-facing list of Metal IQ leads |
| `src/components/leads/LeadDetailView.tsx` | Lead detail (uses `MetalIQLeadDetailView`) |

---

## 5. Admin Portal

| File | Purpose |
|---|---|
| `src/pages/admin/MetalBuyingAdmin.tsx` | Platform-wide Metal IQ management / monitoring |

---

## 6. Database Tables

| Table | Purpose |
|---|---|
| `client_metal_buying_config` | Per-jeweler config: `metals_config` (gold/silver/platinum karat % buy + competitor %), `refinery_sell_pct`, `deposit_amount`, `submission_mode`, `step_order`, `step_labels`, `required_contact_fields`, `form_colors`, `cta_config`, `dont_know_enabled` |
| `metal_buying_leads` | Submissions (customer info, metal, karat, weight, calculated offer, status) |
| `clients.enabled_features` | Toggles `metal_buying` feature flag |
| `client_branding` | Allowed domains, Meta Pixel ID, currency, accent colors |
| `metal_prices_cache` (if applicable) | Cached live spot prices |
| `appointment_bookings` | Linked appointment bookings from CTA |
| `analytics_events` | `metal_buying` widget view + interaction events |

---

## 7. Edge Functions

| Function | Purpose |
|---|---|
| `supabase/functions/fetch-metal-prices/` | Calls Metals-API, caches live spot prices for XAU/XAG/XPT |
| `supabase/functions/calculate-metal-offer/` | Server-side offer calculation (spot × karat purity × buy %) |
| `supabase/functions/notify-metal-iq-lead/` | Email notification (customer + jeweler) on new Metal IQ lead |
| `supabase/functions/customer-portal/` | Stripe customer portal (deposit mode) |

---

## 8. CDN / Storage

- **Bucket:** `ring-assets` (Supabase Storage) — shared with all widgets
- **Base URL:** `https://wcfxtsyhrpephimyrpbx.supabase.co/storage/v1/object/public/ring-assets`
- **Used for:** Optional metal/karat illustration overrides, jeweler logo for branded widget

---

## 9. External APIs

| API | Purpose |
|---|---|
| `Metals-API.com` | Live spot prices for Gold (XAU), Silver (XAG), Platinum (XPT) |
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

## 11. Pricing Logic Summary

```
customer_offer = spot_price × (karat_purity / 999) × weight × (buy_pct / 100)
competitor_offer = spot_price × (karat_purity / 999) × weight × (competitor_pct / 100)
refinery_value = spot_price × (karat_purity / 999) × weight × (refinery_sell_pct / 100)
```

All percentages are configured per-karat per-metal in `client_metal_buying_config.metals_config`.

