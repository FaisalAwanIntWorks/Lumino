# AI Wallet & Revenue & Usage Module — Deep Analysis

**Date:** 2026-05-14
**Scope:** All files inside `/bundle/` (admin AI Wallet page + Revenue & Usage page + supporting edge functions + DB migrations)
**Goal:** Verify that every metric, balance, quota, plan, and revenue figure shown in the UI is genuinely sourced from the database — flag any static / fake / placeholder values.

---

## Overall Verdict (TL;DR)

| Module | Verdict |
|---|---|
| **AI Wallet — PlanManager** | OK — fully DB-driven |
| **AI Wallet — PlatformAiConfig** | OK — fully DB-driven |
| **AI Wallet — CostSimulator** | OK — pricing & plans from DB; user-controlled inputs are intentional |
| **AI Wallet — ClientQuotaManager** | **2 STATIC VALUES** — uses hardcoded `AI_COST_CONSTANTS` for "Est. Cost" column instead of `platform_ai_config` |
| **Client WalletCard** | OK — wallet, free credits, transactions all live from DB |
| **Client AiUsageSection / AiUsageTabContent** | OK — DB-driven, but `CREDIT_COSTS` constants are static (cosmetic) |
| **Revenue & Usage — Usage Products tab** | OK — RPC `admin_get_usage_overview` is fully SQL-aggregated |
| **Revenue & Usage — Subscription Products tab** | OK — RPC `admin_get_subscription_overview` is fully SQL-aggregated, but **`lifetime_revenue` is computed by extrapolation, not real invoices** (see #1 below) |
| **Edge function `purchase-credits`** | OK — but **Stripe price IDs are hardcoded** in code, not in `subscription_plans` (see #2) |
| **Edge function `verify-credit-purchase`** | OK — idempotent against DB |
| **Edge function `stripe-webhook`** | OK — comprehensive & DB-driven |
| **Edge function `process-auto-recharge`** | OK — DB-driven |
| **Edge function `grant-free-credits`** | OK — calls DB RPC |
| **Edge function `usage-snapshot`** | **DB size is ESTIMATED, NOT REAL** (see #3) — `bandwidth_mb` and `ai_tokens_used` are hardcoded 0 |
| **Edge function `usage-alerts-check`** | OK, but free-tier limits are hardcoded in edge function |
| **Edge function `ai-intelligence-stats`** | OK — fully DB-driven with proper config fallback |
| **Legacy `admin/Usage.tsx` page** | Hardcoded `FREE_TIER_LIMITS` (not blocker — same as `usage-utils.ts`) |
| **Client `CostEstimator.tsx`** | **DEPENDS ON MISSING `cost-calculator` lib** — needs verification |
| **`credit-utils.ts`** | OK — but `CREDIT_COSTS` are static UI defaults |
| **`usage-utils.ts`** | OK — uses real `usage_snapshots` rows |

---

## 1. Critical Findings (need fixing)

### 1.1 `ClientQuotaManager.tsx` — uses static `AI_COST_CONSTANTS` for "Est. Cost"

**File:** `bundle/src/components/admin/ai-cost/ClientQuotaManager.tsx`
**Line:** 10 (import), 213–215 and 274–276 (usage)

```ts
import { AI_COST_CONSTANTS } from './CostSimulator';
// ...
const totalAiCost = clients.reduce((sum, c) => {
  return sum + (c.chat_quota * AI_COST_CONSTANTS.chatPerMessage)
            + (c.image_quota * AI_COST_CONSTANTS.imagePerGeneration);
}, 0);
```

**Issue:**
- `AI_COST_CONSTANTS = { chatPerMessage: 0.0005, imagePerGeneration: 0.13 }` is **hardcoded** in `CostSimulator.tsx` line 13.
- The actual platform cost lives in `platform_ai_config.chat_base_cost` and `platform_ai_config.image_base_cost`, which are admin-editable.
- If the admin updates pricing in `PlatformAiConfig.tsx`, the "Est. Cost" column in Client Quota Manager will be **stale / wrong**.
- The "Total AI cost" KPI shown in the header (line 236) also uses these stale constants.

**Fix:**
1. Fetch `image_base_cost` and `chat_base_cost` from `platform_ai_config` in `fetchClients()`.
2. Replace `AI_COST_CONSTANTS.chatPerMessage` → loaded `chat_base_cost`.
3. Replace `AI_COST_CONSTANTS.imagePerGeneration` → loaded `image_base_cost`.
4. (Optional cleanup) Delete the exported `AI_COST_CONSTANTS` from `CostSimulator.tsx` entirely once nothing imports it.

---

### 1.2 `admin_get_subscription_overview` RPC — `lifetime_revenue` is **estimated**, not actual

**File:** `bundle/supabase/migrations/20260427125350_e35a98e8-ca56-4c9e-bf44-879ef9fc070e.sql`
**Lines:** 143–149

```sql
CASE
  WHEN cs.created_at IS NULL OR sp.price_monthly IS NULL THEN 0
  ELSE ROUND(
    sp.price_monthly *
    GREATEST(1, EXTRACT(EPOCH FROM (LEAST(now(), p_end) - GREATEST(cs.created_at, p_start))) / (60*60*24*30))::numeric
  , 2)
END AS lifetime_revenue
```

**Issue:**
- This is **(months elapsed × current plan price)** — an extrapolation.
- It does **not** read from actual paid Stripe invoices.
- Therefore: refunds, failed payments, plan upgrades/downgrades, free trials, and discounts are **all ignored** in the lifetime number.
- The `mrr` column is also derived from `sp.price_monthly` directly, so an active subscription always counts at the *current* plan price even if the customer is on legacy pricing.

**Impact:** Mild — the UI labels it "Lifetime Revenue" and admins may interpret it as actual revenue. For an accurate figure you'd need to sum from `stripe-webhook` invoice events or a `stripe_invoices` cache table.

**Fix options:**
- **Option A (cheap):** Rename the label in `ClientSubscriptionTable.tsx` to "Estimated Lifetime" with a tooltip ("estimated from plan price × time active; does not include refunds/discounts").
- **Option B (correct):** Add a `stripe_invoices` table (you already have `stripe_webhook_events`), aggregate `amount_paid` from `invoice.payment_succeeded` events, and join in the RPC.

---

### 1.3 Edge function `usage-snapshot` — **fake metrics**

**File:** `bundle/supabase/functions/usage-snapshot/index.ts`
**Lines:** 60–65, 98, 100

```ts
// Estimate database size (rough approximation: 1KB per analytics event, 5KB per order)
const estimatedDbSizeMb = (
  (analyticsCount || 0) * 0.001 +
  (ordersCount || 0) * 0.005 +
  (savedDesignsCount || 0) * 0.003 +
  (chatSessionsCount || 0) * 0.002
);
// ...
bandwidth_mb: 0, // Would need CDN logs to track
analytics_events_count: analyticsCount || 0,
ai_tokens_used: 0, // Would track from AI usage
```

**Issues:**
1. **`database_size_mb` is fabricated** — coefficients are guesses (1 KB, 5 KB, 3 KB, 2 KB per row). The real per-row size depends on jsonb payloads, indexes, TOAST'd columns. Could be 5× off in either direction.
2. **`bandwidth_mb` is hardcoded to 0** — explicit "todo".
3. **`ai_tokens_used` is hardcoded to 0** — but you already have `ai_usage_logs.input_tokens + output_tokens` available! This should be aggregated.

**Impact:**
- This snapshot drives the **legacy** admin Usage page (`bundle/src/pages/admin/Usage.tsx`) and the client `CostEstimator.tsx`.
- The new AI Wallet & Revenue & Usage pages **do not** depend on `usage_snapshots`, so the fakeness here does **not** affect your two named modules.
- But the legacy `/admin/usage` page is still in the bundle, so percentages like "Database 92% used" are essentially made-up.

**Fix:**
1. For real database size, use `pg_total_relation_size()` via an RPC, or accept this is approximation and rename the column / re-label the UI as "estimated".
2. Replace `ai_tokens_used: 0` with an aggregate from `ai_usage_logs` for the day.
3. Either implement bandwidth tracking (Supabase Pro has a `pg_stat` view) or remove the column from the UI to avoid showing a permanent zero.

---

### 1.4 `purchase-credits` — Stripe price IDs hardcoded in edge function

**File:** `bundle/supabase/functions/purchase-credits/index.ts`
**Lines:** 52–56

```ts
const CREDIT_PACKS: Record<string, { stripe_price_id: string; ... }> = {
  credits_25:  { stripe_price_id: "price_1TCi5WELyIQnr0qG6ap9IyNp", ... },
  credits_50:  { stripe_price_id: "price_1TCi5qELyIQnr0qG2auI4rUo", ... },
  credits_100: { stripe_price_id: "price_1TCi6HELyIQnr0qGT7d2wO7n", ... },
};
```

**Issue:**
- These Stripe `price_id` strings live in source code, not in the DB.
- The pack amounts and bonuses are also hardcoded — and they **must match** `CREDIT_PACKS` in `src/lib/credit-utils.ts` lines 26–30. There's no enforcement that the two stay in sync.
- If you create a new credit pack you must edit two files in lockstep (TS frontend + edge function).

**Impact:** Medium — operationally brittle, not a runtime bug *today*, but every future price change is a code deploy.

**Fix:**
Create a `credit_packs` table:
```sql
CREATE TABLE public.credit_packs (
  id text PRIMARY KEY,                  -- 'credits_25'
  amount_usd numeric NOT NULL,
  bonus_usd numeric NOT NULL DEFAULT 0,
  stripe_price_id text NOT NULL,
  label text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  popular boolean NOT NULL DEFAULT false,
  sort_order int NOT NULL DEFAULT 0
);
```
Then read from this table in both `purchase-credits/index.ts` and `WalletCard.tsx`.

---

## 2. Non-blocking observations (good practice / hygiene)

### 2.1 `credit-utils.ts` — `CREDIT_COSTS` are static UI labels

**File:** `bundle/src/lib/credit-utils.ts`, lines 19–23

```ts
export const CREDIT_COSTS = {
  chat: 2,
  costEstimate: 2,
  imageRender: 144,
} as const;
```

These numbers are used in client-facing UI ("Chat: 2 credits", "Image: 144 credits") — the **actual debit amount in DB** is computed dynamically from `platform_ai_config.image_base_cost × image_multiplier` via `gate_ai_request` and `debit_wallet`.

So:
- ✅ **Money** is right (real DB cost).
- ⚠️ **Display number** can drift if admin changes `image_multiplier` or `chat_multiplier`.

**Fix:** Show `CREDIT_COSTS` dynamically by fetching `platform_ai_config` in `WalletCard.tsx` / `AiUsageSection.tsx` once on mount, and computing `chatCredits = (chat_base_cost × chat_multiplier) / CREDIT_RATE`.

This is cosmetic but earns trust — clients see exactly what they're being charged.

---

### 2.2 `CostSimulator.tsx` line 13 — exports stale constants

```ts
export const AI_COST_CONSTANTS = {
  chatPerMessage: 0.0005,
  imagePerGeneration: 0.13,
};
```

The component itself loads dynamic costs from DB (good), but it exports these defaults that `ClientQuotaManager.tsx` then re-uses (see §1.1). Once §1.1 is fixed, **delete this export**.

---

### 2.3 Legacy `admin/Usage.tsx` — `FREE_TIER_LIMITS` hardcoded

**File:** `bundle/src/pages/admin/Usage.tsx`, lines 12–16
**File:** `bundle/src/lib/usage-utils.ts`, lines 40–45
**File:** `bundle/supabase/functions/usage-alerts-check/index.ts`, lines 9–14

The Supabase Free Tier limits (500 MB DB, 1024 MB storage, 500k functions) are duplicated in 3 places.

If you ever upgrade to Pro the limits should change, but they won't unless you edit all 3.

**Fix:** Either move these into `platform_ai_config` (so admins can override), or accept the duplication and add a comment linking the 3 files. Lowest priority.

---

### 2.4 `ClientQuotaManager.tsx` `SYSTEM_FALLBACK` constant

**File:** `bundle/src/components/admin/ai-cost/ClientQuotaManager.tsx`, line 43

```ts
const SYSTEM_FALLBACK: PlanDefaults = { chat: 3000, images: 200, chatRpm: 32, imageRpm: 10 };
```

This is only used if a plan has no row in `plan_ai_defaults` — a defensive default. **OK** but worth verifying every plan in `subscription_plans` *does* have a `plan_ai_defaults` row. The seed in `20260329120404_*.sql` lines 52–60 covers Starter/Growth/Enterprise, and `20260416121609_*.sql` adds Custom X / RingOS / JewlX Suite / Elite. **You should run a quick spot-check that every published plan has a `plan_ai_defaults` row.**

Verification query:
```sql
SELECT sp.name FROM subscription_plans sp
LEFT JOIN plan_ai_defaults pad ON pad.plan_id = sp.id
WHERE pad.id IS NULL;
```

---

### 2.5 Migration drift — multiple `ensure_free_credits` / `grant_monthly_free_credits` rewrites

The same two functions are rewritten across at least 6 migrations:
- `20260319150102_*.sql` — original
- `20260402203644_*.sql` — added free-credit deduction logic
- `20260416100000_fix-double-welcome-grant.sql`
- `20260416120000_d4f8e7c2*.sql` — adds lifetime tracking
- `20260416121609_*.sql` — disabled monthly grant
- `20260416150000_rename-free-credits-columns-to-dollars.sql` — renames columns
- `20260416165255_024d5909_*.sql` — re-enables monthly grant + 365-day expiry
- `20260508125258_*.sql` — final welcome-on-insert trigger

This means the *active* logic is whatever the **most recent** migration installed. After tracing through:

- **Welcome grant:** auto-fires on every new `clients` insert via `trg_grant_welcome_credits` trigger → `ensure_free_credits` → grants the configured `monthly_free_credits_dollars` (currently $22.50 = 45,000 credits), expiring on month-end. ✅ Working.
- **Monthly refresh:** `grant_monthly_free_credits` deletes all `client_free_credits` rows and re-inserts one per `clients`. Scheduled via `pg_cron` at `0 0 1 * *`. ✅ Working.
- **Purchased credits expiry:** 365 days, cron at `5 0 * * *`. ✅ Working.

**Observation:** The README says "monthly free credit allocation cron" runs via the `grant-free-credits` edge function, but the actual logic now runs via **pg_cron** calling `grant_monthly_free_credits()` directly. The edge function still works (invokes the same RPC), but unless you've scheduled the edge function in a separate cron it may be dead code. Confirm with:
```sql
SELECT jobname, schedule FROM cron.job WHERE jobname LIKE '%free%';
```

---

### 2.6 `wallet_transactions.type` enum values are not constrained

The codebase uses these `type` values:
- `'credit'` (admin top-up)
- `'topup'` (Stripe credit pack)
- `'auto_recharge'` (auto-recharge invoice)
- `'debit'` (AI usage)
- `'purchase'` (referenced in `admin_get_usage_overview` revenue CTE)

But the `wallet_transactions.type` column is `text` with no CHECK constraint. Stray values won't error — they'll silently be excluded from the revenue/cost RPC computation.

**Fix (optional hardening):**
```sql
ALTER TABLE wallet_transactions
ADD CONSTRAINT wallet_transactions_type_chk
CHECK (type IN ('credit','topup','auto_recharge','debit','purchase','refund_clawback'));
```

---

### 2.7 Revenue RPC `p_resold_only` filter relies on description matching

**File:** migration `20260427125350_*.sql`, lines 44–49

```sql
AND (
  NOT p_resold_only
  OR wt.description ILIKE '%pack%'
  OR wt.description ILIKE '%purchase%'
  OR wt.description ILIKE '%top%up%'
)
```

This is **fragile** — based on free-text descriptions written by the edge functions. If an edge function's description string changes (e.g. "credits added" instead of "credits purchased"), revenue numbers silently break.

**Fix:** Filter by `type IN ('topup','auto_recharge','credit')` instead of description ILIKE. Or add a `is_resold boolean` column populated at insert time.

---

### 2.8 `CostEstimator.tsx` depends on missing module

**File:** `bundle/src/components/client/usage/CostEstimator.tsx`, line 5
```ts
import { calculateUsageProjection, formatDaysUntilLimit, formatCostEstimate } from '@/lib/cost-calculator';
```

The bundle contains `credit-utils.ts` and `usage-utils.ts` but **no `cost-calculator.ts`**. This import will resolve to a file in the real project (`src/lib/cost-calculator.ts`) but it's not included in your bundle for review.

**Action:** Verify that file exists and is fed from real `usage_snapshots` rows, not from hardcoded constants. If it computes projections from the fake `database_size_mb` in §1.3, those projections will also be fake.

---

## 3. What's actually fine (DB-driven, no concerns)

### AI Wallet admin page (`/admin/ai-wallet`)
- **Header client count** (`AiCostCalculator.tsx` line 12): `supabase.from('clients').select('id', count: 'exact')` — real count.
- **`PlanManager.tsx`**: reads from `subscription_plans` + `plan_ai_defaults`, writes via `upsert`, deletes via cascading delete. All DB.
- **`PlatformAiConfig.tsx`**: single-row upsert on `platform_ai_config`. All DB.
- **`CostSimulator.tsx`**: loads `platform_ai_config` and `subscription_plans` on mount; sliders are intentionally user-controlled (this is a what-if calculator).

### Revenue & Usage page (`/admin/revenue-usage`)
- **Client dropdown**: `supabase.from('clients').select('id, company_name')` — real list.
- **KPI cards**: `useMemo` over RPC result — pure aggregations, no fake data.
- **Tables**: pagination + sort over RPC result — no client-side fabrication.
- **Drawer**: `wallet_transactions` query with `eq('client_id', row.client_id)` — real transactions.
- **CSV export**: serializes the same RPC rows — no transformation.

### Client wallet (`/dashboard/usage`)
- **`WalletCard.tsx`**: balance from `client_wallets`, free credits from `client_free_credits`, transactions from `wallet_transactions` — all live queries.
- **Top-up flow**: calls `purchase-credits` edge function → Stripe → `verify-credit-purchase` → `credit_wallet` RPC. Idempotent via `reference_id` unique index.

### Edge function `ai-intelligence-stats`
- Uses real `ai_usage_logs`, `ai_chat_sessions`, `ai_usage_monthly_summary`, `client_wallets`, `client_free_credits`, `platform_ai_config`.
- Costs computed from DB config (base × multiplier), with safe fallbacks only if `platform_ai_config` is missing.

### Edge function `stripe-webhook`
- Comprehensive event handling. Idempotency via `stripe_webhook_events.stripe_event_id`. Race-safe credit grants (handles duplicate-key 23505 gracefully). Fraud-card-fingerprint tracking. Plan resolution via `subscription_plans.stripe_price_id` *or* `legacy_stripe_price_ids[]` array.

### Edge function `process-auto-recharge`
- Threshold check from `client_auto_recharge_settings`, 5-min debounce, hourly idempotency key, real Stripe invoice creation. Wallet credited via `credit_wallet` RPC.

### DB invariants
- `client_wallets` has UNIQUE(client_id) — one wallet per client.
- `wallet_transactions(reference_id) WHERE type='topup'` partial unique index prevents double-credit.
- `client_ai_quotas` has UNIQUE(client_id) — one quota row per client.
- `platform_ai_config` is intentionally single-row.
- `plan_ai_defaults` has UNIQUE(plan_id) — one defaults row per plan.
- `client_subscriptions` has client_id as the upsert conflict target — one row per client.

---

## 4. Recommended fix-priority order

1. **HIGH** — Fix §1.1 (ClientQuotaManager static costs). 30-minute task, prevents admin-facing wrong numbers.
2. **MEDIUM** — Fix §1.4 (move credit-pack prices to DB). Schema + edge function + frontend; ~1 hour.
3. **MEDIUM** — Decide on §1.2 (rename "Lifetime Revenue" to "Estimated Lifetime" OR build the Stripe invoice cache). The label change is 1 minute; full fix is half a day.
4. **LOW** — Fix §1.3 only if you actively use the legacy `/admin/usage` page. If you've migrated to `/admin/revenue-usage` entirely, this can be deprecated.
5. **LOW** — Fix §2.1 (dynamic CREDIT_COSTS display) — purely cosmetic alignment.
6. **HOUSEKEEPING** — §2.6 (CHECK constraint on wallet_transactions.type), §2.7 (replace ILIKE filter with type filter), §2.5 (verify cron schedules).

---

## 5. Verification queries you can run right now

```sql
-- 1. All plans have AI defaults?
SELECT sp.name, sp.id FROM subscription_plans sp
LEFT JOIN plan_ai_defaults pad ON pad.plan_id = sp.id
WHERE pad.id IS NULL;

-- 2. Free-credit rows that don't match welcome grant amount in config
SELECT cfc.client_id, cfc.dollars_granted, pac.monthly_free_credits_dollars
FROM client_free_credits cfc, platform_ai_config pac
WHERE cfc.dollars_granted <> pac.monthly_free_credits_dollars
  AND cfc.expires_at > now();

-- 3. Any wallet_transactions with unknown type values?
SELECT DISTINCT type FROM wallet_transactions;
-- Expected: credit, topup, auto_recharge, debit, purchase

-- 4. Currently scheduled crons (free credits, expiry, snapshots, etc.)
SELECT jobname, schedule, active FROM cron.job ORDER BY jobname;

-- 5. Spot check: latest wallet balance vs lifetime_credits - lifetime_debits
SELECT client_id, balance,
       (lifetime_credits - lifetime_debits) AS computed,
       balance - (lifetime_credits - lifetime_debits) AS drift
FROM client_wallets
ORDER BY ABS(balance - (lifetime_credits - lifetime_debits)) DESC
LIMIT 10;
-- Drift should be ~0 (modulo refunds). Large drift = bug in credit_wallet/debit_wallet.

-- 6. Are any active clients missing a wallet row?
SELECT c.id, c.company_name FROM clients c
LEFT JOIN client_wallets cw ON cw.client_id = c.id
WHERE cw.id IS NULL AND c.status = 'active';
```

If queries 1, 4, 5, 6 all return clean results, your AI Wallet + Revenue & Usage modules are fundamentally solid and only the items in §1 need fixing.
