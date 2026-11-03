# analytics_events — Issues & Fixes (Ready to Implement)

**Migration file:** `supabase/migrations/20251117202023_c4c1a186-d40f-4647-b0ad-d00d8d8f3dd8.sql`
**Table defined at:** Lines 132–140
**RLS policies at:** Lines 223–226
**Indexes at:** Lines 238–239

> **Status:** NOT yet implemented. Review and implement in next session.

---

## ISSUE A — CRITICAL: INSERT Policy Has No client_id Ownership Check

**Line 226 (current broken code):**
```sql
CREATE POLICY "System can create analytics events" ON public.analytics_events
  FOR INSERT WITH CHECK (true);
```

**Problem:** Any authenticated user can insert an analytics event with any `client_id` — including another client's ID or NULL. No ownership validation on insert. Client A can fabricate events for Client B.

**Fix:**
```sql
DROP POLICY "System can create analytics events" ON public.analytics_events;

CREATE POLICY "Clients can create own analytics events"
  ON public.analytics_events FOR INSERT
  WITH CHECK (
    client_id = public.get_user_client_id(auth.uid())
    OR client_id IS NULL
  );
```

---

## ISSUE B — HIGH: client_id is NULLABLE But RLS Silently Drops NULL Rows

**Line 134 (current):**
```sql
client_id UUID REFERENCES public.clients(id),   -- no NOT NULL
```

**Line 225 (current RLS):**
```sql
CREATE POLICY "Clients can view their own analytics"
  ON public.analytics_events FOR SELECT
  USING (client_id = public.get_user_client_id(auth.uid()));
```

**Problem:** `NULL = anything` in SQL returns `NULL` (not TRUE). Events inserted with `client_id IS NULL` pass the INSERT policy but are permanently invisible to clients. Dashboard undercounts real usage.

**Fix (if client_id should always be set):**
```sql
ALTER TABLE public.analytics_events
  ALTER COLUMN client_id SET NOT NULL;
```

**Fix (if anonymous events are intentional):**
```sql
DROP POLICY "Clients can view their own analytics" ON public.analytics_events;

CREATE POLICY "Clients can view their own analytics"
  ON public.analytics_events FOR SELECT
  USING (
    client_id = public.get_user_client_id(auth.uid())
    OR (
      client_id IS NULL AND product_id IN (
        SELECT product_id FROM public.client_products
        WHERE client_id = public.get_user_client_id(auth.uid())
      )
    )
  );
```

---

## ISSUE C — HIGH: Missing Composite Indexes for Dashboard Queries

**Lines 238–239 (current):**
```sql
CREATE INDEX idx_analytics_events_client_id ON public.analytics_events(client_id);
CREATE INDEX idx_analytics_events_created_at ON public.analytics_events(created_at);
```

**Problem:** Two separate single-column indexes. Real dashboard queries filter by `client_id` + `created_at` + `event_type` together. PostgreSQL cannot combine two B-tree indexes efficiently — picks one and re-filters the rest from heap. Slow on large tables.

**Fix:**
```sql
DROP INDEX IF EXISTS idx_analytics_events_client_id;
DROP INDEX IF EXISTS idx_analytics_events_created_at;

CREATE INDEX idx_analytics_events_client_time
  ON public.analytics_events(client_id, created_at DESC);

CREATE INDEX idx_analytics_events_client_type_time
  ON public.analytics_events(client_id, event_type, created_at DESC);

CREATE INDEX idx_analytics_events_event_type
  ON public.analytics_events(event_type, created_at DESC);
```

---

## ISSUE D — HIGH: No Index on product_id or variation_id FK Columns

**Lines 136–137 (current):**
```sql
product_id UUID REFERENCES public.products(id),
variation_id UUID REFERENCES public.product_variations(id),
```

**Problem:** FK columns with no indexes. JOINs from analytics_events → products or product_variations do full sequential scans. Product-level analytics ("which product got most views?") will be slow. ON DELETE cascade checks also do full table scans.

**Fix:**
```sql
CREATE INDEX idx_analytics_events_product_id
  ON public.analytics_events(product_id);

CREATE INDEX idx_analytics_events_variation_id
  ON public.analytics_events(variation_id);
```

---

## ISSUE E — MEDIUM: event_type Uses TEXT + CHECK Instead of ENUM

**Line 135 (current):**
```sql
event_type TEXT NOT NULL CHECK (event_type IN ('configurator_load', 'add_to_cart', 'purchase', 'page_view')),
```

**Problem:** Stores full string per row (up to 18 bytes) vs ENUM (4 bytes). For a high-volume analytics table this adds up. Adding a new event type requires `ALTER TABLE ... DROP CONSTRAINT ... ADD CONSTRAINT` which locks the table. The file already uses ENUM for `app_role` — same pattern should apply here.

**Fix:**
```sql
CREATE TYPE public.analytics_event_type AS ENUM (
  'configurator_load', 'add_to_cart', 'purchase', 'page_view'
);

ALTER TABLE public.analytics_events
  ALTER COLUMN event_type TYPE public.analytics_event_type
  USING event_type::public.analytics_event_type;
```

---

## ISSUE F — MEDIUM: No GIN Index on metadata JSONB Column

**Line 138 (current):**
```sql
metadata JSONB DEFAULT '{}',
```

**Problem:** Any query filtering inside this JSONB (e.g., `WHERE metadata @> '{"metal":"white_gold"}'`) does a full sequential scan. No GIN index defined.

**Fix:**
```sql
CREATE INDEX idx_analytics_events_metadata_gin
  ON public.analytics_events USING GIN(metadata);
```

---

## ISSUE G — MEDIUM: No Deduplication / Idempotency Key

**Problem:** No UNIQUE constraint and no idempotency key. Page refreshes and network retries re-insert duplicate events. Analytics counts get inflated. No way to deduplicate after the fact.

**Fix:**
```sql
ALTER TABLE public.analytics_events
  ADD COLUMN idempotency_key TEXT;

CREATE UNIQUE INDEX idx_analytics_events_idempotency
  ON public.analytics_events(idempotency_key)
  WHERE idempotency_key IS NOT NULL;
```

Frontend must generate: `idempotency_key = hash(client_id + event_type + product_id + session_id + minute_bucket)`

---

## ISSUE H — LOW: user_roles Missing Composite Index Used by has_role()

**has_role() function (lines 155–168) queries:**
```sql
SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
```

**Current index (line 237):**
```sql
CREATE INDEX idx_user_roles_user_id ON public.user_roles(user_id);
```

**Problem:** Index is only on `user_id`. The function filters on `(user_id, role)` together — without composite, PostgreSQL fetches all roles for the user then filters by role in memory.

**Fix:**
```sql
DROP INDEX IF EXISTS idx_user_roles_user_id;

CREATE UNIQUE INDEX idx_user_roles_user_role
  ON public.user_roles(user_id, role);
```

---

## Implementation Order

1. **Issue A** — Fix INSERT policy (security issue, do this first)
2. **Issue B** — Decide: enforce NOT NULL on client_id OR fix SELECT policy for NULL rows
3. **Issue D** — Add product_id and variation_id indexes (safe, no downtime)
4. **Issue C** — Replace separate indexes with composite indexes
5. **Issue H** — Replace user_roles index with composite
6. **Issue F** — Add GIN index on metadata
7. **Issue G** — Add idempotency_key column
8. **Issue E** — Migrate event_type to ENUM (do last, requires type migration)

## Implementation Notes

- All fixes must be written as a **new migration file** in `supabase/migrations/`
- Do NOT edit the original migration `20251117202023_...sql`
- For Issue E (ENUM migration), test on a dev/staging DB first — type change on existing rows
- For Issue C (drop + recreate indexes), this is safe but will briefly increase query time during index rebuild on large tables — run during low-traffic hours
