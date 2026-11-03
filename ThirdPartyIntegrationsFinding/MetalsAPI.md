# Metals-API.com — Live Metal Prices

## 1. Current Implementation

**File:** `supabase/functions/fetch-metal-prices/index.ts` (114 lines — the smallest integration).

**API:** `https://metals-api.com/api/latest` + historical endpoint for yesterday's close.

**Symbols fetched:** `XAU` (gold), `XAG` (silver), `XPT` (platinum).

**Flow:**
1. Call `latest` endpoint with `base=USD&symbols=XAU,XAG,XPT`.
2. Call yesterday-date endpoint for previous close.
3. Compute `change` and `changePercent` per metal.
4. Return `{ metal, pricePerOz, previousClose, change, changePercent, lastUpdated }` per symbol.

**Secret:** `METALS_API_KEY` (env var).

**Consumers:** Metal IQ feature — referenced in `src/lib/metal-prices-api.ts`.

## 2. What's Working Well

- ✅ API key read from env (not hardcoded).
- ✅ Checks `latestData.success` before trusting response.
- ✅ Graceful handling when historical data fetch fails (optional, degrades gracefully to zero change).
- ✅ Proper HTTP status codes: 502 for upstream failure, 500 for our code bug.
- ✅ Error logged via `logEdgeFunctionError` (uses project's central logger).

## 3. Critical Gaps / Security Concerns

### 🔴 P0 — No rate limiting / caching on the frontend call path

Metals-API's free tier = ~50 requests/month; paid plans tiered at 10 000 – 100 000 / month. Currency + metal data changes at most every few minutes. But this function has **no server-side cache**:
- Every widget load → one `latest` call + one historical call = 2 API hits.
- 10 000 page views/day × 2 = 20 000 hits/day → 600 000/month. Over the entire month's quota in a single day on a mid-tier plan.

**Fix:** Cache the response in Postgres (or edge KV if available) for 5-15 minutes. A single shared cache for the whole platform, not per-client.

```sql
CREATE TABLE metal_prices_cache (
  id int PRIMARY KEY DEFAULT 1,
  data jsonb NOT NULL,
  expires_at timestamptz NOT NULL
);
```

### 🔴 P0 — API key leaked in URL (not just header)

`fetch-metal-prices/index.ts:28,54`:
```ts
fetch(`https://metals-api.com/api/latest?access_key=${apiKey}&...`)
```

Query-string secrets appear in:
- CDN logs
- Upstream proxy logs
- Metals-API's own access logs indexed by referrer

**Metals-API does support header-based auth** (`Authorization: Bearer ...`) on their paid plans. If stuck with query-param auth, rotate the key frequently.

**Fix:** Use header auth if the plan allows. At minimum, ensure the key is rotated on any incident.

### 🟠 P1 — `error.message` echoed to client

`:108`:
```ts
return new Response(JSON.stringify({ error: error.message }), ...)
```

If the error contains the URL (including the API key), you've just leaked the secret to the client.

**Fix:** Use `sanitizeErrorForClient` from `_shared/secrets-validation.ts` (consistent with `send-email` pattern).

### 🟠 P1 — No retry / no circuit breaker

A single 5xx or timeout from Metals-API kills the request. No backoff.

**Fix:** Retry 2× with 1s/3s backoff on 5xx / timeout; circuit-break after 5 consecutive failures (5-min cooldown).

### 🟠 P1 — No authentication on this edge function

The function doesn't check who's calling. Any anonymous client can invoke it repeatedly — trivially burns your API quota.

**Fix:**
- Require JWT (logged-in user) at minimum.
- For public widget use (Metal IQ), route through a server-side endpoint that uses the cache and a per-IP rate limit.

### 🟡 P2 — Change calculation uses "yesterday's calendar date"

`:48-51`:
```ts
yesterday.setDate(yesterday.getDate() - 1);
```

On Monday, "yesterday" is Sunday — markets were closed. Change % becomes 0 or Friday-close vs Monday-open noise. Not a bug per se but UX-confusing for finance-savvy users.

**Fix:** Use Metals-API's `timeframe` endpoint or explicitly seek the last trading day.

### 🟡 P2 — Rounding loses precision

`Math.round(pricePerOz * 100) / 100` → 2 decimal places. Gold moves ~$1 on a busy minute; rounding to cents is OK for display but not for finance logic. Any gram-level calculations downstream may accumulate error.

**Fix:** Return both raw and rounded values.

## 4. Performance & Optimization Issues

| Issue | File:Line | Impact |
|-------|-----------|--------|
| Two sequential Metals-API calls per request | `:27, :54` | ~500-1000ms total |
| No caching | — | Quota burn + slow p50 |
| No fallback API provider | — | Any Metals-API outage breaks Metal IQ |

**Optimizations:**
- Cache for 5-15 min.
- Issue the two calls in parallel (`Promise.all`).
- Add a secondary provider (e.g., GoldPriceAPI, MetalPriceAPI) for failover.
- Consider a background cron that pre-populates the cache every 10 min, so user-facing requests always read from cache (zero user-perceived latency).

## 5. Industry-Standard SaaS Checklist

- [ ] **Caching layer** — single shared cache, 5-15 min TTL, served from DB/KV.
- [ ] **Scheduled prefetch** — cron every 10 min, not on-demand.
- [ ] **Secret in header**, not URL query param.
- [ ] **Secret rotation policy** — quarterly or on-incident.
- [ ] **Retry with backoff** on 5xx / timeout.
- [ ] **Fallback provider** on outage.
- [ ] **Authenticated + rate-limited endpoint**.
- [ ] **Quota monitoring** — alert at 80% of monthly quota.
- [ ] **Historical data strategy** — last trading day, not calendar yesterday.
- [ ] **Data freshness indicator** — show user how old the price is.
- [ ] **Graceful degradation** — last-known-good price if upstream is down.
- [ ] **Audit log** of who triggers refreshes.

## 6. Action Items (Prioritized)

### P0

1. **Add DB cache** with 10-15 min TTL; all reads hit cache first.
2. **Stop echoing `error.message`** to client — use `sanitizeErrorForClient`.
3. **Require auth** on the endpoint; widget access goes through a cached public endpoint with per-IP rate-limit.

### P1

4. Parallelize the two upstream fetches (`Promise.all`).
5. Scheduled prefetch cron every 10 min — user calls never hit upstream directly.
6. Retry + circuit breaker.
7. Switch to header auth if plan supports it.
8. Add quota monitoring alert at 80%.

### P2

9. Secondary provider fallback.
10. "Last trading day" logic for change calculation.
11. Surface price age in API response and UI.

### P3

12. Secret rotation policy (quarterly).
13. Dashboard for Metal IQ freshness / API health.
