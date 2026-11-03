# DB Tables Analysis — Query Issues, Redundancies & Optimizations

> **Status:** Review only — Do NOT implement until reviewed and approved.
> **Scope:** All tables listed in `dbtablescheck/table_migrations_reference.md`
> **Goal:** Identify duplicate queries, missing indexes, non-optimized queries, and redundant triggers.

---

## TABLE OF CONTENTS

1. [CRITICAL — RLS Policies with Redundant Subqueries (50+ occurrences)](#issue-1)
2. [CRITICAL — RLS Policies Not Using Cached Helper Function](#issue-2)
3. [HIGH — Nested Subqueries in RLS Without Required Indexes](#issue-3)
4. [HIGH — Duplicate Trigger Logic (5 Tables, Same Function)](#issue-4)
5. [HIGH — Token Cleanup Function Defined But Never Called](#issue-5)
6. [HIGH — CROSS JOIN LATERAL Repeated 5 Times for Same Subquery](#issue-6)
7. [HIGH — Table-Level Lock During Full Backup Operation](#issue-7)
8. [HIGH — Schema Inconsistency: client_products Defined Twice](#issue-8)
9. [MEDIUM — Missing Composite Indexes on Activity/Audit Log Tables](#issue-9)
10. [MEDIUM — Missing Composite Index on ai_response_cache](#issue-10)
11. [MEDIUM — Missing Partial Indexes for "Unresolved" Records](#issue-11)
12. [MEDIUM — Missing GIN Indexes on JSONB Columns](#issue-12)
13. [MEDIUM — Missing Composite Index on client_notifications](#issue-13)
14. [LOW — Redundant Type Casts in RLS Policies](#issue-14)
15. [LOW — Unused Index on Non-Existent Table](#issue-15)
16. [Summary Table](#summary-table)
17. [Prioritized Remediation Roadmap](#roadmap)

---

## ISSUE 1 — CRITICAL: RLS Policies with Redundant Inline Subqueries {#issue-1}

**Affects:** Almost all tables  
**Files:** `20251117202023_...sql`, `20251117225753_...sql`, `20260218063650_...sql`, `20260114081337_...sql`, `20251117210236_...sql` (and more)

### What the issue is

The same subquery `SELECT id FROM public.clients WHERE user_id = auth.uid()` is written inline inside **50+ different RLS policies** across all migrations. Every time a SELECT/INSERT/UPDATE runs on a protected table, PostgreSQL re-executes this subquery from scratch.

### Problematic SQL (repeated pattern across all files)

```sql
CREATE POLICY "Clients can view their own records" ON public.some_table FOR SELECT
USING (
  client_id IN (
    SELECT id FROM public.clients WHERE user_id = auth.uid()
  )
);
```

### What problem this causes at runtime

- For every single query hitting a row-level security protected table, PostgreSQL executes `SELECT id FROM clients WHERE user_id = auth.uid()` **per row**.
- If a query returns 100 rows, this subquery runs 100 times.
- With Realtime subscriptions enabled, this fires on EVERY change notification.
- Combined across 50+ policies on different tables, this is the single biggest performance drain in the entire database.
- This is a classic **N+1 query anti-pattern** at the database policy level.

### Fixed SQL

```sql
-- Step 1: Ensure this helper function exists (it is defined in first migration but NOT used)
CREATE OR REPLACE FUNCTION public.get_user_client_id(_user_id UUID DEFAULT auth.uid())
RETURNS UUID
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.clients WHERE user_id = _user_id LIMIT 1;
$$;

-- Step 2: Replace ALL inline subquery policies with function call
-- BEFORE (bad):
CREATE POLICY "..." ON public.some_table FOR SELECT
USING (client_id IN (SELECT id FROM public.clients WHERE user_id = auth.uid()));

-- AFTER (good):
CREATE POLICY "..." ON public.some_table FOR SELECT
USING (client_id = public.get_user_client_id());
```

### Why this fixes it

PostgreSQL caches results of `STABLE` functions within a single query. Using `get_user_client_id()` means the `clients` lookup runs **once per query** instead of once per row. This can reduce query time by 10x–100x for tables with many rows.

---

## ISSUE 2 — CRITICAL: RLS Policies Not Using the Existing get_user_client_id() Function {#issue-2}

**Affects:** `ai_chat_sessions`, `ai_chat_messages`, `client_products`  
**File:** `20251117225753_ae8e6d6a-bbb4-4cc0-be74-1f1d8e684628.sql`

### What the issue is

The function `public.get_user_client_id()` was already defined in the first migration (`20251117202023_...sql`) for exactly this purpose, but the second migration (`20251117225753_...sql`) ignores it and rewrites the same inline subquery again.

### Problematic SQL

```sql
-- From 20251117225753_...sql
CREATE POLICY "Clients can view their own sessions"
  ON ai_chat_sessions FOR SELECT
  USING (
    client_id IN (
      SELECT id FROM clients WHERE user_id = auth.uid()   -- same lookup, again
    )
  );
```

### What problem this causes

Same N+1 issue as Issue 1. The fix was available but not used. Every new migration that doesn't use the helper function adds more redundant lookup paths.

### Fixed SQL

```sql
CREATE POLICY "Clients can view their own sessions"
  ON ai_chat_sessions FOR SELECT
  USING (client_id = public.get_user_client_id());

CREATE POLICY "Clients can manage their own messages"
  ON ai_chat_messages FOR SELECT
  USING (
    session_id IN (
      SELECT id FROM ai_chat_sessions
      WHERE client_id = public.get_user_client_id()
    )
  );
```

### Why this fixes it

Consistent use of the cached helper eliminates redundant table scans.

---

## ISSUE 3 — HIGH: Nested Subqueries in RLS Without Required Indexes {#issue-3}

**Affects:** `ai_chat_messages`, `client_activity_logs`  
**Files:** `20251117225753_...sql`, `20260114081337_...sql`

### What the issue is

RLS policies use nested subqueries (2–3 levels deep) but the intermediate tables they query do not have the required indexes to support those lookups efficiently.

### Problematic SQL

```sql
-- ai_chat_messages policy (20251117225753_...sql)
CREATE POLICY "Clients can view messages for their sessions"
  ON ai_chat_messages FOR SELECT
  USING (
    session_id IN (
      SELECT id FROM ai_chat_sessions
      WHERE client_id IN (
        SELECT id FROM clients WHERE user_id = auth.uid()
      )
    )
  );

-- client_activity_logs policy (20260114081337_...sql)
CREATE POLICY "Staff members can view their client activity logs"
  ON public.client_activity_logs FOR SELECT
  USING (
    client_id IN (SELECT client_id FROM public.staff_members WHERE user_id = auth.uid())
  );
```

### Missing indexes

- `ai_chat_sessions(client_id)` — no index created in migration
- `ai_chat_messages(session_id)` — no index created in migration
- `staff_members(user_id, client_id)` — no composite index

### What problem this causes

Without indexes, each subquery does a **sequential scan** of the entire table. For `ai_chat_messages` with thousands of messages, the inner subquery scans all sessions, which scans all clients. This scales O(n×m×k) instead of O(log n).

### Fixed SQL

```sql
-- Add missing indexes (in migrations or a new migration)
CREATE INDEX IF NOT EXISTS idx_ai_chat_sessions_client_id
  ON public.ai_chat_sessions(client_id);

CREATE INDEX IF NOT EXISTS idx_ai_chat_messages_session_id
  ON public.ai_chat_messages(session_id);

CREATE INDEX IF NOT EXISTS idx_staff_members_user_client
  ON public.staff_members(user_id, client_id);

-- Rewrite nested IN as EXISTS (better execution plan)
CREATE POLICY "Clients can view messages for their sessions"
  ON ai_chat_messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM ai_chat_sessions acs
      WHERE acs.id = session_id
        AND acs.client_id = public.get_user_client_id()
    )
  );
```

### Why this fixes it

`EXISTS` stops after the first matching row (short-circuit). Combined with proper indexes, this reduces the nested scan from O(n×m) to O(log n) per row.

---

## ISSUE 4 — HIGH: Duplicate Trigger Logic Across 5 Tables {#issue-4}

**Affects:** `saved_designs`, `design_requests`, `diamond_form_leads`, `grill_form_leads`, `custom_enquiry_leads`  
**File:** `20260314142503_d83a7303-01d3-4a72-9e4b-d8ca2b1ee184.sql`

### What the issue is

Five separate triggers on five different tables all call the **exact same function** `public.notify_new_lead()`. This creates identical trigger overhead, identical write paths, and identical lock contention on `client_notifications` for each table — multiplied by 5.

### Problematic SQL

```sql
CREATE TRIGGER trg_notify_saved_design
  AFTER INSERT ON public.saved_designs
  FOR EACH ROW EXECUTE FUNCTION public.notify_new_lead();

CREATE TRIGGER trg_notify_design_request
  AFTER INSERT ON public.design_requests
  FOR EACH ROW EXECUTE FUNCTION public.notify_new_lead();

CREATE TRIGGER trg_notify_diamond_lead
  AFTER INSERT ON public.diamond_form_leads
  FOR EACH ROW EXECUTE FUNCTION public.notify_new_lead();

CREATE TRIGGER trg_notify_grill_lead
  AFTER INSERT ON public.grill_form_leads
  FOR EACH ROW EXECUTE FUNCTION public.notify_new_lead();

CREATE TRIGGER trg_notify_custom_enquiry
  AFTER INSERT ON public.custom_enquiry_leads
  FOR EACH ROW EXECUTE FUNCTION public.notify_new_lead();
```

### What problem this causes

- Every INSERT on any of the 5 tables immediately triggers a **synchronous write** to `client_notifications`
- If multiple leads are bulk-inserted (e.g., import), this creates a **sequential lock queue** on `client_notifications`
- Five different tables creating the same notification type creates maintenance confusion
- If `notify_new_lead()` function logic needs to change, it affects all 5 triggers invisibly

### Fixed SQL

```sql
-- Update the shared function to include table name in metadata
CREATE OR REPLACE FUNCTION public.notify_new_lead()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.client_notifications (client_id, category, title, message, metadata)
  VALUES (
    NEW.client_id,
    'lead',
    'New Lead Received',
    COALESCE(
      'New lead from ' || COALESCE(NEW.customer_name, NEW.customer_email, 'a customer'),
      'New lead received'
    ),
    jsonb_build_object(
      'lead_id', NEW.id,
      'source_table', TG_TABLE_NAME,
      'lead_type', TG_TABLE_NAME
    )
  );
  RETURN NEW;
END;
$$;
-- NOTE: Triggers themselves can remain; the fix is ensuring the shared function
-- includes TG_TABLE_NAME in metadata for traceability
```

### Why this fixes it

The function already uses `TG_TABLE_NAME` so the fix is minimal — just ensuring metadata is populated for all 5 trigger sources. For bulk imports, consider changing `FOR EACH ROW` to `FOR EACH STATEMENT` with a batched notification approach.

---

## ISSUE 5 — HIGH: Token Cleanup Function Defined But Never Scheduled {#issue-5}

**Affects:** `password_reset_tokens`, `email_verification_tokens`  
**File:** `20260119160757_c4f99339-4730-4812-915a-ee3a635ea345.sql`

### What the issue is

A cleanup function is defined to delete expired tokens, but no trigger, cron job, or scheduled task calls it. Expired tokens accumulate in the table forever.

### Problematic SQL

```sql
-- Function exists but is never called
CREATE OR REPLACE FUNCTION public.cleanup_expired_tokens()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.password_reset_tokens WHERE expires_at < NOW();
  DELETE FROM public.email_verification_tokens WHERE expires_at < NOW();
END;
$$;
-- No cron.schedule() below this. No trigger. Nothing.
```

### What problem this causes

- `password_reset_tokens` table grows indefinitely — every reset attempt (including bots/spam) adds a row
- Index scans on this table slow down over time as rows accumulate
- **Security risk**: expired tokens remain queryable/visible in the database indefinitely
- Any query that checks token validity must scan a larger and larger table

### Fixed SQL

```sql
-- Option A: pg_cron (recommended for Supabase)
SELECT cron.schedule(
  'cleanup-expired-tokens',
  '0 2 * * *',   -- daily at 2:00 AM
  'SELECT public.cleanup_expired_tokens();'
);

-- Option B: Trigger-based auto cleanup on insert (lightweight)
CREATE OR REPLACE FUNCTION public.auto_cleanup_tokens_trigger()
RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  -- Only clean if table has grown large (avoids overhead on every insert)
  IF (SELECT COUNT(*) FROM public.password_reset_tokens WHERE expires_at < NOW()) > 500 THEN
    DELETE FROM public.password_reset_tokens WHERE expires_at < NOW();
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_cleanup_expired_tokens
  AFTER INSERT ON public.password_reset_tokens
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.auto_cleanup_tokens_trigger();
```

### Why this fixes it

Regular cleanup keeps token tables small, which keeps index scans fast and prevents indefinite data retention. Option A (pg_cron) is better for Supabase as it runs off-peak without adding trigger overhead to the insert path.

---

## ISSUE 6 — HIGH: CROSS JOIN LATERAL Repeated 5 Times for Same Subquery {#issue-6}

**Affects:** `saved_designs` (seed data inserts)  
**File:** `20251117225753_ae8e6d6a-bbb4-4cc0-be74-1f1d8e684628.sql`

### What the issue is

Five separate `INSERT ... SELECT ... CROSS JOIN LATERAL (SELECT id FROM products ...)` statements are written one after another. Each one executes the same LATERAL subquery independently, even though all 5 inserts share the same product lookup.

### Problematic SQL

```sql
-- Insert 1
INSERT INTO saved_designs (client_id, product_id, ...)
SELECT c.id, p.id, 'Sarah Johnson', 'sarah.j@example.com', ...
FROM clients c
CROSS JOIN LATERAL (SELECT id FROM products WHERE category = 'ring' LIMIT 1) p
WHERE NOT EXISTS (SELECT 1 FROM saved_designs WHERE customer_email = 'sarah.j@example.com')
LIMIT 1;

-- Insert 2 (identical product subquery repeated)
INSERT INTO saved_designs (client_id, product_id, ...)
SELECT c.id, p.id, 'Michael Chen', 'michael.chen@example.com', ...
FROM clients c
CROSS JOIN LATERAL (SELECT id FROM products WHERE category = 'ring' LIMIT 1) p
WHERE NOT EXISTS (SELECT 1 FROM saved_designs WHERE customer_email = 'michael.chen@example.com')
LIMIT 1;

-- ... 3 more times (same pattern)
```

### What problem this causes

- The product lookup `SELECT id FROM products WHERE category = 'ring' LIMIT 1` executes **5 separate times**
- Each `WHERE NOT EXISTS (...)` scans `saved_designs` without an index on `customer_email`
- Migration takes 5x longer than necessary
- Harder to maintain: changing the product category requires editing 5 places

### Fixed SQL

```sql
-- Add index first (if not exists)
CREATE INDEX IF NOT EXISTS idx_saved_designs_customer_email
  ON public.saved_designs(customer_email);

-- Single batched INSERT
INSERT INTO saved_designs (client_id, product_id, customer_name, customer_email, customer_phone, configuration, notes, follow_up_status)
SELECT
  c.id,
  p.id,
  customer_data.name,
  customer_data.email,
  customer_data.phone,
  customer_data.config,
  customer_data.notes,
  customer_data.status
FROM clients c
CROSS JOIN (
  SELECT id FROM products WHERE category = 'ring' LIMIT 1
) p
CROSS JOIN (
  VALUES
    ('Sarah Johnson',    'sarah.j@example.com',         '+1-555-0123', '{"style":"Halo","metal":"white_gold","carat":1.2}'::jsonb,        'Interested in custom sizing', 'new'),
    ('Michael Chen',    'michael.chen@example.com',     '+1-555-0456', '{"style":"Solitaire","metal":"platinum","carat":1.5}'::jsonb,     'Asked about lab diamonds',    'contacted'),
    ('Emma Rodriguez',  'emma.r@example.com',           '+1-555-0789', '{"style":"Three-Stone","metal":"yellow_gold","carat":0.8}'::jsonb,'Wants appointment',           'quote_sent'),
    ('James Wilson',    'james.w@example.com',          NULL,          '{"style":"Pave-Rail","metal":"rose_gold","carat":1.0}'::jsonb,    'Budget conscious',            'contacted'),
    ('Olivia Martinez', 'olivia.m@example.com',         '+1-555-0321', '{"style":"Vintage","metal":"white_gold","carat":1.3}'::jsonb,     'Anniversary gift',            'new')
) AS customer_data(name, email, phone, config, notes, status)
WHERE NOT EXISTS (
  SELECT 1 FROM saved_designs WHERE customer_email = customer_data.email
)
LIMIT 5;
```

### Why this fixes it

One query replaces 5. Product lookup runs once. `customer_email` existence check uses an index. Single transaction.

---

## ISSUE 7 — HIGH: Table-Level Lock During Full Backup Operation {#issue-7}

**Affects:** `my_master_db_data_backup`  
**File:** `20260402071612_4607cfe2-d8d2-4a81-9dbc-2c5b779e02f0.sql`

### What the issue is

Using `CREATE TABLE AS SELECT * FROM source_table` acquires a table-level lock on the source table for the entire duration of the copy. If the source table is large, this blocks ALL reads and writes during migration.

### Problematic SQL

```sql
CREATE TABLE public.my_master_db_data_backup AS
SELECT * FROM public.my_master_db_data;

ALTER TABLE public.my_master_db_data_backup
  ADD CONSTRAINT my_master_db_data_backup_pkey PRIMARY KEY (id);
```

### What problem this causes

- `SELECT *` copies every column, including large JSONB or text columns that may not be needed in the backup
- Table lock on `my_master_db_data` blocks all concurrent queries for the entire copy duration
- PRIMARY KEY constraint is added AFTER the data insert — this is slower than defining it upfront
- No `created_at` filter means the backup copies all historical records, not just recent/relevant ones

### Fixed SQL

```sql
-- Only back up recent records, specify columns, define PK upfront
CREATE TABLE IF NOT EXISTS public.my_master_db_data_backup (
  id UUID PRIMARY KEY,
  -- list only the columns actually needed for backup purposes
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
  -- add other needed columns explicitly
);

-- Insert with filter to avoid locking entire history
INSERT INTO public.my_master_db_data_backup
SELECT id, created_at, updated_at   -- specific columns only
FROM public.my_master_db_data
WHERE created_at > now() - interval '90 days';

-- Index for incremental future backups
CREATE INDEX IF NOT EXISTS idx_my_master_backup_created_at
  ON public.my_master_db_data_backup(created_at DESC);
```

### Why this fixes it

Defining the table schema separately from data insertion avoids the implicit full-table lock. Filtering by `created_at` limits the data volume. Defining the PK before insert is faster than altering after.

---

## ISSUE 8 — HIGH: client_products Table Defined Twice With Conflicting Defaults {#issue-8}

**Affects:** `client_products`  
**Files:** `20251117202023_...sql` (lines 79–88) and `20251117225753_...sql` (lines 2–11)

### What the issue is

The `client_products` table is defined in two different migration files with **different column types and different default values**. The second definition uses `IF NOT EXISTS` so it silently does nothing if the table already exists — but the schema mismatch is a hidden bug.

### Problematic SQL

```sql
-- FIRST DEFINITION (20251117202023_...sql)
CREATE TABLE public.client_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE NOT NULL,
  product_id UUID REFERENCES public.products(id) ON DELETE CASCADE NOT NULL,
  is_enabled BOOLEAN DEFAULT false,         -- <-- DEFAULT false
  markup_percentage DECIMAL(5,2) DEFAULT 100,
  custom_retail_price DECIMAL(10,2),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(client_id, product_id)
);

-- SECOND DEFINITION (20251117225753_...sql)
CREATE TABLE IF NOT EXISTS client_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE NOT NULL,
  product_id UUID REFERENCES products(id) ON DELETE CASCADE NOT NULL,
  is_enabled BOOLEAN DEFAULT true,          -- <-- DEFAULT true (CONFLICT!)
  markup_percentage NUMERIC DEFAULT 100,    -- <-- NUMERIC vs DECIMAL(5,2) (CONFLICT!)
  custom_retail_price NUMERIC,              -- <-- NUMERIC vs DECIMAL(10,2) (CONFLICT!)
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(client_id, product_id)
);
```

### What problem this causes

- `is_enabled DEFAULT true` vs `DEFAULT false`: New client products will either be enabled or disabled depending on which migration actually ran first — this affects what clients see
- `NUMERIC` vs `DECIMAL(5,2)`: Prices stored without precision constraint could store values like `99999.9999` breaking UI display logic
- `IF NOT EXISTS` hides this conflict silently in production — no migration error raised

### Fixed SQL

```sql
-- Remove the duplicate CREATE TABLE from 20251117225753_...sql entirely.
-- If columns need to be added to existing table, use ALTER TABLE instead:

ALTER TABLE public.client_products
  ALTER COLUMN is_enabled SET DEFAULT false,  -- enforce correct default
  ALTER COLUMN markup_percentage TYPE DECIMAL(5,2) USING markup_percentage::DECIMAL(5,2),
  ALTER COLUMN custom_retail_price TYPE DECIMAL(10,2) USING custom_retail_price::DECIMAL(10,2);
```

### Why this fixes it

Single source of truth for the table schema. No more silent conflict between migrations. `ALTER TABLE` is the correct pattern for evolving an existing table.

---

## ISSUE 9 — MEDIUM: Missing Composite Indexes on Audit/Activity Log Tables {#issue-9}

**Affects:** `admin_activity_logs`, `audit_logs`  
**Files:** `20260114172109_...sql`, `20251120014626_...sql`

### What the issue is

Both tables have separate single-column indexes on `user_id`, `created_at`, and `action_category/action_type`. But the actual queries (admin dashboard, audit trails) always filter on **multiple columns together**.

### Problematic SQL (index definitions)

```sql
-- admin_activity_logs (20260114172109_...sql)
CREATE INDEX idx_admin_activity_logs_admin_user_id ON public.admin_activity_logs(admin_user_id);
CREATE INDEX idx_admin_activity_logs_created_at ON public.admin_activity_logs(created_at DESC);
CREATE INDEX idx_admin_activity_logs_action_category ON public.admin_activity_logs(action_category);

-- audit_logs (20251120014626_...sql)
CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON public.audit_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON public.audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action_type ON public.audit_logs(action_type);
```

### Actual query pattern that needs an index

```sql
-- Admin dashboard: view my activity by category sorted by time
SELECT * FROM admin_activity_logs
WHERE admin_user_id = $1 AND action_category = $2
ORDER BY created_at DESC LIMIT 20;

-- Audit trail: user activity in last 7 days
SELECT * FROM audit_logs
WHERE user_id = $1 AND timestamp > now() - interval '7 days'
ORDER BY timestamp DESC;
```

### What problem this causes

Without composite indexes, PostgreSQL picks one single-column index and then performs a **filter step** over all matching rows from that index, re-sorting them. For tables with millions of rows, this adds significant overhead.

### Fixed SQL

```sql
-- admin_activity_logs
CREATE INDEX idx_admin_activity_logs_user_category_time
  ON public.admin_activity_logs(admin_user_id, action_category, created_at DESC);

-- audit_logs
CREATE INDEX idx_audit_logs_user_time
  ON public.audit_logs(user_id, timestamp DESC);
```

### Why this fixes it

A composite index matches the query's exact filter pattern, allowing PostgreSQL to satisfy `WHERE` and `ORDER BY` from a single index scan — no heap fetch needed.

---

## ISSUE 10 — MEDIUM: Missing Composite Index on ai_response_cache {#issue-10}

**Affects:** `ai_response_cache`  
**File:** `20260318184616_9a718b20-4e9a-4d40-a93b-fe7ba301f5b9.sql`

### What the issue is

The table has a unique index on `cache_key` alone and a separate index on `expires_at`. But cache lookups in application code typically include `client_id` as well (to scope cache results per client).

### Current Indexes

```sql
CREATE UNIQUE INDEX idx_ai_response_cache_key ON public.ai_response_cache (cache_key);
CREATE INDEX idx_ai_response_cache_expiry ON public.ai_response_cache (expires_at);
```

### Actual query pattern

```sql
-- Typical cache hit check
SELECT response_data FROM ai_response_cache
WHERE client_id = $1 AND cache_key = $2 AND expires_at > now();
```

### What problem this causes

The query uses `client_id` as the first filter but there is no index starting with `client_id`. PostgreSQL falls back to a sequential scan or inefficient index merge.

### Fixed SQL

```sql
-- Composite index for cache hit lookup pattern
CREATE INDEX idx_ai_response_cache_client_key
  ON public.ai_response_cache(client_id, cache_key)
  WHERE expires_at > now();  -- partial index: only non-expired entries

-- Existing unique index on cache_key alone can be kept for global dedup
```

### Why this fixes it

The partial composite index covers the exact query pattern. The `WHERE expires_at > now()` partial clause means the index is smaller (only live cache entries) and does not require a separate expiry filter step.

---

## ISSUE 11 — MEDIUM: Missing Partial Indexes for "Unresolved" / "Active" Records {#issue-11}

**Affects:** `system_errors`, `system_error_alerts`, `password_reset_tokens`  
**Files:** `20260121095811_...sql`, `20260119160757_...sql`

### What the issue is

Tables with `resolved`/`used_at` boolean/nullable columns have no partial indexes. Dashboard queries typically only fetch **unresolved** or **active** records, but the index scans the entire table including already-resolved records.

### Problematic SQL (missing indexes)

```sql
-- system_errors table in 20260121095811_...sql
-- Only has: CREATE INDEX idx_system_errors_timestamp ON public.system_errors(timestamp DESC);
-- Missing: partial index on unresolved errors

-- password_reset_tokens in 20260119160757_...sql
-- Only has: CREATE INDEX idx_password_reset_tokens_user ON public.password_reset_tokens(user_id);
-- Missing: partial index on active (unused, unexpired) tokens
```

### What problem this causes

Every query for unresolved system errors scans ALL system errors (including resolved historical ones). As the table grows, dashboard queries get progressively slower even though the "live" dataset remains small.

### Fixed SQL

```sql
-- Unresolved system errors (small active set)
CREATE INDEX idx_system_errors_unresolved
  ON public.system_errors(severity, timestamp DESC)
  WHERE resolved = false;

-- Active password reset tokens only
CREATE INDEX idx_password_reset_tokens_active
  ON public.password_reset_tokens(user_id, expires_at)
  WHERE used_at IS NULL AND expires_at > now();
```

### Why this fixes it

Partial indexes only include rows matching the WHERE clause. The index is smaller (fewer rows = smaller B-tree), lookup is faster, and it perfectly matches the query filter.

---

## ISSUE 12 — MEDIUM: Missing GIN Indexes on JSONB Columns {#issue-12}

**Affects:** `clients` (branding_config), `ai_response_cache` (response_data), `system_errors` (metadata)  
**Files:** `20251117202023_...sql`, `20260318184616_...sql`, `20260121095811_...sql`

### What the issue is

Several tables use `JSONB` columns for configuration and metadata, but no GIN (Generalized Inverted Index) indexes exist on these columns. Any query that searches inside JSONB (e.g., `metadata->>'key' = 'value'`) performs a full sequential scan.

### Problematic columns (no GIN index defined)

```sql
-- In clients table
branding_config JSONB,
-- Used in queries like: WHERE branding_config->>'brand_name' = 'Acme'

-- In ai_response_cache
response_data JSONB,
-- Used in queries like: WHERE response_data @> '{"status": "success"}'

-- In system_errors
metadata JSONB
-- Used in queries like: WHERE metadata->>'error_code' = 'AUTH_FAILED'
```

### What problem this causes

Every JSONB key-value search requires a sequential scan of the entire table. For large tables, this means milliseconds turning into seconds.

### Fixed SQL

```sql
-- GIN index for containment (@>) queries
CREATE INDEX idx_clients_branding_gin
  ON public.clients USING GIN(branding_config);

CREATE INDEX idx_ai_response_cache_data_gin
  ON public.ai_response_cache USING GIN(response_data);

-- For specific key lookups (lighter than full GIN)
CREATE INDEX idx_system_errors_metadata_code
  ON public.system_errors USING BTREE((metadata->>'error_code'));
```

### Why this fixes it

GIN indexes decompose JSONB into key-value pairs, making `@>` and `?` operators use index lookups instead of sequential scans. BTREE on a specific key path is lighter if only one key is frequently queried.

---

## ISSUE 13 — MEDIUM: client_notifications Missing Composite Index for Read-State Queries {#issue-13}

**Affects:** `client_notifications`  
**File:** `20260314142503_d83a7303-01d3-4a72-9e4b-d8ca2b1ee184.sql`

### What the issue is

The table has separate indexes on `client_id` and `is_read`, but the most common dashboard query filters on both together and orders by `created_at`.

### Current Indexes

```sql
CREATE INDEX idx_client_notifications_client_id ON public.client_notifications(client_id);
CREATE INDEX idx_client_notifications_is_read ON public.client_notifications(is_read);
```

### Actual query pattern

```sql
-- Unread notifications for dashboard badge count
SELECT COUNT(*) FROM client_notifications
WHERE client_id = $1 AND is_read = false;

-- Notification feed
SELECT * FROM client_notifications
WHERE client_id = $1
ORDER BY created_at DESC
LIMIT 20;
```

### Fixed SQL

```sql
-- Drop redundant separate indexes
DROP INDEX IF EXISTS idx_client_notifications_client_id;
DROP INDEX IF EXISTS idx_client_notifications_is_read;

-- Single composite covering index
CREATE INDEX idx_client_notifications_client_unread
  ON public.client_notifications(client_id, created_at DESC)
  INCLUDE (is_read, category, title)
  WHERE is_read = false;   -- partial for unread count query

-- Separate index for general feed (all notifications)
CREATE INDEX idx_client_notifications_client_feed
  ON public.client_notifications(client_id, created_at DESC);
```

### Why this fixes it

`INCLUDE` columns make this a **covering index** — the query can be answered entirely from the index without touching the heap. Partial index for `is_read = false` keeps unread badge queries fast as the table grows.

---

## ISSUE 14 — LOW: Redundant Type Casts in RLS Policies {#issue-14}

**Affects:** `ai_training_examples`  
**File:** `20251117220656_0827a0f1-ede1-48d5-abe5-cd6dca4c5840.sql`

### What the issue is

RLS policies cast string literals to `app_role` type unnecessarily. The `has_role()` function already accepts `app_role` type, so the explicit cast is redundant noise.

### Problematic SQL

```sql
USING (has_role(auth.uid(), 'agency_admin'::app_role));
-- Also on lines 19, 27, 40, 45, 51, 63 of this file
```

### Fixed SQL

```sql
USING (public.has_role(auth.uid(), 'agency_admin'));
```

### Why this fixes it

Minor: Reduces SQL noise and ensures consistent style across all policy definitions. No functional change.

---

## ISSUE 15 — LOW: Unused Index on Likely Non-Existent Table {#issue-15}

**Affects:** `usage_snapshots`  
**File:** `20251120182245_a40b289f-a526-44fb-b3c9-3794151c28ba.sql`

### What the issue is

An index is created on `usage_snapshots` but no `CREATE TABLE usage_snapshots` is found in any of the migration files. This index either fails silently or references a table created outside tracked migrations.

### Problematic SQL

```sql
CREATE INDEX IF NOT EXISTS idx_usage_snapshots_client_date
  ON usage_snapshots(client_id, snapshot_date DESC);
```

### What problem this causes

If this migration runs on a fresh database, it will fail. If it ran once on a DB with the table, but the table was later dropped, the index is orphaned. Either way, this is a schema integrity issue.

### Fix

Verify whether `usage_snapshots` table exists in the database. If it does, add a `CREATE TABLE IF NOT EXISTS usage_snapshots (...)` migration before the index. If it does not, remove this index creation.

---

---

## SUMMARY TABLE {#summary-table}

| # | Issue | Table(s) | File | Severity | Runtime Impact |
|---|-------|----------|------|----------|----------------|
| 1 | RLS inline subquery instead of cached function | All protected tables | Multiple | CRITICAL | N+1 per row, 50+ policies |
| 2 | get_user_client_id() not used in later migrations | ai_chat_sessions, ai_chat_messages | 20251117225753 | CRITICAL | Repeated clients scan |
| 3 | Nested RLS subqueries without indexes | ai_chat_messages, client_activity_logs | 20251117225753, 20260114081337 | HIGH | O(n×m) sequential scans |
| 4 | 5 triggers all calling same function, no batching | saved_designs, design_requests, leads | 20260314142503 | HIGH | Lock contention on notifications |
| 5 | Cleanup function never scheduled | password_reset_tokens, email_verification | 20260119160757 | HIGH | Table bloat + security risk |
| 6 | CROSS JOIN LATERAL repeated 5× same subquery | saved_designs (seed) | 20251117225753 | HIGH | 5× migration time, full scan |
| 7 | CREATE TABLE AS SELECT * locks source table | my_master_db_data_backup | 20260402071612 | HIGH | Blocks prod reads during migration |
| 8 | client_products defined twice with conflicts | client_products | 20251117202023, 20251117225753 | HIGH | Schema inconsistency, wrong defaults |
| 9 | Separate indexes instead of composite on log tables | admin_activity_logs, audit_logs | 20260114172109, 20251120014626 | MEDIUM | Slow dashboard queries |
| 10 | Missing composite index on ai_response_cache | ai_response_cache | 20260318184616 | MEDIUM | Slow cache lookups |
| 11 | No partial indexes for unresolved/active records | system_errors, password_reset_tokens | 20260121095811, 20260119160757 | MEDIUM | Growing table scan on small active set |
| 12 | No GIN indexes on JSONB columns | clients, ai_response_cache, system_errors | Multiple | MEDIUM | Sequential scan on JSON queries |
| 13 | Separate indexes instead of composite on notifications | client_notifications | 20260314142503 | MEDIUM | Slow unread count + feed queries |
| 14 | Redundant type casts in RLS policies | ai_training_examples | 20251117220656 | LOW | Code noise only |
| 15 | Index on table not found in any migration | usage_snapshots | 20251120182245 | LOW | Potential schema integrity issue |

---

## PRIORITIZED REMEDIATION ROADMAP {#roadmap}

### Phase 1 — IMMEDIATE (affects every query in production)

1. **Issue 1 + 2**: Update all RLS policies to use `public.get_user_client_id()` instead of inline subqueries. This is a single function call replacement across all migration files.
2. **Issue 3**: Add `CREATE INDEX` statements for `ai_chat_sessions(client_id)`, `ai_chat_messages(session_id)`, and `staff_members(user_id, client_id)`.
3. **Issue 5**: Schedule `cleanup_expired_tokens()` via `cron.schedule()` or trigger.

### Phase 2 — HIGH IMPACT (affects core features)

4. **Issue 8**: Remove duplicate `CREATE TABLE IF NOT EXISTS client_products` from `20251117225753` and replace with `ALTER TABLE` statements.
5. **Issue 4**: Ensure `notify_new_lead()` correctly uses `TG_TABLE_NAME` in metadata for all 5 trigger sources.
6. **Issue 9**: Add composite indexes for `admin_activity_logs` and `audit_logs`.
7. **Issue 13**: Replace separate `client_notifications` indexes with composite covering index.

### Phase 3 — OPTIMIZATION (performance tuning)

8. **Issue 10**: Add composite partial index on `ai_response_cache(client_id, cache_key)`.
9. **Issue 11**: Add partial indexes for unresolved `system_errors` and active `password_reset_tokens`.
10. **Issue 12**: Add GIN indexes on `branding_config`, `response_data` JSONB columns.
11. **Issue 6**: Consolidate 5× repeated seed inserts into single batched INSERT.
12. **Issue 7**: Refactor backup migration to use filtered INSERT instead of `CREATE TABLE AS SELECT *`.

### Phase 4 — HOUSEKEEPING

13. **Issue 14**: Remove redundant `::app_role` type casts.
14. **Issue 15**: Investigate `usage_snapshots` table existence and either add CREATE TABLE or remove orphaned index.

---

> **Note:** All changes should be implemented as new migration files, not by editing existing migrations. Never modify already-run migrations in production.
