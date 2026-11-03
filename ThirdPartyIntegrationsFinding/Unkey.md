# Unkey — API Key Management & Rate Limiting

## 1. Current Implementation

**Files:**
- `supabase/functions/_shared/unkey.ts` — verify, create, list, revoke, `dualAuth` middleware, `verifyRequestApiKey`.
- `supabase/functions/unkey-create-key/index.ts` — admin-only key creation with default 100 RPM.
- `supabase/functions/unkey-list-keys/index.ts` — list keys for a client.
- `supabase/functions/unkey-revoke-key/index.ts` — admin revocation.
- `supabase/functions/unkey-usage-analytics/index.ts` — usage stats.

**Secrets:** `UNKEY_ROOT_KEY` (admin), `UNKEY_API_ID`.

**Key prefix:** `jwlx_` — identifies a JewlX-issued Unkey.

**Verification path:** `x-api-key` header OR `Authorization: Bearer jwlx_...`.

**Rate limit default:** 100 requests / 60 000 ms (`fast` type).

**Where used today:** `dualAuth` in `shopify-push-catalog` (and other push endpoints) accepts either API key or JWT. Widget-facing chat functions use `verifyRequestApiKey` optionally.

## 2. What's Working Well

- ✅ Central helper (`unkey.ts`) with clean separation between verification, creation, listing, revocation.
- ✅ Admin-role gate (`agency_admin`) required for create/revoke (`unkey-create-key/index.ts:47-51`).
- ✅ `ownerId = clientId` + `meta.clientId` means the key is self-describing; verification result immediately gives you the client.
- ✅ `dualAuth` cleanly handles API-key OR JWT in one function; also handles agency admins + staff.
- ✅ Rate-limit enforcement via `checkUnkeyRateLimit` reads `unkeyResult.remaining`.
- ✅ Key shown once on creation with user warning ("Save this key — it won't be shown again") (`unkey-create-key/index.ts:99`).
- ✅ Graceful fallback when Unkey isn't configured — widgets still work anonymously (`ring-chat/index.ts:436-438`).

## 3. Critical Gaps / Security Concerns

### 🔴 P0 — Unkey verify endpoint is unauthenticated

`unkey.ts:79-91` calls `POST /keys.verifyKey` with no `Authorization` header. This is actually correct per Unkey's design — verify is meant to be callable with just the key. But there's a subtle issue: **you trust the `apiId` parameter**. If `UNKEY_API_ID` env var is corrupted / overwritten, every verify call returns `valid: false` and you silently reject legitimate keys. No startup validation.

**Fix:** On edge function boot, make one test `verifyKey` call against a known-invalid key; if the response shape is unexpected, log and alert.

### 🟠 P1 — `remaining` rate-limit check is soft

`checkUnkeyRateLimit(authResult): Response | null` only returns 429 when `remaining === 0`. Unkey's response schema also includes `enabled` and `code` fields (e.g., `RATE_LIMITED`, `DISABLED`, `EXPIRED`) — these aren't checked.

`unkey.ts:324-343`:
```ts
if (remaining !== undefined && remaining <= 0) { ... }
```

If Unkey returns `valid: false, code: "DISABLED"`, the function returns `null` (allow) because `remaining` is undefined. A disabled/expired key might pass through.

**Fix:** Add `if (authResult.unkeyResult.valid === false) return 401`. Already partly checked in `dualAuth`, but `verifyRequestApiKey` alone doesn't surface this consistently.

### 🟠 P1 — Key meta is fully trusted

`dualAuth` reads `unkeyResult.meta.clientId` and uses it to authorize catalog pushes (`shopify-push-catalog/index.ts:133`). If an admin mis-tags a key with a wrong `clientId`, the holder gains write access to a different client's catalog.

**Fix:**
- On key creation, double-check that `ownerId === meta.clientId`.
- On verify, cross-check `unkeyResult.ownerId === unkeyResult.meta.clientId` and reject on mismatch.

### 🟠 P1 — No key rotation policy

Keys are created with optional `expiresInDays` (`unkey-create-key/index.ts:87`) but no enforcement. Long-lived keys that get leaked (via a client's server log, a CI secret, etc.) grant permanent access.

**Fix:**
- Default `expiresInDays: 90`.
- Admin UI must surface key age + last-used timestamp.
- Auto-email clients ~10 days before expiry.

### 🟠 P1 — Scopes are not enforced

Unkey supports per-key scopes (`ring_chat`, `catalog_write`, etc.) but the code doesn't use them. Every JewlX-issued key can call every function that accepts API-key auth.

**Fix:** Add `scopes: ['catalog:write']` at creation; check `unkeyResult.meta.scopes` inside each function.

### 🟠 P1 — Default 100 RPM is a one-size-fits-all

`unkey-create-key/index.ts:88-93`. Doesn't reflect plan tier. A Custom X client has the same rate-limit as a JewelX Suite client.

**Fix:** Derive `rateLimit` from the client's subscription plan.

### 🟡 P2 — No audit log of key create/revoke

Keys are issued by agency admins; revocations are sensitive. No `audit_logs` insert visible.

**Fix:** Log every create/revoke to a dedicated audit trail table with `actor_user_id`, `client_id`, `action`, `timestamp`.

### 🟡 P2 — List endpoint exposes `start` (key prefix)

Unkey returns the key's `start` (first few chars) — useful for UI, but any endpoint returning this must be admin-scoped. Confirm `unkey-list-keys` enforces this.

### 🟡 P2 — `verifyRequestApiKey` checks two headers — header confusion risk

Both `x-api-key` and `Authorization: Bearer jwlx_...` accepted (`unkey.ts:172-188`). If a reverse proxy strips `Authorization` but not `x-api-key`, behavior differs by deployment. Also potentially lets someone bypass a WAF rule that only inspects `Authorization`.

**Fix:** Pick one header as primary; log a deprecation warning if the other is used.

## 4. Performance & Optimization Issues

| Issue | File:Line | Impact |
|-------|-----------|--------|
| Key verification hits Unkey API on every request | `unkey.ts:79-91` | ~30-80ms network latency per call |
| No short-term verify cache | — | Repeat calls from same key hit Unkey every time |
| `dualAuth` does 2-3 DB queries (clients, staff_members, user_roles) for JWT branch | `unkey.ts:268-304` | ~30ms overhead for JWT users |

**Optimizations:**
- Cache verify results for ~30-60s in edge function memory (KV or simple Map, scoped to the invocation).
- Consolidate the 3 lookup queries into a single SQL function `get_auth_context(user_id)`.
- Use Unkey's SDK with built-in caching if available (JS SDK has LRU).

## 5. Industry-Standard SaaS Checklist

- [ ] **Key expiration** default (90 days) with renewal flow.
- [ ] **Scope-based permissions** (`ring:chat`, `catalog:write`, etc.) enforced per-endpoint.
- [ ] **Rate limits tiered by plan**.
- [ ] **Last-used timestamp** visible to clients for each key.
- [ ] **Audit log** for key create/revoke/scope-change.
- [ ] **Verify cache** (short TTL) for latency-sensitive paths.
- [ ] **Key rotation reminder emails** before expiry.
- [ ] **Secret scanning** — GitHub Advanced Security, TruffleHog in CI to catch leaked keys.
- [ ] **Revoke-on-leak** playbook — detect + rotate in < 1 hour.
- [ ] **IP allowlist per key** for server-to-server integrations.
- [ ] **Webhook key vs user key separation** — different scopes, different rate limits.
- [ ] **Anonymous widget path** stays public but rate-limited by session, not by key.
- [ ] **Key-metadata integrity check** (`ownerId === meta.clientId`).
- [ ] **Dashboard for key usage** — last-used, RPM, 429 counts, top endpoints.
- [ ] **Automated test key** for CI — isolated Unkey API, rotated monthly.
- [ ] **Graceful degradation** when Unkey is unreachable (already present — widget keeps working).

## 6. Action Items (Prioritized)

### P0

1. Fix `checkUnkeyRateLimit` + `verifyRequestApiKey` to also reject when `valid === false` (handle `code: DISABLED`, `code: EXPIRED`).
2. Add `unkeyResult.ownerId === unkeyResult.meta?.clientId` integrity check in `dualAuth`. Reject on mismatch.

### P1

3. Enforce key expiry (default 90 days on creation; cron to warn at T-10).
4. Add scopes to key metadata; enforce per-endpoint.
5. Rate limits tiered by subscription plan.
6. Audit log for every create/revoke.
7. In-memory verify cache (LRU, 30-60s TTL).

### P2

8. IP allowlist option per key (settings UI + verify-time check).
9. Key usage dashboard (last-used, RPM, errors) for clients.
10. Decide on single primary header (`x-api-key`) and deprecate the other.

### P3

11. Secret scanning in CI (TruffleHog / GitHub secret scan).
12. Monthly automated key rotation test in staging.
