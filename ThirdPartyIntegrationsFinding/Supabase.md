# Lovable Cloud (Supabase) — Database, Auth, Storage & Edge Functions

## 1. Current Implementation

**Files:**
- `src/integrations/supabase/client.ts` — frontend client (uses `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, session stored in `localStorage`).
- `src/integrations/supabase/types.ts` — generated types.
- `supabase/config.toml` — local config.
- `supabase/migrations/*` — ~100+ migration files (repo contains dozens from `20251117...` onward).
- `supabase/functions/*` — 99 edge functions.

**Auth model:**
- Supabase Auth with email+password, JWT access tokens, refresh tokens.
- Role-based access via `user_roles` table (`agency_admin`, `client`, `staff`).
- Row-Level Security (RLS) assumed on most tables.
- Service role key used by every edge function via `createClient(url, SUPABASE_SERVICE_ROLE_KEY)` for privileged DB access.

**Encryption patterns:** pgcrypto RPCs for Shopify tokens (`decrypt_shopify_token`, `decrypt_storefront_token`, `decrypt_webhook_secret`).

**Shared utilities** (`supabase/functions/_shared/`):
- `secrets-validation.ts` — secret loading, error sanitization, sensitive-field detection.
- `security-utils.ts`, `timing-safe.ts`, `password-validation.ts` — auth hardening.
- `error-logger.ts`, `activity-logger.ts` — observability.
- `ai-cache.ts`, `ai-quota.ts`, `ai-router.ts` — AI plumbing.
- `prompt-guardrails.ts`, `prompt-loader.ts` — AI safety.
- `unkey.ts` — API-key auth.

**GDPR/Privacy:** `gdpr-delete-user`, `gdpr-export-user` edge functions exist.

**Backups/Security:** `database-backup`, `security-monitor`, `account-lockout-check`, `log-failed-login` functions exist.

## 2. What's Working Well

- ✅ Central secret validation in `_shared/secrets-validation.ts` — `getRequiredSecret` logs "configured ✓" without value; `sanitizeErrorForClient` redacts JWTs, API keys, connection strings, long hex strings.
- ✅ Sensitive-field dictionary (`SENSITIVE_FIELDS`) used by `sanitizeForLogging` for structured logs.
- ✅ Shopify tokens encrypted at rest via pgcrypto RPCs — correct pattern.
- ✅ RLS migrations present (over 100 migration files, many referencing `policy`).
- ✅ Dedicated edge functions for admin actions (create/delete users) — avoids giving frontend direct DB write paths.
- ✅ Dual-auth pattern (Unkey + JWT) via `_shared/unkey.ts::dualAuth` is clean.
- ✅ GDPR export/delete endpoints exist.
- ✅ Account lockout + failed login logging is infra-level security hygiene.
- ✅ Edge functions use API version pin (`supabase-js@2`).
- ✅ `persistSession: false` in edge function clients prevents accidental session leakage.

## 3. Critical Gaps / Security Concerns

### 🔴 P0 — `Access-Control-Allow-Origin: '*'` on every edge function

Every `corsHeaders` object uses `'*'`. This means:
- Any origin can call any edge function.
- Combined with the frontend's localStorage-based JWT, a malicious page that tricks a logged-in user into visiting it can execute any authenticated edge function using fetch (CSRF-adjacent, though preflight + SameSite offers some protection).
- For widget endpoints this is intended; for admin endpoints (`unkey-create-key`, `admin-reset-client-password`, `database-backup`) it's a liability.

**Fix:** Split CORS per endpoint class:
- Admin edge functions: `Access-Control-Allow-Origin: https://vault.jewlx.ai` only.
- Client-dashboard edge functions: same.
- Widget edge functions: `*` (intentional).

### 🔴 P0 — Session stored in `localStorage`

`src/integrations/supabase/client.ts:13` uses `storage: localStorage`. XSS on any page → full account takeover (stolen JWT + refresh token). Supabase's recommendation has moved toward HTTP-only cookies (Next.js SSR package) or iframe-based session storage.

**Fix:**
- If SPA: consider `sessionStorage` + short JWT expiry.
- Stronger: HTTP-only secure cookies set by a server route.
- At minimum: strict CSP to minimize XSS surface.

### 🔴 P0 — No rate-limiting on auth endpoints at the edge

`log-failed-login` and `account-lockout-check` functions exist (good), but the Supabase-managed `/auth/v1/token` endpoint uses Supabase's default rate limits — typically enough for brute-force protection but not configured visibly here.

**Fix:** Verify Supabase Auth rate limits in the dashboard (typically 30/hr per IP for sign-up, sign-in). Document the setting. Add custom brute-force alarm on failed_login telemetry.

### 🟠 P1 — Service role key accessible to every edge function

Standard pattern, but means a vulnerability in any function (prompt injection triggering arbitrary SQL via RPC misuse, etc.) escalates to full DB write. The service role bypasses RLS entirely.

**Fix:**
- Minimize service-role usage — prefer passing the caller's JWT to RLS-enforced queries.
- For functions that MUST use service role, keep them as narrow as possible (e.g., `create-client-user` is naturally privileged; `ring-chat` should not use service role for non-admin reads).
- Grep audit: count how many edge functions use `SUPABASE_SERVICE_ROLE_KEY` — aim to reduce.

### 🟠 P1 — RLS policies can drift between migrations

With 100+ migration files and multiple tables, RLS coverage drift is a common issue. One migration that creates a table without `ENABLE ROW LEVEL SECURITY` → silent data exposure.

**Fix:**
- Add a CI test that enumerates every public-schema table and asserts `rowsecurity = true`.
- Add a test per RLS policy: "user A cannot see user B's row".

### 🟠 P1 — Edge function cold starts amplify failure blast radius

Supabase edge functions (Deno) have noticeable cold starts (~200-800ms). Any long chain of `supabase.functions.invoke` (e.g., Shopify webhook → `notify-order-update` → `send-email`) multiplies cold-start latency. A slow cold start close to the 150s wall-time limit can time out.

**Fix:**
- Consolidate "notify-*" family into fewer functions where possible.
- Use direct `resend.emails.send` instead of chaining `send-email` via `functions.invoke` where the caller is already an edge function.
- Add function warm-up cron for hot paths.

### 🟠 P1 — Frontend `VITE_SUPABASE_PUBLISHABLE_KEY` is the anon key

Publicly exposed — correct design — but anything the anon key can do is callable by anyone. If RLS isn't tight on a table, the whole internet can SELECT/INSERT.

**Fix:** Covered by the RLS audit above. Also: never accept bearer tokens from the anon context in privileged SQL functions (`SECURITY DEFINER`) without explicit user checks.

### 🟠 P1 — No visible observability stack

Logs go to Supabase's function log dashboard (good for debugging) but there's no aggregate view of error rates, p99 latency, third-party error ratios. `error-logger.ts` writes to a DB table (`log_system_error`, `logEdgeFunctionError`) — good — but no dashboard on top.

**Fix:**
- Ship function logs to a log-aggregator (Axiom, Logtail, Datadog).
- Build a `system_health` dashboard showing error rates per integration, cost per feature, 429 counts, etc.
- Synthetic monitoring: a paid bot runs key user journeys hourly.

### 🟠 P1 — Backup strategy is opaque

`database-backup` edge function exists but its schedule, retention, and restore testing aren't documented here.

**Fix:**
- Automated daily backups (Supabase Pro has PITR, but confirm).
- Quarterly restore drills.
- Off-region / off-provider backup for disaster recovery (AWS S3 cross-region).

### 🟡 P2 — Migration file count (100+) with no squash

Hard to reason about final schema state. `ring_chat` etc. have visible references to 6+ tables; tracing data flow requires reading migrations.

**Fix:** Document the schema in a single `SCHEMA.md` regenerated from `pg_dump`. Or use Supabase's declarative schema feature when GA.

### 🟡 P2 — No tenant isolation test suite

Multi-tenant SaaS security failure mode #1: one client reads another client's data via a missing `client_id` filter. No tests visible that specifically probe this.

**Fix:** `pg_prove` test suite that logs in as client A and tries `SELECT *` from every `client_*` table filtering for client B's data — should always return 0 rows.

### 🟡 P2 — Deno `std` version drift

Edge functions import from `https://deno.land/std@0.168.0/...`, `@0.190.0/...`, `@0.224.0/...` — versions not consistent. Upstream Deno std library doesn't guarantee API stability across major bumps.

**Fix:** Pin a single std version in a constants file; bump deliberately.

### 🟡 P2 — No dependency SCA

`https://esm.sh/stripe@18.5.0` etc. are pinned but not scanned for CVEs. No `trivy`/`snyk` in CI.

**Fix:** Add SCA to CI pipeline.

## 4. Performance & Optimization Issues

| Issue | Observation | Impact |
|-------|-------------|--------|
| Functions do many small DB round trips (2-4 per request common) | Almost every handler | 50-200ms overhead |
| `auth.getUser(token)` network round-trip per request | Standard Supabase pattern | 30-80ms per request |
| Chaining `functions.invoke` across edge functions | Shopify webhook → notify-* → send-email | Multiplied cold starts |
| No edge function concurrency limits visible | — | One runaway client can starve others |

**Optimizations:**
- Use `auth.getClaims()` (JWT decode, no network round-trip) where full user object isn't needed.
- Collapse authorization + data fetch into a single SQL function with `SECURITY INVOKER`.
- Inline email sending in terminal handlers instead of chaining `send-email` via functions.invoke.
- Supabase's new edge cache for GET endpoints where freshness allows.

## 5. Industry-Standard SaaS Checklist

- [ ] **Per-endpoint CORS** — admin functions locked to app domain.
- [ ] **Session storage hardened** — HTTP-only cookies or short-TTL localStorage with strict CSP.
- [ ] **RLS enforced on every user-data table** + automated test.
- [ ] **Multi-tenant isolation test suite** — client A can't read client B.
- [ ] **Secrets rotation policy** — service role key rotated on offboarding / quarterly.
- [ ] **Observability** — aggregated logs, error rate dashboards, alerts on error budget burn.
- [ ] **Synthetic monitoring** — hourly user-journey probes.
- [ ] **Backup + restore drill** — quarterly verified.
- [ ] **Off-provider DR copy** for critical data.
- [ ] **Content Security Policy** to minimize XSS blast radius.
- [ ] **Input validation** — Zod/Valibot on every edge function entry (already partial — e.g., `shopify-add-to-cart`).
- [ ] **Rate limits on auth** — configured + monitored.
- [ ] **Account lockout** — implemented (already present).
- [ ] **MFA** — optional for users, required for agency admins.
- [ ] **Audit log** — who did what when on privileged operations.
- [ ] **Data retention policy** — auto-purge old `email_logs`, `ai_usage_logs`, `activity_logs` per GDPR.
- [ ] **GDPR/CCPA/PIPEDA tooling** — export + delete (already present).
- [ ] **Least-privilege service accounts** — minimize service-role usage.
- [ ] **SCA in CI** — dependency vulnerability scanning.
- [ ] **Deno std version pinning** unified.
- [ ] **Edge function warm-up** for hot paths.
- [ ] **Circuit breakers** around every external dependency.
- [ ] **Idempotency keys** on mutating endpoints.
- [ ] **Structured errors** with error codes, not freeform strings.

## 6. Action Items (Prioritized)

### P0

1. **Split CORS configuration** per endpoint class (admin vs client vs public widget).
2. **Add RLS audit test** in CI — fails if any `public.*` table has `rowsecurity = false`.
3. **Multi-tenant isolation test suite** — pick 10 representative tables, test cross-client reads return empty.
4. **Add MFA requirement for `agency_admin` role**.
5. **Document + test backup/restore** — one restore drill this quarter.

### P1

6. Move session storage toward HTTP-only cookies or add strict CSP + short JWT expiry.
7. Central observability: ship edge function logs to Axiom/Logtail/Datadog.
8. Data retention cron — purge old `ai_usage_logs`, `activity_logs`, `email_logs` per policy.
9. Service-role audit — minimize usage; switch to JWT-passthrough where possible.
10. Add idempotency-key pattern wrapper for mutating edge functions.
11. Synthetic user-journey monitoring hourly.

### P2

12. Unify Deno std versions across functions.
13. Add SCA (Snyk / Trivy) to CI.
14. Squash / document migrations into `SCHEMA.md`.
15. Consolidate notify-* functions to reduce cold-start chaining.
16. Audit log table for privileged actions.

### P3

17. Circuit-breaker library wrapping all third-party fetches.
18. Edge function warm-up cron.
19. Cross-region DR backup pipeline.
20. GA-ready declarative schema migration.
