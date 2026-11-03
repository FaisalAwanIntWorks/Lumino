# CRM MVMNT (GoHighLevel) Integration — Hardening Summary

**Date:** 2026-06-26
**Scope:** Diamond Touch Toronto (DTT) — Diamond Form → CRM MVMNT sync
**Status:** Code complete. Pending deployment (see "How to Deploy" at the end).

This document explains, in plain language, four issues that were found in the
CRM MVMNT integration, what was fixed, and what the team should keep an eye on.

---

## Quick Overview

The integration that sends Diamond Form leads into CRM MVMNT was working, but a
code review found four real problems around **security**, **reliability**, and
**data quality**. All four have now been fixed. None of the rest of the product
was touched — only the CRM MVMNT integration files.

| # | Issue | Risk before fix | Status |
|---|-------|-----------------|--------|
| 1 | A secret key was hard-coded in the code | Security + silent outage on key change | ✅ Fixed |
| 2 | No retry / duplicate protection | Lost leads + duplicate deals in CRM | ✅ Fixed |
| 3 | Admin tools had no access control | Any logged-in user could run them | ✅ Fixed |
| 4 | Phone numbers formatted inconsistently | Duplicate contacts in CRM | ✅ Fixed |

---

## Issue 1 — A secret key was hard-coded in the code

**What was wrong:**
A private access key was written directly inside the database code and saved
into our code history. Two problems with that: (a) a secret should never live in
the code history, and (b) if that key was ever changed/rotated, the whole sync
would quietly stop working with no error and no warning.

**What was fixed:**
The key is now read from a secure configuration store at run time instead of
being written in the code. If the key ever changes, we just update it in one
place — no code change needed, and nothing breaks silently.

---

## Issue 2 — No retry and no duplicate protection

**What was wrong:**
When a lead came in, the system tried **once** to push it to CRM MVMNT. If that
call failed halfway (for example, the contact was created but the deal/
opportunity failed), the lead was simply marked as failed — there was no
automatic recovery. Worse, if the same lead was ever processed twice, it could
create **duplicate contacts and duplicate deals** in the CRM.

**What was fixed:**
- **Automatic retry:** temporary failures (rate limits, server hiccups, network
  blips) are now retried automatically a few times before giving up.
- **Duplicate protection (idempotency):** the system now remembers what it has
  already done for each lead. If a lead is processed again, it skips the steps
  that already succeeded and only completes what's missing — so no duplicate
  contacts or duplicate deals are created.
- **Safe recovery:** a lead that partially failed can now simply be re-run, and
  it will finish the missing steps cleanly.

---

## Issue 3 — Admin tools had no access control

**What was wrong:**
The behind-the-scenes tools (re-pushing old leads / "backfill", loading CRM
settings, testing the connection) could be triggered by **any logged-in user**,
not just an authorized admin. The automatic lead-sync endpoint could also be
reached using a publicly known key.

**What was fixed:**
- The admin tools now require an **agency admin** account. Non-admins are
  blocked.
- The automatic lead-sync endpoint is now **internal-only** — it only accepts
  calls from our own system, not from outside.

> ⚠️ **Heads-up / behavior change:** these admin tools now require an *agency
> admin* login. If the DTT client themselves (a non-admin account) was using the
> settings screen directly, they would now be blocked. If we need the client to
> have their own access, let us know and we'll widen the permission.

---

## Issue 4 — Phone numbers were formatted inconsistently

**What was wrong:**
The "create lead" step and the "find existing lead" step formatted phone numbers
slightly differently. Because of that mismatch, CRM MVMNT sometimes failed to
recognize an existing contact and created a **duplicate**.

**What was fixed:**
Both steps now use the exact same standard international phone format (E.164),
so existing contacts are matched correctly and duplicates are avoided.

---

## What to keep an eye on (important)

1. **Configuration must hold the real key.**
   The integration depends on the secure configuration storing the correct
   service key. Before/after deployment, confirm this value is set correctly.
   If it's wrong or blank, lead syncing will stop. (This same configuration is
   already used by another nightly job, so it is normally already correct — we
   just need to verify.)

2. **Admin-only access (see Issue 3 heads-up).**
   Confirm whether the DTT client needs to use the CRM settings/backfill screens
   themselves. Right now those require an agency-admin login.

3. **The lead audit log is the source of truth.**
   Every sync attempt is recorded (contact / opportunity / note / overall). If
   anything looks off, that log shows exactly which step succeeded or failed for
   each lead, and a failed lead can be safely re-run.

---

## How to Deploy

Two steps, done by the dev team:

1. Apply the database change.
2. Re-deploy the four CRM MVMNT functions (lead sync, settings loader,
   connection test, backfill).

After deploying, do a quick check: submit one test Diamond Form lead and confirm
it appears in CRM MVMNT (contact + deal + note), and that the audit log shows
"success".

---

## Bottom Line

The integration was functional but had gaps in security, reliability, and data
quality. All four gaps are now closed: the secret is out of the code, leads
retry and no longer duplicate, admin tools are properly restricted, and phone
matching is consistent. The only thing the team must verify at deploy time is
that the secure configuration holds the correct key.
