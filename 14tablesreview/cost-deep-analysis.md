# Lovable Cloud Cost — Deep Root-Cause Analysis

**Generated:** 2026-04-23
**Author:** Claude (Opus 4.7)
**Scope:** Why are costs still high *after* the 2026-04-22 cost-optimization patch? What actual inefficiencies remain in code, indexes, polling, and cron jobs?

---

## TL;DR — The 5 Real Cost Drivers (in priority order)

| # | Issue | Severity | Where | Effort to fix |
|---|---|---|---|---|
| 1 | **Cleanup crons are NOT scheduled.** Storage, `analytics_events`, `client_activity_logs`, and `ai_usage_logs` grow forever. Cost-strategy doc claims they run, but the migration only defines the *functions* — `cron.schedule()` was never called for them. | 🔴 CRITICAL | `supabase/migrations/20260422182534_*.sql` | 1 migration |
| 2 | **Missing compound indexes** on `(client_id, created_at DESC)` for 8 of the 14 tables that are now polled every 45 seconds. Every poll = full table scan or sort spill. | 🔴 CRITICAL | All lead tables | 1 migration |
| 3 | **`useCustomerHub.ts` fetches `select('*')` × 9 tables, no `.limit()`, every 45 s** for the entire client's history. On busy clients this is the single largest egress + DB-CPU bill. | 🔴 CRITICAL | `src/hooks/useCustomerHub.ts:62-72` | hook rewrite |
| 4 | **`client-dashboard-stats` edge function fires 17 parallel queries every 45 s** (per dashboard tab) and re-aggregates everything in JS. No DB-side roll-up. | 🟠 HIGH | `supabase/functions/client-dashboard-stats/index.ts` | aggregate via SQL RPC |
| 5 | **Broken / orphan realtime channels.** Several pages still call `.on('postgres_changes', ...)` on tables that were dropped from `supabase_realtime` publication. The WebSocket sub stays open forever, never receives events, and pages silently fall back on a manual refresh. | 🟡 MED | 5 pages (see §4) | delete dead subs |

Fix #1 + #2 alone will visibly cut your bill within 24 hours (storage + DB CPU). #3 + #4 will cut sustained egress and edge-function invocations by ~70 %. #5 is hygiene.

---

## 1. CRITICAL — Cleanup crons defined but NEVER scheduled

### Evidence

The strategy document (`.lovable/memory/infrastructure/cost-optimization-strategy.md`) says:

> **Scheduled cleanup jobs (pg_cron):**
> - `cleanup_orphan_ai_previews_daily` — daily 03:00 UTC
> - `trim_old_log_tables_monthly` — 1st of month 04:00 UTC
> - `ai_usage_logs` already archived to `ai_usage_monthly_summary` by `archive_old_ai_usage_logs`

I read **the entire 113-line migration** that supposedly applied this:
`supabase/migrations/20260422182534_458dcbf2-bea6-4c9e-b91c-c6cbe5879e95.sql`

It contains:
- `ALTER PUBLICATION supabase_realtime DROP TABLE …` ✅
- `CREATE OR REPLACE FUNCTION public.trim_old_log_tables()` ✅
- `CREATE OR REPLACE FUNCTION public.cleanup_orphan_ai_previews()` ✅

It does **NOT** contain a single `SELECT cron.schedule(...)` call. I grepped:

```
$ grep "cron\.schedule" 20260422182534_*.sql
(no matches)
```

Same for `archive_old_ai_usage_logs` in migration `20260319121415_*.sql` — function is created, never scheduled.

**Result:** The functions exist in the database but are dead code. Nobody is calling them. So:
- 60-day-old AI preview images in `diamond-inspiration` bucket → **kept forever**
- `analytics_events` rows older than 90 days → **kept forever** (and this table receives an INSERT on every widget ring view, see §6)
- `client_activity_logs` older than 90 days → **kept forever**
- `ai_usage_logs` rows older than 90 days → **kept forever** (no monthly roll-up running)

Storage and DB row counts grow monotonically. This is **mechanical, ongoing cost** that has nothing to do with traffic spikes — it just compounds every day.

### Fix — single migration

```sql
-- File: supabase/migrations/<new-timestamp>_schedule-cleanup-crons.sql

-- Drop any prior versions (idempotent)
DO $$
BEGIN
  PERFORM cron.unschedule('cleanup_orphan_ai_previews_daily')
    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cleanup_orphan_ai_previews_daily');
  PERFORM cron.unschedule('trim_old_log_tables_monthly')
    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'trim_old_log_tables_monthly');
  PERFORM cron.unschedule('archive_old_ai_usage_logs_monthly')
    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'archive_old_ai_usage_logs_monthly');
END $$;

-- Daily orphan AI preview cleanup (03:00 UTC)
SELECT cron.schedule(
  'cleanup_orphan_ai_previews_daily',
  '0 3 * * *',
  $$SELECT public.cleanup_orphan_ai_previews()$$
);

-- Monthly log trim (1st of month, 04:00 UTC)
SELECT cron.schedule(
  'trim_old_log_tables_monthly',
  '0 4 1 * *',
  $$SELECT public.trim_old_log_tables()$$
);

-- Monthly AI usage log archival (2nd of month, 04:00 UTC)
SELECT cron.schedule(
  'archive_old_ai_usage_logs_monthly',
  '0 4 2 * *',
  $$SELECT public.archive_old_ai_usage_logs()$$
);
```

### Verify

```sql
SELECT jobname, schedule, active
FROM cron.job
WHERE jobname IN (
  'cleanup_orphan_ai_previews_daily',
  'trim_old_log_tables_monthly',
  'archive_old_ai_usage_logs_monthly'
);
```

Then run the cleanup function once manually to clear the historical backlog:

```sql
SELECT public.cleanup_orphan_ai_previews();   -- returns deleted count
SELECT public.trim_old_log_tables();          -- returns analytics + activity counts
SELECT public.archive_old_ai_usage_logs();
```

---

## 2. CRITICAL — Missing compound indexes on `(client_id, created_at DESC)`

### Evidence

The cost-optimization patch removed 8 tables from realtime and replaced them with **45-second polling**. The query pattern across the whole frontend is:

```ts
.from('<table>').select('*').eq('client_id', X).order('created_at', { ascending: false })
```

For this to be efficient on tables with thousands/tens-of-thousands of rows per client, you need a compound index `(client_id, created_at DESC)`. Without it, Postgres has to either:
1. Use a `client_id`-only index, then sort all matching rows by `created_at` (sort spill on big clients),
2. Or do a sequential scan if no `client_id` index exists.

I grepped every migration in `supabase/migrations/` for `CREATE INDEX` matching the 14 polled tables. Result:

| Table | Indexes that exist | Required compound index | Status |
|---|---|---|---|
| `saved_designs` | `(client_id)`, `(customer_email)` | `(client_id, created_at DESC)` | ❌ MISSING |
| `grill_form_leads` | none on these cols | `(client_id, created_at DESC)` | ❌ MISSING |
| `custom_enquiry_leads` | none | `(client_id, created_at DESC)` | ❌ MISSING |
| `design_requests` | none | `(client_id, created_at DESC)` | ❌ MISSING |
| `appointment_bookings` | none | `(client_id, created_at DESC)` + `(client_id, preferred_date)` | ❌ MISSING |
| `metal_buying_leads` | none | `(client_id, created_at DESC)` | ❌ MISSING |
| `diamond_form_leads` | none | `(client_id, created_at DESC)` | ❌ MISSING |
| `ai_chat_sessions` | none | `(client_id, started_at DESC)` | ❌ MISSING |
| `cad_requests` | none on these cols | `(client_id, created_at DESC)` + `(client_id, status)` | ❌ MISSING |
| `cad_request_messages` | none | `(cad_request_id, created_at)` | ❌ MISSING |
| `cad_resize_requests` | none | `(client_id, created_at DESC)` + `(order_id)` | ❌ MISSING |
| `orders` | `(client_id)`, `(client_id, status)`, `(created_at)` | `(client_id, created_at DESC)` | ❌ partial only |
| `client_notifications` | `(client_id, created_at DESC)`, `(client_id, is_read)` | OK | ✅ |
| `admin_notifications` | unknown — check | `(user_id, created_at DESC)`, `(user_id, is_read)` | ⚠️ verify |

Out of 14 tables, **only `client_notifications` has the right index**. Every other poll (every 45 s × every connected tab × every client) is doing more work than it needs to.

### Why this is a cost driver

Lovable Cloud bills you for **DB compute time**. A query that takes 200 ms because of a sort spill bills you 10× more than the same query taking 20 ms with the right index. Multiply by 80 polls per hour × N tabs.

### Fix — single migration

```sql
-- File: supabase/migrations/<new-timestamp>_polling-hot-path-indexes.sql

CREATE INDEX IF NOT EXISTS idx_saved_designs_client_created
  ON public.saved_designs (client_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_grill_form_leads_client_created
  ON public.grill_form_leads (client_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_custom_enquiry_leads_client_created
  ON public.custom_enquiry_leads (client_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_design_requests_client_created
  ON public.design_requests (client_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_appointment_bookings_client_created
  ON public.appointment_bookings (client_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_appointment_bookings_client_preferred
  ON public.appointment_bookings (client_id, preferred_date);

CREATE INDEX IF NOT EXISTS idx_metal_buying_leads_client_created
  ON public.metal_buying_leads (client_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_diamond_form_leads_client_created
  ON public.diamond_form_leads (client_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_chat_sessions_client_started
  ON public.ai_chat_sessions (client_id, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_cad_requests_client_created
  ON public.cad_requests (client_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_cad_requests_client_status
  ON public.cad_requests (client_id, status);

CREATE INDEX IF NOT EXISTS idx_cad_request_messages_request_created
  ON public.cad_request_messages (cad_request_id, created_at);

CREATE INDEX IF NOT EXISTS idx_cad_resize_requests_client_created
  ON public.cad_resize_requests (client_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_cad_resize_requests_order
  ON public.cad_resize_requests (order_id);

CREATE INDEX IF NOT EXISTS idx_orders_client_created
  ON public.orders (client_id, created_at DESC);

ANALYZE public.saved_designs;
ANALYZE public.grill_form_leads;
ANALYZE public.custom_enquiry_leads;
ANALYZE public.design_requests;
ANALYZE public.appointment_bookings;
ANALYZE public.metal_buying_leads;
ANALYZE public.diamond_form_leads;
ANALYZE public.ai_chat_sessions;
ANALYZE public.cad_requests;
ANALYZE public.cad_request_messages;
ANALYZE public.cad_resize_requests;
ANALYZE public.orders;
```

This is **non-blocking** (Postgres can build these indexes online with `CONCURRENTLY` if needed for very large tables — for the current dataset, plain `CREATE INDEX` is fine).

### Verify

For one of the polled queries, run `EXPLAIN ANALYZE`:

```sql
EXPLAIN ANALYZE
  SELECT * FROM public.saved_designs
  WHERE client_id = '<some-uuid>'
  ORDER BY created_at DESC;
```

Before fix: `Seq Scan` or `Sort` step with high cost.
After fix: `Index Scan using idx_saved_designs_client_created` with no separate sort.

---

## 3. CRITICAL — `useCustomerHub` over-fetches every 45 seconds

### Evidence

`src/hooks/useCustomerHub.ts:57-72`:

```ts
const fetchAll = useCallback(async () => {
  …
  const [widgetRes, grillRes, enquiryRes, ringBuilderRes, bookingRes,
         metalRes, orderRes, cadRes, cadResizeRes] = await Promise.all([
    supabase.from('saved_designs').select('*').eq('client_id', clientId).order('created_at', { ascending: false }),
    supabase.from('grill_form_leads').select('*').eq('client_id', clientId).order('created_at', { ascending: false }),
    supabase.from('custom_enquiry_leads').select('*').eq('client_id', clientId).order('created_at', { ascending: false }),
    supabase.from('design_requests').select('*').eq('client_id', clientId).order('created_at', { ascending: false }),
    supabase.from('appointment_bookings').select('*').eq('client_id', clientId).order('created_at', { ascending: false }),
    supabase.from('metal_buying_leads').select('*').eq('client_id', clientId).order('created_at', { ascending: false }),
    supabase.from('orders').select('*').eq('client_id', clientId).order('created_at', { ascending: false }),
    supabase.from('cad_requests').select('*').eq('client_id', clientId).order('created_at', { ascending: false }),
    supabase.from('cad_resize_requests').select('*').eq('client_id', clientId).order('created_at', { ascending: false }),
  ]);
```

This is then called from:
- `useEffect(() => { fetchAll(); })` — on mount
- `setInterval(fetchAll, 45000)` — every 45 s
- `window 'focus'` listener — instant on tab return
- Realtime channel for `orders`, `cad_requests`, `cad_resize_requests` — also fires `fetchAll`

For a busy client with, say, 5 000 saved designs and 1 000 leads per source:
- One poll = ~10 000–15 000 rows pulled from DB
- `select('*')` includes huge JSONB columns (`configuration`, `ring_configuration`, `question_answers`, `photo_urls`, `metadata`)
- Per hour per tab: 80 polls × ~15 000 rows × ~1–5 KB/row = **1.2–6 GB egress per tab per hour**
- Multiply by every staff member with the dashboard open

The hook is consumed by `src/pages/client/SavedDesigns.tsx` only when `clientId === SANDBOX_CLIENT_ID` — but even one always-open admin tab pegs the bill.

### Why this is a cost driver

Three layered costs:
1. **DB CPU** — full scans (no compound indexes, see §2) on every poll
2. **Egress** — large JSONB blobs serialized over the wire
3. **Edge runtime** — every poll is a Supabase REST hop

### Fix — keep logic identical, just stop over-fetching

The hook is then used to derive a **customer hub view** (grouped by email, recent first). Nobody actually needs every row in every table. Two changes preserve UX:

**Change 1 — narrow the columns** (remove `select('*')`, request only what the hub actually maps in the `forEach` blocks):

```ts
// Replace the 9 select('*') with column-specific selects.
// Example for saved_designs (mapping uses these fields only):
supabase.from('saved_designs')
  .select('id, customer_name, customer_email, customer_phone, follow_up_status, created_at, configuration, product_name, notes')
  .eq('client_id', clientId)
  .order('created_at', { ascending: false })
  .limit(500),
```

Repeat for the other 8 queries — list only the fields the `forEach` actually reads. This alone cuts egress 60–80 % because it strips heavy JSON columns the UI never displays.

**Change 2 — cap with `.limit(500)` per source** (or whatever number matches your hub's display window). The hub sorts and re-buckets after fetch; if a customer has more than 500 widget submissions, they're already a power user and the hub paginating at 500 newest is fine.

**Change 3 — debounce the polling** (independent of the above). Currently every realtime event on `orders`/`cad_requests` triggers a full refetch. Wrap `fetchAll` in a 2-second debounce so a burst of inserts doesn't fan out to 9 queries each:

```ts
const debouncedFetch = useMemo(() => debounce(fetchAll, 2000), [fetchAll]);
```

---

## 4. HIGH — `client-dashboard-stats` edge function: 17 parallel queries every 45 s

### Evidence

`supabase/functions/client-dashboard-stats/index.ts:119-195` runs **17 parallel queries** per invocation. Then it pulls everything into JS and aggregates with `.reduce()` / `.filter()`.

The hook `useClientDashboard.ts` calls this:
- on mount
- `setInterval(fetchDashboardData, 45000)` — every 45 s
- on `focus`
- on every realtime event for `orders` and `client_notifications`

So one open dashboard tab triggers 17 queries every 45 s **plus** every event-driven refetch. With multiple staff tabs open, this multiplies linearly.

The `allClients` admin mode (line 399+) is even worse: it fetches the same lead tables across **all clients** with `.limit(500)` each, runs a separate sub-query against `analytics_events` for widget views without an index hint, and aggregates everything in JS.

### Fix — collapse the function to a single SQL RPC

This is a longer fix but the right one:

1. Create a Postgres function `public.get_client_dashboard_stats(p_client_id uuid, p_start timestamptz, p_end timestamptz)` that returns a single JSON with all the rolled-up numbers. All counting/summing happens DB-side.
2. The edge function becomes a thin wrapper: auth check → call the RPC → return its JSON.

Result: one round trip, server-side aggregation, ~10× less data shipped.

If the SQL RPC is too large a change right now, the **smaller win** is:

- Replace `.select('id, customer_name, …, configuration')` on `savedDesignsResult` etc. with `.select('id, follow_up_status, created_at', { count: 'exact', head: true })` for all the queries that only need *counts* — there are several. The function still hydrates `recentLeads` (top 5) but doesn't pull every row just to compute `leadSources.widget = savedDesigns.length`.
- Add a **30-second cache** on the function response keyed by `(clientId, startISO, endISO)` using an in-memory `Map` at module scope (Deno preserves edge function module state for the duration of the worker). Concurrent tabs hit the cache instead of all firing 17 queries simultaneously.

### Also check `admin-dashboard-stats`

`supabase/functions/admin-dashboard-stats/index.ts:69-89` — 17 parallel queries, several **redundant**:
- `orders` is fetched twice (full data + just `status`)
- `cad_requests` is fetched twice (id+status with count + just status)
- `cad_resize_requests` is fetched twice (same pattern)

You can drop the duplicate queries by computing both the count and the status map from the same single fetched result.

---

## 5. MEDIUM — Broken / orphan realtime subscriptions

### Evidence

The cost-optimization patch dropped 8 tables from `supabase_realtime` publication, but several pages still **try to subscribe to those tables**. The WebSocket connection succeeds (Supabase doesn't error on subscriptions to tables not in the publication), but **no events ever arrive**. So:

- The page silently behaves as if it had no live updates (only `fetchLeads()` on mount works).
- The connection still consumes a Realtime concurrent-connection slot.
- Every tab open = one wasted connection slot per orphan sub.

| File | Line | Subscribes to | Status |
|---|---|---|---|
| `src/pages/client/MetalBuyingLeads.tsx` | 144 | `metal_buying_leads` | ❌ table dropped from publication |
| `src/pages/client/DiamondFormsLeads.tsx` | 94 | `diamond_form_leads` | ❌ dropped |
| `src/pages/client/SavedDesigns.tsx` | 458 | 6 lead tables (DTT) / 5 lead tables | ❌ all dropped |
| `src/pages/client/AIConfigurator.tsx` | 100 | `ai_chat_sessions` | ❌ dropped |
| `src/hooks/useCustomerHub.ts` | 256 | `orders`, `cad_requests`, `cad_resize_requests` | ⚠️ `cad_resize_requests` not in publication — verify |

### Fix — replace with the same hybrid pattern used by `useClientDashboard`

For each broken sub, do **one** of:

**(A) Just delete the subscription.** The page already has a `RefreshCw` button. Users click refresh.

**(B) Replace with the polling-based hybrid pattern** (matches the rest of the codebase):
```ts
// 45s background poll
useEffect(() => {
  if (!clientId) return;
  const id = setInterval(fetchLeads, 45000);
  const onFocus = () => fetchLeads();
  window.addEventListener('focus', onFocus);
  return () => { clearInterval(id); window.removeEventListener('focus', onFocus); };
}, [clientId]);
```

**(C) Listen on `client_notifications` instead** (it IS in the publication and fires when `notify-form-lead` inserts a notification per new lead):
```ts
const channel = supabase.channel(`notif-${clientId}`)
  .on('postgres_changes',
    { event: 'INSERT', schema: 'public', table: 'client_notifications', filter: `client_id=eq.${clientId}` },
    () => fetchLeads())
  .subscribe();
```

Option (C) gives the closest thing to "instant" updates without re-adding the high-volume table to the publication.

### Also verify `cad_resize_requests`

`useCustomerHub.ts:253` lists `cad_resize_requests` as a "kept" realtime table, but I do not see it added to `supabase_realtime` in any migration. Check:

```sql
SELECT tablename FROM pg_publication_tables
WHERE pubname = 'supabase_realtime' ORDER BY tablename;
```

If it's not there: either add it (it's a low-churn table — admin-only updates), or remove the orphan subscription.

---

## 6. MEDIUM — `analytics_events` insert from frontend, no batching

### Evidence

`src/lib/tracking-utils.ts:5-17` does a direct `INSERT` into `analytics_events` on every ring view from the public widget:

```ts
await supabase.from('analytics_events').insert({
  client_id, event_type: 'ring_view', metadata: { … }
});
```

Then the dashboard reads them back to count widget views. With log retention not running (see §1), this table grows monotonically. Also, every insert is one network round trip from the customer's browser.

### Fix

Two complementary changes:

1. **Schedule the trim** (covered in §1 fix).
2. **Batch the inserts**: buffer events client-side in a `ref` array, flush every 10 seconds OR on `beforeunload` / `pagehide`. Cuts insert volume ~10× without losing data. (Optional — only worth it if widget traffic is high.)

---

## 7. LOW — Other quick wins

### `src/pages/client/Orders.tsx:161-165`

```ts
.from("orders").select("*").eq("client_id", cId)
  .order("created_at", { ascending: false });
```

No `.limit()`. For clients with 5 000+ orders, this fetches everything every time. Add `.limit(200)` and a "Load more" button — list views never need 5 000 rows on screen.

### `src/pages/client/SavedDesigns.tsx:523-528` and `MetalBuyingLeads.tsx:113-125`

Same pattern: `select('*')` without `.limit()`. Same fix.

### Per-CAD-detail-view subscriptions

`AdminCadRequestDetailView.tsx:161` and `CadRequestDetailView.tsx:220` each open a per-request realtime channel. Fine for one open detail view, but if an admin opens many CAD tabs, that's many channels. Low priority — the underlying table IS in the publication and the filter is `id=eq.<X>`, so the cost per channel is small.

### Auto-recharge / wallet inserts

Out of scope for this audit, but the `wallet_transactions` table is intentionally kept forever (financial record). That's correct — don't trim it. Just confirm it has good indexes (it does: `client_id`, `created_at`, `reference_id`).

---

## Suggested implementation order

The fixes are mostly independent, but for fastest ROI:

1. **Day 1 (1 hour):** Apply the cleanup-cron migration (§1) + the index migration (§2). Run the cleanup functions manually once each to clear the historical backlog. **This alone will produce a visible bill drop within 24 h.**
2. **Day 2 (2 hours):** Patch `useCustomerHub.ts` (§3) — narrow columns, add `.limit(500)`, debounce. No logic change, pure efficiency.
3. **Day 3 (1 hour):** Delete the orphan subscriptions (§5). Replace with focus-poll where appropriate.
4. **Week 2 (4 hours):** Refactor `client-dashboard-stats` and `admin-dashboard-stats` to a SQL RPC (§4). This is the largest single recurring saving but biggest change.
5. **Optional:** Batch `analytics_events` inserts (§6).

Nothing here changes product UX, RLS, schema semantics, or business logic. Every change either:
- Fixes a defined-but-not-running cleanup
- Adds an index to make existing queries faster
- Trims columns / adds limits to fetched rows
- Removes dead realtime subscriptions

---

## Verification checklist

After applying §1 and §2:

```sql
-- 1. Cleanup crons are now scheduled
SELECT jobname, schedule, active FROM cron.job
WHERE jobname IN (
  'cleanup_orphan_ai_previews_daily',
  'trim_old_log_tables_monthly',
  'archive_old_ai_usage_logs_monthly'
);
-- expected: 3 rows, all active=true

-- 2. Hot-path indexes exist
SELECT indexname FROM pg_indexes
WHERE schemaname = 'public'
  AND indexname LIKE '%_client_created'
ORDER BY indexname;
-- expected: ~12 rows

-- 3. Realtime publication is still trim
SELECT tablename FROM pg_publication_tables
WHERE pubname = 'supabase_realtime' ORDER BY tablename;
-- expected: 6 rows (admin_notifications, cad_request_messages, cad_requests,
--                   client_notifications, clients, orders)

-- 4. Quick before/after on a known busy table
EXPLAIN ANALYZE
  SELECT * FROM public.saved_designs
  WHERE client_id = '<your-busiest-client-uuid>'
  ORDER BY created_at DESC LIMIT 100;
-- expected: Index Scan using idx_saved_designs_client_created (cost should drop ~10×)
```

After applying §3:

- Open Customer Hub tab. Open browser DevTools → Network → filter `saved_designs`. Watch the response size. Should drop from MBs to KBs.

After applying §5:

```sql
-- Confirm no broken subscription is hitting the publication on dropped tables.
-- (Run this while the relevant page is open in another tab; result should be empty.)
SELECT * FROM pg_publication_tables
WHERE pubname = 'supabase_realtime'
  AND tablename IN ('saved_designs','metal_buying_leads','diamond_form_leads',
                    'grill_form_leads','custom_enquiry_leads','design_requests',
                    'appointment_bookings','ai_chat_sessions');
-- expected: empty
```

---

## Files I read while doing this analysis

- `.lovable/memory/infrastructure/cost-optimization-strategy.md`
- `14tablesreview/realtime-tables-breakdown.md`
- `src/hooks/useClientDashboard.ts`
- `src/hooks/useCustomerHub.ts`
- `src/hooks/useNotifications.ts`
- `src/hooks/useAdminNotifications.ts`
- `src/pages/client/SavedDesigns.tsx`
- `src/pages/client/Orders.tsx`
- `src/pages/client/MetalBuyingLeads.tsx`
- `src/pages/client/DiamondFormsLeads.tsx`
- `src/pages/client/AIConfigurator.tsx`
- `src/pages/admin/Dashboard.tsx`
- `src/components/cad-requests/AdminCadRequestDetailView.tsx`
- `src/lib/tracking-utils.ts`
- `supabase/functions/client-dashboard-stats/index.ts`
- `supabase/functions/admin-dashboard-stats/index.ts`
- `supabase/functions/_shared/ai-router.ts`
- `supabase/functions/generate-ring-preview/index.ts`
- `supabase/migrations/20260422182534_*.sql` (the cost-optimization migration)
- `supabase/migrations/20260319121415_*.sql` (ai_usage archival)
- All 100+ migrations grepped for `CREATE INDEX` and `cron.schedule`

End of analysis.
