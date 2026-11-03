# Live Prices — Source Reference

**Route:** `/dashboard/live-prices` (also mounted under admin/staff impersonation routes)
**Feature:** Precious Metals market report (Gold / Silver / Platinum) shown in the Vault sidebar under **OVERVIEW → Live Prices**.

---

## 1. Pages

| File | Purpose |
|---|---|
| `src/pages/client/LivePrices.tsx` | Main page. Fetches latest spot prices, today's % delta, and per-client catalog snapshot delta. Renders the Precious Metals table + Overall Metal Value card. |
| `src/pages/client/Catalog.tsx` | Sibling consumer — references metal price snapshot when displaying catalog pricing drift. |

**Route registration** — `src/App.tsx`
- Line 89: `import ClientLivePrices from "./pages/client/LivePrices";`
- Lines 245, 273, 369, 447: `<Route path="live-prices" element={<ClientLivePrices />} />` (mounted in the client dashboard layout and three admin impersonation layouts).

**Sidebar entry** — `src/lib/client-nav-config.ts`
- Line 83: `{ label: 'Live Prices', icon: TrendingUp, href: \`${p}/live-prices\` }`

---

## 2. Components

All under `src/components/live-prices/`:

| File | Role |
|---|---|
| `MetalPriceCard.tsx` | Card variant of a single metal (used in compact dashboards). |
| `MetalPriceRow.tsx` | Row rendered inside the Precious Metals table on `LivePrices.tsx` — METAL · SPOT PRICE · TODAY · SINCE CATALOG. |
| `PriceAlertBanner.tsx` | Top banner shown when a price moves beyond the client's configured alert threshold. |
| `ValueProgressCard.tsx` | "Overall Metal Value · Since {snapshot date}" weighted-average card at the bottom. |

Related dialog (used by ring builder, shares the API):
- `src/components/ring-builder/MetalInfoDialog.tsx`

---

## 3. Client library / API helper

`src/lib/metal-prices-api.ts` (133 lines) — central client for the **Metals-API.com** integration:
- `fetchLatestMetalPrices()` — calls the `fetch-metal-prices` edge function, returns `{ gold, silver, platinum }` per oz in USD.
- `getMetalPriceSnapshot(clientId)` — reads the client's stored catalog snapshot from `metal_price_snapshots` for "since catalog" delta.
- Computes `todayChangePct` from previous close stored in `metal_price_history`.
- Caches results client-side and exposes a `refresh()` for the **REFRESH** button.

---

## 4. Edge Functions

Under `supabase/functions/`:

| Function | Purpose |
|---|---|
| `fetch-metal-prices/index.ts` (113 lines) | **Primary.** Calls Metals-API.com (`METALS_API_KEY`), normalizes XAU/XAG/XPT to per-oz USD, writes a row to `metal_price_history`, and returns the latest snapshot. Public (no JWT). |
| `calculate-metal-offer/` | Uses live prices to compute Metal IQ buy-back offers (consumes the same prices). |
| `notify-metal-iq-lead/` | Sends offer notification emails (downstream consumer). |
| `generate-client-catalog/` | Reads current spot prices when (re)generating per-client catalog pricing — writes/refreshes `metal_price_snapshots`. |

**Config** — `supabase/config.toml`
```toml
# Live Metal Prices
[functions.fetch-metal-prices]
verify_jwt = false
```

**Cron** — `fetch-metal-prices` is scheduled via `pg_cron` (see memory: `infrastructure/scheduled-tasks-cron`) to refresh prices throughout the trading day.

---

## 5. Database Tables & Migrations

### Tables
| Table | Purpose |
|---|---|
| `public.metal_price_history` | Time-series of all polled spot prices. Columns: `metal_type` ('gold'/'silver'/'platinum'), `price_per_oz`, `recorded_at`, source. Used to compute "TODAY" % change. |
| `public.metal_price_snapshots` | Per-client snapshot taken when the catalog was last generated. Columns: `client_id`, `gold_price`, `silver_price`, `platinum_price`, `snapshot_date`. Powers the "SINCE CATALOG" % column and the "Overall Metal Value" card. |

### Migrations (chronological)

| Migration | What it does |
|---|---|
| `supabase/migrations/20260125203811_650b6972-7554-488c-a6e4-c1945a474d35.sql` | **Creates `metal_price_history`** — initial time-series table with RLS + grants. |
| `supabase/migrations/20260216064440_843fb2d7-206b-4e95-bd6a-ad06f8db593d.sql` | Schema reset that drops and **recreates `metal_price_history`** alongside other core tables. |
| `supabase/migrations/20260402184515_84f8302c-8bda-4768-a17f-c4e085ef0b52.sql` | **Creates `metal_price_snapshots`** (per-client catalog snapshot) with FK to `clients`, RLS + grants. Enables the "SINCE CATALOG" comparison. |

---

## 6. Third-party Integration

- **Provider:** [Metals-API.com](https://metals-api.com)
- **Secret:** `METALS_API_KEY` (Lovable Cloud secret, consumed by `fetch-metal-prices`)
- **Symbols:** `XAU` (Gold), `XAG` (Silver), `XPT` (Platinum) — converted to USD/oz before persisting.
- **Reference docs in repo:**
  - `ThirdPartyIntegrationsFinding/MetalsAPI.md`
  - `IntegrationsStudy/jewlx-integrations.md`

---

## 7. Data Flow Summary

```
Metals-API.com
      |
      v
[edge] fetch-metal-prices  ── writes ──>  metal_price_history
      ^
      | (REFRESH button / cron / page load)
      |
src/lib/metal-prices-api.ts  ── reads ──>  metal_price_snapshots (per client)
      |
      v
src/pages/client/LivePrices.tsx
      |
      v
src/components/live-prices/*   (MetalPriceRow, ValueProgressCard, PriceAlertBanner)
```

---

## 8. Quick-edit cheatsheet

- **Add/remove a metal column** → `LivePrices.tsx` + `metal-prices-api.ts` + add symbol in `fetch-metal-prices/index.ts`.
- **Change refresh cadence** → cron schedule for `fetch-metal-prices` (DB `pg_cron`).
- **Change "since catalog" baseline** → `metal_price_snapshots` is rewritten by `generate-client-catalog`.
- **Tweak alert thresholds** → `PriceAlertBanner.tsx` (reads client config).
