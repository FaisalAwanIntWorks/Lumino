# Diamond Catalog — Audit Findings

**Date:** 2026-05-29
**Scope:** End-to-end flow from admin CSV upload → `diamond_inventory_pool` → client Catalog page (`DiamondCatalogLive`) → confirm filter → Ring OS widget (`StoneStep`).
**Source bundle reviewed:** `diamondreportno/diamond-catalog-source-bundle.md` (14,417 lines).
**Status:** Analysis only — no code changes were made.

---

## 1. End-to-end flow (one-line map)

```
Admin CSV → DiamondPool.tsx (parse + coerce values)
   ├─ replace mode → diamond_inventory_pool_staging → swap_diamond_inventory_pool() RPC
   │                                                  → TRUNCATE pool + INSERT from staging
   └─ append mode → DIRECT INSERT into diamond_inventory_pool

Client → Catalog → Diamonds tab → <DiamondCatalogLive/>
   ├─ READ: get_diamond_pool_distinct_values() (to build filter chips)
   ├─ LIVE PREVIEW: get_diamond_pool_preview(filter, markup_natural, markup_lab, ...)
   └─ Confirm Catalog → UPSERT client_diamond_catalog_filter (only this one table)

Widget (StoneStep / useClientDiamondPresets) → get_diamond_presets_filtered(client_id)
   ├─ If client_diamond_catalog_filter.is_confirmed = TRUE → POOL PATH
   │     → Read diamond_inventory_pool directly, apply markup, DISTINCT ON dedup,
   │       pick the most expensive row per (stone_type, shape, carat_range, color, clarity)
   └─ Else → LEGACY PATH → serve from client_diamond_presets
```

---

## 2. What happens when the client clicks "Confirm Catalog" / "Update Confirmed Catalog"

There are two different "generate" buttons in the codebase — let's keep them separate:

| UI button | Function | Write target |
|---|---|---|
| **Diamonds tab → "Confirm Catalog" / "Update Confirmed Catalog"** (`DiamondCatalogLive.handleConfirm`, line 3574) | `supabase.from('client_diamond_catalog_filter').upsert(...)` | **Only `client_diamond_catalog_filter`** (one row per client). That's it. |
| Rings tab → "Generate your ring catalog" (`handleGenerateCatalog`, line 1697) | `supabase.functions.invoke('generate-client-catalog')` | `client_ring_catalog` + onboarding prefs (separate flow, not in scope) |

So for the diamond catalog **only one table is written**: `client_diamond_catalog_filter`. The columns saved are `filter` (jsonb), `markup_natural`, `markup_lab`, `is_confirmed`, `confirmed_at`.

**Is the write path smooth?** Mostly — but there are hidden issues. See Issue #2 and #4 below.

---

## 3. Findings

### CRITICAL — data correctness and security issues

#### Issue #1 — The `lg` column has two incompatible interpretations across the codebase (data integrity bug)

`lg` is the lab-grown flag column. Two conflicting interpretations run side by side:

| Path | Interpretation | Files / lines |
|---|---|---|
| `generate_client_diamond_presets_db` (migrations 20260522053557, 20260528060728, 20260528100001), `count_diamond_presets_estimate`, legacy edge fn code, backfill migration 20260528100002 | `WHEN lower(lg) = 'natural' THEN 'natural' ELSE 'lab'` (expects the literal string `"natural"`) | lines 9039, 13082, 13663, 8495, 13956 |
| `get_diamond_pool_preview`, pool path of `get_diamond_presets_filtered`, `diamond_pool_row_matches`, `sync_client_diamond_catalog_from_filter` | `WHEN lg ILIKE 'Y%' THEN 'lab' ELSE 'natural'` (expects a Y/N flag) | lines 10898, 11001, 12896, 14082 |

The same physical diamond row can be classified differently depending on which code path runs:

- If `lg = NULL` or `''`: materializer says `lab`, live RPC says `natural`. **Opposite.**
- If `lg = 'N'`: materializer says `lab`, live RPC says `natural`. **Opposite.**
- If `lg = 'Y'`: materializer says `lab`, live RPC says `lab`. ✅
- If `lg = 'natural'` (literal word): materializer says `natural`, live RPC says `natural`. ✅

**Impact:**
- A client using `client_diamond_presets` (legacy materialized) will see a different lab/natural split than a client using the new pool-driven path.
- The backfill migration (20260528100002) that maps `source_pool_id` uses the OLD logic, but runtime widget uses the NEW logic — backfill joins may match the wrong rows.

**Suggested fix:** Create a single `diamond_pool_stone_type(lg text) RETURNS text IMMUTABLE` SQL function (one already appears at line 14330 referenced as `public.diamond_pool_stone_type(p.lg)`) and use it everywhere. No inline expressions.

---

#### Issue #2 — `Confirm Catalog` never calls `sync_client_diamond_catalog_from_filter` (major missing link)

`DiamondCatalogLive.handleConfirm` only upserts `client_diamond_catalog_filter`. But migration `20260529033626` defines a great function — `sync_client_diamond_catalog_from_filter(client_id)` — which:

- Materializes `client_diamond_presets` from the filter,
- Populates `client_carat_options`,
- Tracks coverage % and missing combinations in `client_catalog_health`,
- Runs safely under an advisory lock.

But **the frontend never calls it**. Consequences:

- The Ring builder widget still works (it uses the pool path → OK).
- **But the Catalog page's Diamonds tab filter dropdowns stay empty.** `initDiamondCatalog()` → `get_diamond_preset_filter_options(p_client_id)` (line 1115) only reads distinct values from `client_diamond_presets`. For a pool-driven user that table is empty → `availableDiamondShapes / Colors / Clarities / CaratRanges` all empty → "Your Catalogue" tab filter dropdowns are dead.
- `client_carat_options` stays empty → ring-builder carat step (any consumer of that table) won't show options.
- `hasDiamondCatalog` is derived from `opts.totalCount > 0` (line 1116). For pool-driven users `client_diamond_presets` is empty → `hasDiamondCatalog = false` → the UI thinks the client hasn't generated a catalog yet, even though they have.

**Suggested fix:** Inside `handleConfirm`, after the upsert succeeds, call `supabase.rpc('sync_client_diamond_catalog_from_filter', { p_client_id: clientId })`. Then refresh UI state.

---

#### Issue #3 — `mass_update_diamond_prices` has no authorization check (SECURITY)

`mass_update_diamond_prices` (migration 20260522120000, line 10345) is `SECURITY DEFINER` and `GRANT TO authenticated`, **but the function body contains no `auth.uid()` check**. Any logged-in user can pass any `client_id` and modify the prices of another client's diamonds.

Compare with `delete_client_diamond_chunk` (line 10412), which does a proper auth check (agency_admin / owner / staff-with-edit). `mass_update_diamond_prices` should have the same guard.

---

#### Issue #4 — "Reset Diamond Catalog" doesn't actually reset for pool-confirmed users

`handleResetDiamondCatalog` (line 916):
1. Loops `delete_client_diamond_chunk` (deletes from `client_diamond_presets`),
2. Deletes from `diamond_catalog_config`.

But it does **not** delete from `client_diamond_catalog_filter`. So:

- If the client used the pool-driven `Confirm Catalog` flow → `client_diamond_presets` was already empty.
- After "reset", `is_confirmed = true` still → `get_diamond_presets_filtered` still routes to the pool path → **the catalog isn't actually reset; the entire pool keeps showing**.

The UI calls `setHasDiamondCatalog(false)` but the RPC behavior says otherwise. **Misleading and ineffective.**

**Suggested fix:** Add `await supabase.from('client_diamond_catalog_filter').delete().eq('client_id', clientId);` (or set `is_confirmed = false`) inside `handleResetDiamondCatalog`.

---

#### Issue #5 — "Mass Edit Prices" silently broken when filter is confirmed

`mass_update_diamond_prices` updates `client_diamond_presets.custom_price`. But for pool-confirmed users the widget is served from the pool path, where `custom_price` is hardcoded `NULL::numeric` (lines 13523, 14155). Mass Edit does nothing for those users — the toast still says "Updated X diamond prices" but the effect is zero.

---

### HIGH — bad practices and redundancy

#### Issue #6 — 280+ lines of dead code in `generate-client-diamond-presets/index.ts`

After `return new Response(...)` at line 8369, ~280 lines (lines 8374–8660) are unreachable — the old in-memory generator. The function now uses the DB RPC `generate_client_diamond_presets_db` and returns directly. Delete the dead block (or archive it in migration history).

#### Issue #7 — `parseCSVLine` doesn't handle embedded newlines

In `DiamondPool.tsx`, `lines = text.split(/\r?\n/)` runs *before* `parseCSVLine`. If any quoted CSV field contains a newline (rare for diamonds but possible — e.g. a mine description), parsing fails silently. Better: use a streaming CSV parser like PapaParse.

#### Issue #8 — Entire CSV loaded into memory

`text = await file.text()` dumps a 100+ MB CSV into browser memory and can crash the tab. A streaming parser + batched POSTs would be safer.

#### Issue #9 — `Catalog.tsx` line 1003 runs a full-pool COUNT(*) on every Catalog mount

```ts
await supabase.rpc('get_diamond_pool_preview', { p_filter: {} as never, ..., p_page_size: 1, p_offset: 0 })
```

This runs `COUNT(*) OVER ()` over the whole `diamond_inventory_pool` just to fetch `total_count`. There's already a dedicated function — `get_diamond_pool_filter_count(jsonb)` — which does a plain `SELECT COUNT(*)` (much faster, no window function). Use that.

#### Issue #10 — Four parallel shape-normalization implementations

Same logic duplicated in:

- `src/lib/diamond-pool-normalize.ts` — `POOL_SHAPE_MAP`
- `supabase/functions/generate-client-diamond-presets/index.ts` — inline `POOL_SHAPE_MAP`
- SQL `public._diamond_preset_shape_id(p_shape)` IMMUTABLE function
- `DiamondCatalogLive.tsx` lines 3418, 3657, 3664 — inline `s.toLowerCase().split(' ')[0]`
- SQL `LOWER(SPLIT_PART(REGEXP_REPLACE(shape,'\s+',' ','g'),' ',1))` (in 4+ RPCs)

`SPLIT_PART(...,' ',1)` and `_diamond_preset_shape_id` are mostly aligned (cushion brilliant → cushion), but edge cases (e.g. `'OLD MINE BRILLIANT'`) differ. All call sites should use the same SQL function.

#### Issue #11 — Four parallel `carat_range` (bucket label) implementations

- TS: `Catalog.tsx::getCaratRangeLabel` (includes the `'0.20-0.49'` bucket)
- TS: edge fn `getCaratRange` (no `0.20-0.49`)
- SQL: `_diamond_preset_carat_range` (no `0.20-0.49`)
- SQL inline: `TRIM(TO_CHAR(carat_bucket,'FM0.00')) || '-' || TRIM(TO_CHAR(carat_bucket+0.49,'FM0.00'))`

The first one handles 0.20-carat diamonds, the other three don't. If the pool contains a 0.30ct diamond, the SQL side assigns bucket `"0.50-0.99"` — `_diamond_preset_carat_range` doesn't check the lower bound. **A 0.30ct diamond silently lands in the "0.50-0.99" bucket** — wrong.

#### Issue #12 — `availableDiamond*` filter options are blank for pool-driven users

`get_diamond_preset_filter_options` reads only the legacy table. When the pool-driven path is active, all filter dropdowns stay empty. UX broken. (This is a downstream effect of Issue #2.)

#### Issue #13 — `EXCLUDED_COLORS` (K-faints) is a UI-only filter

`DiamondCatalogLive.tsx` line 3408 hides `'K FAINT'`, `'L FAINT BROWN'` etc from display. But if a user previously (legacy filter) explicitly saved those colors, `hydrateFilterFromServer` doesn't strip them. The saved filter keeps those values and the RPC keeps matching them. Sanitize on hydrate.

#### Issue #14 — `handleConfirm` allows a race between rapid clicks

The button is `disabled={saving || totalCount === 0}`. `previewRequestId` ref dedupes preview calls, but there's no similar guard for confirm. Idempotency is fine (upsert), but two confirms with different filters could race and a toast for the first one could appear after the second one's completion overwrites state.

#### Issue #15 — `fetchDiamondPage` has no request-cancellation guard

`Catalog.tsx` line 1066: toggling filters quickly fires 3 concurrent RPC calls; whichever returns last wins — race possible. `DiamondCatalogLive` already solves this with `previewRequestId` ref; `fetchDiamondPage` needs the same pattern.

#### Issue #16 — Admin "append" mode has no de-duplication

There's no unique constraint on `stock_id` / `report_no` / `external_id` (not visible in the bundle, usually absent). Uploading the same CSV again in append mode → duplicate rows. The pool path's `DISTINCT ON` dedup hides this at the widget layer (across 5 keys), but storage is wasted and counts inflate.

#### Issue #17 — `swap_diamond_inventory_pool` has a redundant UPDATE

```sql
UPDATE diamond_inventory_pool SET import_batch_id = p_batch_id WHERE import_batch_id IS NULL;
```

`import_batch_id` is already set on the client side at line 198 (`obj: { import_batch_id: batchId }`), so by the time staging is swapped in, every row already has it populated. This `UPDATE` either touches 0 rows or scans unnecessarily. Just remove it.

#### Issue #18 — Progress bar reaches 100% even on errors

In `DiamondPool.handleFile` the `finally` block calls `setProgress(100)` in every case, even when `errors` is non-zero. Gives the user the wrong impression.

#### Issue #19 — `refreshCount` runs two sequential queries

A `SELECT count` and a `SELECT imported_at` go in separate round-trips. Combine into one RPC or run them in parallel with `Promise.all`.

#### Issue #20 — `is_enabled` is hardcoded `true` in the pool path

Per-diamond enable/disable was a legacy feature. The pool path always returns `true` for every row → admin/client has no way to temporarily disable a pool diamond. Either drop the feature, or join a `disabled_pool_diamonds(client_id, pool_id)` table.

#### Issue #21 — `get_diamond_pool_preview` / `get_diamond_pool_filter_count` have no auth check

`SECURITY DEFINER` + `GRANT TO authenticated` means any logged-in client can see the full pool. Often that's intentional (shared inventory), but if per-client pool slicing is needed later, it's worth setting up the guard now.

#### Issue #22 — `client_diamond_catalog_filter` has both `confirmed_at` and `applied_at`

`handleConfirm` sets `confirmed_at`. `sync_client_diamond_catalog_from_filter` sets `applied_at`. The two are different concepts (confirm vs apply), which is fine — but there's no doc or comment explaining the distinction.

#### Issue #23 — Unused parameter in `buildDefaultMetalVariants`

Line 771: parameter is `_metals` (underscore) and the function returns a constant. Either remove the parameter or actually use it.

#### Issue #24 — Three overlapping "carat range" concepts in the same UI

`StoneStep.tsx` `selectedCaratRange: number | null` — bucket start (e.g. 1.5). `CatalogFilter.caratRanges: number[]` — multi-select bucket starts. `CatalogFilter.caratMin/Max: string` — open-range. All exist in parallel. The UI should converge on one concept.

---

### MINOR / code smell

#### Issue #25 — `(supabase as any).rpc(...)` casts bypass type safety

`Catalog.tsx` line 924 and several other places. Regenerate Supabase types.

#### Issue #26 — `useClientDiamondPresets` uses a hardcoded `p_page_size: 2000`

The pool path's DISTINCT ON keeps the result ≤ ~300 rows anyway, but the legacy path could miss the 2001st preset. Migration 20260526234350's commit message tells the full story of the `$4,294 vs $7,948` bug this caused.

#### Issue #27 — `WHITE_EXTRAS` and `recalculateMetalPrices` are tightly coupled

`/white gold plated/i` regex matches the constant directly. Make the constant the single source of truth.

#### Issue #28 — `EXCLUDED_COLORS` hardcoded in the component

Business rule embedded in code. Move into a lookup table (`excluded_diamond_colors`).

#### Issue #29 — `useDiamondPoolOptions` has `staleTime: 30 min`

If admin uploads a CSV now, clients will see old distinct values for up to 30 minutes. Acceptable trade-off, but it deserves a comment.

#### Issue #30 — `cleanFilterForServer` collapses "all selected" to `{}`

If the pool later gets a new color or shape, a saved `{}` will silently include it. The "live" semantics are intentional per the changelog, but the `confirmed_at` field suggests the snapshot was meant to be fixed. Document the trade-off explicitly.

---

## 4. About the "highest price per (color, cut, carat_range)" selection

The dedup query that picks the most expensive diamond per group (migrations 20260526234350 and 20260528100003) is correct:

```sql
DISTINCT ON (stone_type, shape_id, carat_range, color, clarity)
ORDER BY stone_type, shape_id, carat_range, color, clarity,
         base_price DESC, report_no NULLS LAST
```

The earlier `LIMIT 2000` bug (the famous `$4,294 vs $7,948` case) has been fixed.

Two caveats:

- The dedup key does **not** include `cut`. It's `(stone_type, shape_id, carat_range, color, clarity)`. If the admin wants `cut` to also differentiate presets (e.g. Excellent vs Very Good as separate presets), it won't happen today.
- The pool path returns no `cut_grade` — that column isn't projected into the RPC return (around line 14155). So in `StoneStep` and `DiamondDetailInfoDialog` the cut info is missing for pool-driven users.

---

## 5. Priority-ordered fix list (do later, not now)

| Priority | Issue | Effort |
|---|---|---|
| P0 | #1 Unify `lg` normalization (one SQL function, used everywhere) | Med |
| P0 | #3 Add auth check to `mass_update_diamond_prices` | Low |
| P0 | #2 Call `sync_client_diamond_catalog_from_filter` from `handleConfirm` | Low |
| P1 | #4 Reset should also delete from `client_diamond_catalog_filter` | Low |
| P1 | #5 Make Mass Edit pool-path-aware (or hide it for pool users) | Med |
| P1 | #11 Align the 0.20-0.49 carat bucket across all four definitions | Low |
| P1 | #12 Hydrate filter dropdowns from pool distinct values | Med |
| P2 | #6 Remove dead code from the edge function | Low |
| P2 | #9 Use `get_diamond_pool_filter_count` for the cheap count | Low |
| P2 | #10 Single shape-normalize SQL function | Med |
| P2 | #15 Add a request-id guard to `fetchDiamondPage` | Low |
| P3 | #7, #8 Switch to a streaming CSV parser | Med |
| P3 | #16 Add a `stock_id` unique constraint for append-mode dedup | Low |

---

## 6. Quick summary

- The widget read path (`get_diamond_presets_filtered` → pool path → `DISTINCT ON ... ORDER BY base_price DESC`) is **correct**.
- The "Confirm Catalog" write path is **incomplete** — only `client_diamond_catalog_filter` is written. The sync RPC that materializes everything else is never called, so half of the Catalog UI ends up in a dead state.
- The `lg` column is interpreted **two different ways** in two parts of the codebase — same diamond, different classification, depending on which path runs.
- `mass_update_diamond_prices` has a **security hole** (no auth check).
- Reset doesn't truly reset for pool-driven users.


