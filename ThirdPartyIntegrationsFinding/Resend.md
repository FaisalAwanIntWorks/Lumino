# Resend — Transactional Email

## 1. Current Implementation

**Primary dispatcher:** `supabase/functions/send-email/index.ts` — single entry that every other notification function eventually calls.

**Downstream functions (each has its own handler that calls `send-email` or Resend directly):**
- `send-verification-email`, `send-client-welcome-email`, `send-staff-welcome-email`
- `request-password-reset`
- `notify-new-lead`, `notify-form-lead`, `notify-lead-deleted`, `notify-metal-iq-lead`
- `notify-admins-new-client`, `notify-admins-client-status`, `notify-staff-activity`
- `notify-appointment-booking`, `notify-customer-confirmation`
- `notify-cad-request`, `notify-cad-delivery`, `notify-cad-resize`
- `send-cad-email`, `send-ai-render-email`, `send-consolidated-render-email`, `process-pending-render-emails`
- `send-quote-estimate`, `notify-order-update`

**Library:** `https://esm.sh/resend@2.0.0`.

**Sender:** `JewlX <onboarding@resend.dev>` with `reply_to: concierge@jewlx.ai`.

**Logging:** every attempt is recorded in `email_logs` (`recipient_email`, `email_type`, `subject`, `status: pending→sent`, `resend_id`, `metadata`).

## 2. What's Working Well

- ✅ API key validated via `getRequiredSecret('RESEND_API_KEY')` — initialization gracefully disables email if missing (`send-email/index.ts:14-19`).
- ✅ Authentication required on the central endpoint (`:59-76`).
- ✅ Role-based authorization (agency_admin / client / staff) (`:86-98`).
- ✅ Email format validation + length caps (to ≤ 320 chars, subject ≤ 200, html ≤ 100 KB) (`:111-125`).
- ✅ Recipient masked in logs (`:150`).
- ✅ Generic error message to client via `sanitizeErrorForClient` (`:169`).
- ✅ `email_logs` table provides a durable audit trail.
- ✅ Dedicated sending subdomain (`<your sending domain>`) — protects root domain reputation.

## 3. Critical Gaps / Security Concerns

### 🔴 P0 — No webhook handler for bounces / complaints / deliveries

Grep confirms: no `resend-webhook` edge function. Resend sends events (`email.bounced`, `email.complained`, `email.delivery_delayed`, `email.delivered`) but nothing consumes them.

**Impact:**
- Hard bounces keep being retried by new user flows → gradually poisons domain reputation.
- Spam complaints don't flag the recipient → you keep emailing people who reported you, risking provider blocklist.
- `email_logs.status` stays "sent" even when delivery ultimately failed.

**Fix:** Create `supabase/functions/resend-webhook/index.ts`:
- Verify Resend's webhook signature (HMAC — Resend uses `svix` or shared secret).
- Update `email_logs.status` to `bounced`/`complained`/`delivered`.
- Insert into `email_suppression_list` on bounce or complaint; check this list before sending.

### 🔴 P0 — No suppression list check

Every sender function fires to Resend without checking whether the recipient has bounced or complained before. Once a client's email hard-bounces, every subsequent CAD notification/quote bounces again → reputational damage.

**Fix:** `WHERE recipient_email NOT IN (SELECT email FROM email_suppression_list)` check in `send-email` before dispatching.

### 🟠 P1 — HTML is not sanitized

`send-email/index.ts:100` trusts the caller to send safe HTML. Several of the `notify-*` functions concatenate `customer_name`, `subject`, lead notes, etc. into HTML templates. If any of those contain attacker-controlled content (lead-form submission), stored XSS is possible when the email is rendered in a customer's webmail.

**Fix:** Pass every user-supplied string through a sanitizer (e.g., `isomorphic-dompurify`) before interpolation. Alternative: use Resend React templates (JSX) where text nodes are auto-escaped.

### 🟠 P1 — No DKIM / SPF / DMARC verification in CI

Deliverability depends on DNS records on `<your sending domain>`. There's no automated check that DKIM (`<selector>._domainkey.<your-domain>`), SPF (`v=spf1 include:_spf.resend.com -all`), and DMARC (`v=DMARC1; p=quarantine; rua=mailto:...`) are still configured correctly.

**Fix:** A nightly cron function resolves the TXT records and alerts if any are missing/changed.

### 🟠 P1 — No retry on transient Resend failures

`send-email/index.ts:141-147` fires once. On a 5xx or timeout, the email is lost (only logged). No queue-and-retry.

**Fix:** Either:
- Write to an `email_queue` table first, have a worker cron pull and send with retry.
- Or use Resend's native batch/scheduled send with retry config.

### 🟠 P1 — Duplicate interface declaration

`send-email/index.ts:24-30` and `:32-38` declare `EmailRequest` twice. Also duplicate `if (authError || !user)` block at `:78-83`. Dead code, but suggests the file has been hand-patched and merges may have introduced drift.

**Fix:** Clean up duplicates; add an ESLint / deno-lint pass.

### 🟠 P1 — Email templates are per-function HTML strings

No central template library. Changing the footer / logo requires editing 15+ functions. Inconsistent unsubscribe links (most notifications have none). CAN-SPAM / CASL-compliant unsubscribe is required for commercial content.

**Fix:**
- Move to a `email_templates` DB table (or a shared `_shared/email-templates.ts` module).
- Every marketing-adjacent email MUST include an unsubscribe header (`List-Unsubscribe: <mailto:...>, <https://...>`) and footer link.
- Transactional emails (order confirmation, password reset) are exempt but should still have a clear "why you received this" footer.

### 🟡 P2 — `reply_to` is a single address

`concierge@jewlx.ai` gets every customer reply. No routing to per-client concierge. Customers replying to lead notifications hit your generic mailbox.

**Fix:** Use client-specific reply-to when notifying the end customer on behalf of a client (e.g., `reply_to: client.support_email`).

### 🟡 P2 — No per-client branded sending domain

Every email says "JewlX" — customers of your clients see "JewlX" as the sender, not the jeweler's brand.

**Fix:** Resend supports per-domain configuration. Let clients add a `CNAME` and send as `noreply@[client-domain].com`. This is a big SaaS differentiator.

### 🟡 P2 — No rate-limit by recipient

A single misbehaving script could blast 10 000 emails to one recipient. No per-recipient-per-hour cap.

**Fix:** Check `email_logs` for `recipient_email` count in last hour; cap at 20/hour/recipient.

## 4. Performance & Optimization Issues

| Issue | File:Line | Impact |
|-------|-----------|--------|
| Every `notify-*` invokes a fresh edge function | multiple | Cold start ~200-400ms per email |
| `email_logs` insert + select + update = 3 DB round trips per email | `send-email/index.ts:128-161` | ~60-100ms overhead |
| No batch send — each recipient is one Resend API call | all `notify-*` | Slow for admin fan-outs |

**Optimizations:**
- Use Resend's batch send API (`resend.batch.send([...])`) when notifying multiple admins.
- Replace 3-step log pattern with a single `INSERT ... RETURNING id` and a fire-and-forget update using Postgres `LISTEN/NOTIFY` or `pg_background`.
- Collapse related notifications with a debounce window (e.g., 5 lead submissions in 1 min → 1 summary email).

## 5. Industry-Standard SaaS Checklist

- [ ] **Webhook handler** with signature verification for bounces/complaints/deliveries.
- [ ] **Suppression list** consulted before every send.
- [ ] **DKIM/SPF/DMARC** active + monitored (nightly cron).
- [ ] **DMARC reporting** — `rua=` mailbox ingested for deliverability analytics.
- [ ] **Per-recipient rate limit** (spam dampener).
- [ ] **Transactional vs marketing separation** — different subdomains (`mailer.` vs `marketing.`) so marketing bounces don't poison transactional reputation.
- [ ] **Template library** — single source of truth; preview + test tool for each.
- [ ] **HTML sanitization** on any user-supplied content interpolated into templates.
- [ ] **List-Unsubscribe header** on every non-critical email.
- [ ] **Plain-text alternative** for every HTML email (improves inbox placement).
- [ ] **Retry queue** for transient failures with exponential backoff.
- [ ] **Per-client sending domain** (CNAME-based branding).
- [ ] **Seed list testing** — monthly automated delivery test to Gmail/Outlook/Yahoo to catch inbox placement regressions.
- [ ] **Bounce categorization** — hard (permanent) vs soft (retry 48h); only hard auto-suppresses.
- [ ] **Click / open tracking pixel** opt-in per client (privacy-respecting default).
- [ ] **Reply routing** — customer replies to transactional emails route to the right owner, not a generic mailbox.
- [ ] **Subject line A/B** capability for onboarding sequences.
- [ ] **Email log retention policy** — after 90 days, redact content, keep metadata.

## 6. Action Items (Prioritized)

### P0

1. **Create `supabase/functions/resend-webhook/index.ts`** — verify signature, update `email_logs.status`, populate `email_suppression_list`.
2. **Create `email_suppression_list` migration** (`email`, `reason`, `created_at`, unique on email).
3. **Block sends to suppressed recipients** in `send-email/index.ts` — check before calling `resend.emails.send`.
4. **Sanitize user-supplied content** (customer names, lead notes, form fields) before HTML interpolation in all `notify-*` functions. Use `isomorphic-dompurify` or switch to Resend React templates.

### P1

5. Add `List-Unsubscribe` header + footer link on every non-critical email.
6. DNS monitor cron — verify DKIM/SPF/DMARC records on `<your sending domain>` nightly.
7. Consolidate duplicate interfaces / dead code in `send-email/index.ts`.
8. Retry policy: write to `email_queue` first, worker pulls + retries with backoff on 5xx.
9. Build a shared `_shared/email-templates.ts` (or DB-backed `email_templates`) and refactor the 15+ handlers to use one template per email type.

### P2

10. Per-client sending domain (CNAME wizard in settings).
11. Per-recipient rate limit (20/hour).
12. Batch send for multi-admin fan-outs.
13. Monthly seed list deliverability test.
14. Split marketing / transactional subdomains.

### P3

15. Subject A/B testing framework.
16. Open/click tracking with per-client opt-in.
17. 90-day log-retention redaction job.
