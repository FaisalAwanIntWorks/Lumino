# Diamond Catalog Filter — End-to-End Workflow

This document traces the complete journey for the **Client → Ring OS → Catalog → Diamonds** flow:

1. How the filter UI populates its options
2. What happens when the client clicks **Update Confirmed Catalog**
3. How the confirmed catalog flows into the Ring OS widget (Stone step)

Stack: Lovable Cloud (Supabase Postgres + RPCs + Edge Functions).

---

## 1. Architectural Overview

```
┌─────────────────────────────────────────────────────────────────┐
│  ADMIN UPLOAD                                                   │
│  CSV / XLSX → diamond_inventory_pool_staging → diamond_inventory_pool │
│              (master pool, ~882K rows, shared across all clients)    │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  CLIENT FILTER UI  (DiamondCatalogLive.tsx)                     │
│  Filters are populated from:                                    │
│   • get_diamond_pool_distinct_values()  (shapes/colors/etc.)    │
│   • client_diamond_catalog_filter       (saved selection)       │
│  Live preview via:                                              │
│   • get_diamond_pool_preview(filter, markup_natural, markup_lab)│
└─────────────────────────────────────────────────────────────────┘
                              │  click "Update Confirmed Catalog"
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  PERSIST                                                        │
│  UPSERT client_diamond_catalog_filter                           │
│         (client_id, filter JSONB, markup_natural, markup_lab,   │
│          is_confirmed=true, confirmed_at=now())                 │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  WIDGET READ  (Ring OS / StoneStep.tsx)                         │
│  RPC get_diamond_presets_filtered(p_client_id, ...)             │
│   • If client has is_confirmed=true → streams live from         │
│     diamond_inventory_pool filtered + markup applied            │
│   • Else fallback → legacy client_diamond_presets               │
│  No change to RPC signature → widget code untouched.            │
└─────────────────────────────────────────────────────────────────┘
```

Key principle: **the widget is always live**. It does NOT read `client_diamond_catalog_filter` directly — it goes through the existing `get_diamond_presets_filtered` RPC, whose body was rewritten to branch on `is_confirmed`. New stock uploaded to the master pool that matches the saved filter shows up on the widget automatically.

---

## 2. Database Layer

### 2.1 Tables

| Table | Purpose |
|---|---|
| `diamond_inventory_pool` | Master pool of all uploaded diamonds (~882K rows). Source of truth. 47 columns. |
| `diamond_inventory_pool_staging` | Bulk-upload landing table before promotion. |
| `client_diamond_catalog_filter` | One row per client. Saved filter JSONB + markup % + `is_confirmed`. |
| `client_diamond_presets` | Legacy per-client materialized presets. Fallback path only. |
| `diamond_imports` | Audit log of admin uploads. |

`client_diamond_catalog_filter` columns:
- `client_id` (PK, FK clients)
- `filter` (JSONB) — full wizard-shaped filter (shapes, colors, clarities, cuts, polish, symmetry, fluorescence, labs, caratRange, stoneTypes, measurements)
- `markup_natural` (numeric, %)
- `markup_lab` (numeric, %)
- `is_confirmed` (boolean)
- `confirmed_at` (timestamptz)
- `created_at`, `updated_at`

### 2.2 RPCs (Database functions)

| RPC | Called by | Purpose |
|---|---|---|
| `get_diamond_pool_distinct_values()` | `useDiamondPoolOptions` (catalog UI) | Returns distinct shapes/colors/clarities/cuts/polish/symmetry/fluorescence/labs present in pool. Populates filter sidebar option lists. |
| `get_diamond_pool_preview(p_filter, p_markup_natural, p_markup_lab, p_page_size, p_offset)` | `DiamondCatalogLive` | Paginated live preview of pool filtered by `p_filter` with markup applied. Returns `total_count` for "568 matching" badge. |
| `get_diamond_pool_filter_count(p_filter)` | Catalog UI (badge counts) | Cheap COUNT of rows matching the filter. |
| `diamond_pool_row_matches(row, filter)` | Internal helper | Predicate used by preview + widget RPC to test pool rows against the JSONB filter. |
| `get_diamond_presets_filtered(p_client_id, p_page_size, p_offset, ...)` | `useClientDiamondPresets`, Ring OS `StoneStep`, `ring-chat`, `shopify-add-to-cart` | **Single widget entry-point.** Branches: if `client_diamond_catalog_filter.is_confirmed=true` → SELECT from pool with filter + markup; else SELECT from legacy `client_diamond_presets`. |
| `get_client_diamond_catalog_availability(p_client_id)` | `useClientDiamondCatalogAvailability` | Returns shapes/stoneTypes/caratBuckets actually available for that client — used to grey out empty options elsewhere in the widget. |
| `sync_client_diamond_catalog_from_filter(p_client_id)` | Optional reconcile path | Hardened (45s timeout + advisory lock) job that materializes the live filter result into `client_diamond_presets` if you need a snapshot. Not part of the live read path. |

### 2.3 Key migration files (chronological)

| Migration | What it added |
|---|---|
| `20260521073632_*.sql` | Initial `diamond_inventory_pool` + `get_diamond_pool_distinct_values`. |
| `20260522084012_*.sql` | First version of pool-aware preset generation. |
| `20260522120000_diamond_paginated_fetch.sql` | Pagination on `get_diamond_presets_filtered`. |
| `20260522130000_diamond_reset_fn.sql` | `reset_client_diamonds` helper. |
| `20260525105716`, `20260525105751`, `20260525112742_*.sql` | **Pool-driven rewrite.** Adds `client_diamond_catalog_filter` table + RLS + `diamond_pool_row_matches` helper + new `get_diamond_pool_preview` + rewritten `get_diamond_presets_filtered` body that branches on `is_confirmed`. |
| `20260525120630`, `20260525121841`, `20260525124435`, `20260525152107_*.sql` | Filter shape fixes (measurements, fluorescence normalization, multi-cert handling). |
| `20260526184801`, `20260526204215..504_*.sql` | Markup math, dedup, currency casting fixes. |
| `20260526234350_fix-diamond-presets-dedup-by-price.sql` | Dedup matched rows by `(shape, carat_bucket, color, clarity)` keeping cheapest. |
| `20260528061648_*.sql`, `20260528100000..3` | Adds `source_pool_id` / `report_no` columns to presets; backfill; RPC returns `report_no`. |
| `20260529033626_*.sql` | Hardens `sync_client_diamond_catalog_from_filter` with 45s timeout + per-client advisory lock (prevents DB wedge). |
| `20260603120000_diamond-catalog-attributes.sql` | Adds extra attribute filters (lab, fluor, etc.). |
| `20260603132238_*.sql` | Latest tweaks to attribute matching. |

### 2.4 RLS

`client_diamond_catalog_filter` policies mirror `client_diamond_presets`:
- Client can SELECT/INSERT/UPDATE its own row (via `auth.uid()` → client mapping).
- Admins/service_role full access.
- Widget reads go through `get_diamond_presets_filtered` (SECURITY DEFINER) so embedded/anon widget visitors never query the table directly.

---

## 3. Frontend — Filter UI

### 3.1 Entry point
**`src/pages/client/Catalog.tsx`** — Diamonds tab renders `<DiamondCatalogLive />`. The legacy 6-step `DiamondCatalogWizard` is no longer imported.

### 3.2 Component
**`src/components/catalog/diamond-catalog/DiamondCatalogLive.tsx`** (808 LOC). Responsibilities:

1. **Bootstrap** (lines ~225-255): in parallel
   - `supabase.from('client_diamond_catalog_filter').select(...)` → load previously saved filter + markup + confirmed flag.
   - `supabase.rpc('get_diamond_pool_distinct_values')` → discover which option tokens exist in the pool.
   - Builds a `filter` state hydrated from saved row, or a sensible default from distinct values.
2. **Live preview** (lines ~260-285) — `fetchPreview`:
   ```ts
   supabase.rpc('get_diamond_pool_preview', {
     p_filter: cleanFilterForServer(filter, distinct),
     p_markup_natural: markupNatural,
     p_markup_lab: markupLab,
     p_page_size: 25,
     p_offset: page * 25,
   })
   ```
   Returns rows with `display_price = pool.price × (1 + markup/100)` and `total_count` for the matching badge.
3. **Sidebar groups**: Stone Type, Shapes, Carat Range (slider), Color, Clarity, Cut, Polish, Symmetry, Fluorescence, Lab / Certification, Origin, Measurements (length mm), Markup (%). Each group's options are the **union** of hardcoded canonical tokens and pool-discovered extras via `mergeOptions()` in `src/lib/diamond-pool-normalize.ts`.
4. **Confirm action** (lines 292-314):
   ```ts
   const payload = {
     client_id,
     filter: cleanFilterForServer(filter, distinct),
     markup_natural, markup_lab,
     is_confirmed: true,
     confirmed_at: new Date().toISOString(),
   };
   await supabase.from('client_diamond_catalog_filter')
     .upsert(payload, { onConflict: 'client_id' });
   ```
   No edge function call. No row generation. The UPSERT alone "publishes" the catalog because the widget RPC reads this row on every request.

### 3.3 Supporting frontend files

| File | Role |
|---|---|
| `src/hooks/useDiamondPoolOptions.ts` | React-Query wrapper around `get_diamond_pool_distinct_values`. 30 min stale. |
| `src/lib/diamond-pool-normalize.ts` | Maps raw pool tokens (`EX`→`Excellent`, `NON`→`None`, etc.) and unions them with canonical option lists. Sibling copy lives in the `generate-client-diamond-presets` edge function. |
| `src/hooks/useClientDiamondCatalogAvailability.ts` | Reads `get_client_diamond_catalog_availability` for downstream UI (which shapes/carats actually appear so empty options can be greyed). |

---

## 4. The "Confirm" Click — Step-by-step

When the green **Update Confirmed Catalog** button is clicked:

1. `DiamondCatalogLive.handleConfirm()` runs.
2. `cleanFilterForServer(filter, distinct)` strips tokens that aren't present in the pool (avoids dead filters).
3. Single UPSERT against `client_diamond_catalog_filter` keyed on `client_id`.
4. UI flips `isConfirmed = true`, stores `confirmedAt`, toast `"Catalog confirmed — your widget is now live with these diamonds"`.
5. **No edge function**, no preset materialization, no Shopify push. The pool stays the source of truth.

Optional reconciliation: an admin can call `sync_client_diamond_catalog_from_filter(client_id)` to materialize a snapshot into `client_diamond_presets`. This is for legacy code paths only — the widget does not need it.

---

## 5. Widget Read Path (Ring OS Stone Step)

### 5.1 Hook
**`src/hooks/useClientDiamondPresets.ts`** — single call:
```ts
supabase.rpc('get_diamond_presets_filtered', {
  p_client_id: clientId,
  p_page_size: 2000,
  p_offset: 0,
})
```
Returns rows shaped `{ id, stone_type, shape_id, carat_range, carat_value, color, clarity, base_price, custom_price, is_enabled, cut_grade, fluorescence, report_no }`.

### 5.2 Inside the RPC

Pseudocode of the rewritten `get_diamond_presets_filtered` body (see migration `20260525112742_*.sql` + later fixes):

```sql
SELECT filter, markup_natural, markup_lab, is_confirmed
  INTO v_row
FROM client_diamond_catalog_filter
WHERE client_id = p_client_id;

IF v_row.is_confirmed THEN
  RETURN QUERY
  SELECT
    p.id,
    p.stone_type,
    p.shape         AS shape_id,
    bucket(p.carat) AS carat_range,
    p.carat         AS carat_value,
    p.color, p.clarity,
    ROUND(p.price * (1 + CASE
        WHEN p.stone_type='natural' THEN v_row.markup_natural
        ELSE v_row.markup_lab END / 100), 2) AS base_price,
    NULL::numeric AS custom_price,
    true          AS is_enabled,
    p.cut, p.fluorescence, p.report_no
  FROM diamond_inventory_pool p
  WHERE diamond_pool_row_matches(p, v_row.filter)
    AND (p_carat_range IS NULL OR bucket(p.carat) = p_carat_range)
  ORDER BY p.price
  LIMIT p_page_size OFFSET p_offset;
ELSE
  -- legacy fallback
  RETURN QUERY SELECT ... FROM client_diamond_presets WHERE client_id = p_client_id ...;
END IF;
```

Effect: any new row inserted into `diamond_inventory_pool` that satisfies the saved JSONB filter appears in the next widget fetch — no rebuild required.

### 5.3 Consumers of `get_diamond_presets_filtered`

| File | Context |
|---|---|
| `src/components/ring-builder/steps/StoneStep.tsx` | Embed widget step. Calls with `p_carat_range` to fetch a single carat bucket on demand. |
| `src/hooks/useClientDiamondPresets.ts` | Builder UI bulk fetch (2000 rows). |
| `src/components/orders/OrderDetailView.tsx` | Order detail rehydration. |
| `supabase/functions/ring-chat/index.ts` | JewlX Agent — picks diamonds for AI suggestions. |
| `supabase/functions/shopify-add-to-cart/index.ts` | Validates the selected diamond at checkout (diamond passed as Shopify line-item property, not a synced product). |

---

## 6. Admin Pool Maintenance (upstream)

- Admin uploads at `/admin/diamond-pool` (`src/pages/admin/DiamondPool.tsx`). Large CSV imports go through staging → bulk insert into `diamond_inventory_pool`.
- A full client refresh after a wipe is a simple `TRUNCATE diamond_inventory_pool` + reload — every client whose `client_diamond_catalog_filter` row still exists will immediately re-populate against the new pool the next time the widget is fetched. No per-client regeneration is needed.
- Edge function `supabase/functions/reset-client-diamonds/index.ts` clears legacy `client_diamond_presets` for one client (used only for fallback path).
- Edge function `supabase/functions/generate-client-diamond-presets/index.ts` (legacy) can materialize presets from the pool; superseded by the live filter approach but kept available for the fallback branch.

---

## 7. File / Migration Reference Quick Index

### Frontend
- `src/pages/client/Catalog.tsx` — mounts `DiamondCatalogLive`
- `src/components/catalog/diamond-catalog/DiamondCatalogLive.tsx` — the entire filter UI + confirm UPSERT
- `src/hooks/useDiamondPoolOptions.ts`
- `src/hooks/useClientDiamondPresets.ts`
- `src/hooks/useClientDiamondCatalogAvailability.ts`
- `src/lib/diamond-pool-normalize.ts`
- `src/components/ring-builder/steps/StoneStep.tsx` — widget consumer

### Edge functions
- `supabase/functions/generate-client-diamond-presets/` — legacy/fallback materializer
- `supabase/functions/reset-client-diamonds/` — wipes legacy presets
- `supabase/functions/ring-chat/` — JewlX Agent uses widget RPC
- `supabase/functions/shopify-add-to-cart/` — validates diamond at checkout

### Migrations (in order)
- `20260521073632_*.sql` — diamond_inventory_pool + distinct values RPC
- `20260522084012_*.sql`, `20260522120000_diamond_paginated_fetch.sql`, `20260522130000_diamond_reset_fn.sql`, `20260522140000`, `..150000`, `..160000_delete_diamond_chunk*.sql`
- `20260525105716_*.sql`, `20260525105751_*.sql`, **`20260525112742_*.sql` (pool-driven rewrite — most important)**, `20260525120630_*.sql`, `20260525121841_*.sql`, `20260525124435_*.sql`, `20260525152107_*.sql`
- `20260526184801_*.sql`, `20260526204215_*.sql`, `20260526204317_*.sql`, `20260526204425_*.sql`, `20260526204502_*.sql`, `20260526234350_fix-diamond-presets-dedup-by-price.sql`
- `20260528061648_*.sql`, `20260528100000_add-source-pool-fields-to-client-diamond-presets.sql`, `20260528100001_update-generate-presets-with-pool-ref.sql`, `20260528100002_backfill-client-presets-pool-ref.sql`, `20260528100003_diamond-presets-return-report-no.sql`
- `20260529033626_*.sql` — hardens `sync_client_diamond_catalog_from_filter` (45s timeout + advisory lock)
- `20260603120000_diamond-catalog-attributes.sql`, `20260603132238_*.sql`

### Changelog
- `.lovable/changelog-diamond-pool-catalog.md` — the human summary of the 2026-05-25 pool-driven rewrite.

---

## 8. TL;DR Flow

1. Admin uploads diamonds → `diamond_inventory_pool`.
2. Client opens **Catalog → Diamonds**. UI calls `get_diamond_pool_distinct_values` + reads saved row from `client_diamond_catalog_filter`.
3. Client toggles filters. Each change calls `get_diamond_pool_preview` for the live grid + count.
4. Client clicks **Update Confirmed Catalog** → single UPSERT into `client_diamond_catalog_filter` with `is_confirmed=true`. No generation step.
5. Ring OS widget calls `get_diamond_presets_filtered(client_id)` for every visitor. RPC detects `is_confirmed=true`, streams matching pool rows with markup applied. New pool stock that matches the filter appears automatically.
