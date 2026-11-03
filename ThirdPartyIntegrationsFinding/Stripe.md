# Stripe — Payments & Subscriptions

## 1. Current Implementation

**Files:**
- `supabase/functions/create-checkout/index.ts` — creates subscription checkout sessions for Custom X / RingOS / JewelX Suite plans
- `supabase/functions/check-subscription/index.ts` — polls Stripe on every page/subscription check to determine entitlement
- `supabase/functions/purchase-cad-addon/index.ts` — one-time purchase checkout for CAD add-ons (3 fixed price IDs)
- `supabase/functions/shopify-form-checkout/index.ts` — deposit checkout via Shopify (not pure Stripe)
- `supabase/functions/customer-portal/index.ts` — redirects to Stripe billing portal
- `supabase/functions/process-auto-recharge/index.ts` — off-session charge for low-wallet clients
- `supabase/functions/purchase-credits/index.ts`, `verify-credit-purchase/index.ts` — credit top-ups
- `supabase/functions/save-payment-method/index.ts`, `get-payment-methods/index.ts` — PM management

**Library:** `https://esm.sh/stripe@18.5.0`, API version pinned to `2025-08-27.basil`.

**Flow:**
1. User clicks "Subscribe" → `create-checkout` → Stripe Checkout URL.
2. Stripe collects card, starts trial (30 days), returns to `/payment-success`.
3. The client calls `check-subscription` which hits Stripe `customers.list` + `subscriptions.list` + `invoices.list` + `checkout.sessions.list` (up to 50 items) on **every invocation** — no DB cache of entitlement state.
4. Auto-recharge: `ai-quota.logUsage()` non-blockingly fires `process-auto-recharge` when wallet balance drops below threshold.

## 2. What's Working Well

- ✅ Stripe secret key is read from env via `Deno.env.get('STRIPE_SECRET_KEY')` — never hardcoded.
- ✅ Authorization checked via Supabase JWT before creating a session.
- ✅ Hard-coded `VALID_PRICE_IDS` allowlist in `purchase-cad-addon` prevents price-injection abuse (user can't pass an arbitrary `price_id`).
- ✅ `metadata: { user_id, plan_name, company_name }` attached to sessions — gives you a trail on the Stripe dashboard.
- ✅ Trial period (30 days) is declared server-side, not client-controlled.
- ✅ `customer_email` is set only when no existing customer found — avoids duplicate customer records.

## 3. Critical Gaps / Security Concerns

### 🔴 P0 — No webhook handler exists

```
grep -r "stripe.webhooks.constructEvent" supabase/functions/ → 0 matches
grep -r "STRIPE_WEBHOOK_SECRET" supabase/functions/ → 0 matches
```

**Impact:**
- `customer.subscription.deleted`, `invoice.payment_failed`, `customer.subscription.updated` events are NEVER consumed.
- Entitlement is derived purely by polling `check-subscription`, which can be stale for minutes.
- A cancelled user retains paid feature access until they re-load a page that triggers the poll.
- Failed renewals (dunning) don't pause features; dispute/chargeback events don't revoke access.
- Refunds don't trigger credit clawbacks.

**Fix:** Build `supabase/functions/stripe-webhook/index.ts` that handles at minimum:
- `checkout.session.completed` → provision subscription, write to a `subscriptions` table.
- `customer.subscription.updated` / `.deleted` → update status.
- `invoice.payment_failed` → flag account, notify client.
- `charge.refunded` / `charge.dispute.created` → revoke credits / access.
- `payment_method.attached` → update saved PM.

The edge function must call `stripe.webhooks.constructEvent(rawBody, sigHeader, STRIPE_WEBHOOK_SECRET)` to verify the signature.

> 📖 **Simple Roman Urdu mein smjhein:**
>
> **Masla kya hy:** Stripe aik payment company hy. Jb koi user subscription cancel krta hy, payment fail hoti hy, ya refund hota hy — to Stripe hmy ek "message" bhejta hy jisko **webhook** kehty hein. Ye message aik chota sa khat hota hy jo kehta hy "bhai, is user ki subscription cancel hogayi hy, is ko ab paid feature mt do." Lekin hmary project mein ye khat receive krny wala koi postman (webhook handler) hy hi nahi! Khat aata hy aur zaya hojata hy.
>
> **Abhi kya nuqsaan horhy hein:**
> 1. User ny subscription cancel kerdi — phir bhi wo paid features use krta rehta hy kyunki hmein pata hi nahi chla.
> 2. User ki card payment fail hogayi (dunning) — hm us ko notify nahi krty, feature band nahi krty. Free mein chlta rehta hy.
> 3. User ny chargeback (dispute) ki bank sy — hmary paisy wapis chly gye, lekin hm ny us ka account band nahi kiya. Wo wapis free mein service use krta hy.
> 4. Refund diya to wallet credits wapis nahi liye — user ny paisy wapis liye AUR credits bhi rakhy. Double nuqsan.
>
> **Fix krny k bad kya hoga:** Stripe ka har message aa k hmary database mein save hojaya kry ga. Jese hi koi cancel kry — 1 second k andar us ka access band hojaye ga. Payment fail ho to us ko auto email jaye ga. Refund pe wallet bhi adjust hojaye ga. Sb kuch automatic — koi manual kaam nahi, koi loss nahi, koi cheat nahi kr sakta.

### 🔴 P0 — Hardcoded price IDs couple pricing to deploys

`create-checkout/index.ts:17-32` and `purchase-cad-addon/index.ts:11-15` contain literal `price_1TI...` IDs. Every price change requires a code push.

**Fix:** Move to `platform_pricing` table; edge function reads at request time (or caches for 5 min).

> 📖 **Simple Roman Urdu mein smjhein:**
>
> **Masla kya hy:** Plans ki prices (jese Custom X = $497, RingOS = $897) hmary code k andar hard-code ki gayi hein. Ye ese hy jese aap ny dukaan k saman ki price wall pe permanent marker sy likh di ho. Jb bhi price change krni ho, developer ko code edit kr k deploy krna parta hy.
>
> **Abhi kya nuqsaan horhy hein:**
> 1. Price change k liye developer chahiye — business team khud nahi kr sakti.
> 2. Har price update pe deploy krna parta hy — 10-15 minutes down-time ka risk.
> 3. Agr kabhi emergency promotion (20% off) dena ho, to instant nahi ho sakta.
> 4. Multiple environments (test, staging, prod) mein price ids different ho skty hein — galti sy galat price pe user ko charge kr skty hein.
>
> **Fix krny k bad kya hoga:** Prices database mein save hongi. Admin dashboard sy aap khud business team log bhi change kr skty hein. Koi deploy nahi, koi developer nahi, 1 click mein price update. Promotion bhi 2 second mein live kr skty hein.

### 🟠 P1 — Polling model is slow & expensive

Every `check-subscription` invocation fires 4+ Stripe API calls serially. Stripe rate limit is 100 req/sec per account — scales poorly past a few thousand DAU. Also user-perceived latency since page waits on network.

**Fix:** Persist `subscription_status`, `current_period_end`, `plan_name`, `has_license_fee` in a `client_subscriptions` table, updated by webhook. `check-subscription` reads from DB in <10ms.

> 📖 **Simple Roman Urdu mein smjhein:**
>
> **Masla kya hy:** Jb bhi user apna page khulta hy ya dashboard dekhta hy, hmara system Stripe ko 4 baar call krta hy (customers list, subscriptions list, invoices list, checkout sessions list). Ye ese hy jese aap har waqt bank jaa k pochtey rahein k mery account mein paisy hein ya nahi — bank bhi tang ho jay, aap ka waqt bhi lagy.
>
> **Abhi kya nuqsaan horhy hein:**
> 1. Har page load 800ms sy 1500ms extra lagta hy — user ko lagta hy website slow hy.
> 2. Stripe ki rate limit hy 100 calls per second. Agar hmary 200 users aik saath aa gye to Stripe error dene lagy ga — sb ka access TK jaye ga.
> 3. Stripe ki API call free nahi — company ko indirect cost lagta hy (server, bandwidth).
> 4. Agr Stripe ka server 2 minute down ho to hmara poora dashboard down.
>
> **Fix krny k bad kya hoga:** Subscription ka status hmary apny database mein save rahy ga (jese ghr mein chote cashbox rakhty hein). Page load pe sirf 10ms mein DB sy read hoga — 100× faster. Stripe ki rate limit ka koi masla nahi. Stripe down ho phir bhi hmara system chalta rahy ga.

### 🟠 P1 — No idempotency keys on session / charge creation

If `create-checkout` is invoked twice (double-click, retry), two Stripe sessions are created. For `purchase-cad-addon`, two can mean double-charge.

**Fix:** Pass `{ idempotencyKey: `${user.id}:${planName}:${dateBucket}` }` to `stripe.checkout.sessions.create`.

> 📖 **Simple Roman Urdu mein smjhein:**
>
> **Masla kya hy:** "Idempotency key" ka matlab hy ek unique ticket number. Jese aap ATM sy paisy nikaltey hein to ek transaction ID banti hy — agr line disconnect ho jaye aur aap dobara try krein, to bank ko pata hota hy "ye wohi transaction hy, dobara paisy mt kato." Hmary code mein ye ticket system hy hi nahi.
>
> **Abhi kya nuqsaan horhy hein:**
> 1. User ny "Subscribe" button do dafa click kr diya (network slow thi) — 2 alag checkout sessions ban gye. User confuse ho gya, support ticket aya.
> 2. CAD addon purchase mein ye zyada khatarnak — user ka card do dafa charge ho skta hy. Chargeback aata hy, Stripe fee katti hy, user gussy mein review krta hy.
> 3. Auto-recharge bhi agar retry ho to double recharge ho skta hy. User ne $20 chahye the, $40 kat gye.
>
> **Fix krny k bad kya hoga:** Har payment request k sath aik unique ID jaye gi. Agr wohi request 10 baar aaye, Stripe pehchan lega "ye ek hi kaam hy" — sirf pehli baar charge karega, baqi sb ignore. Double charging khatam, refund requests khatam, user happy.

### 🟠 P1 — `customers.list({ email })` is fragile

`create-checkout/index.ts:92` uses email as the primary Stripe customer lookup. If a user updates their email, you create a second Stripe customer → fragmented billing.

**Fix:** Store `stripe_customer_id` on the `clients`/`profiles` table; create-once, lookup-always.

> 📖 **Simple Roman Urdu mein smjhein:**
>
> **Masla kya hy:** Hm Stripe mein user dhondty hein uski email sy. Ye ese hy jese aap kisi school mein bachy ko dhondein uski uniform ka color bta k — agr bacha uniform change kr le to aap dobara dhond nahi skty. Har user ka Stripe pe ek permanent ID hota hy (`cus_xyz123`) — hm use use hi nahi kr rahy.
>
> **Abhi kya nuqsaan horhy hein:**
> 1. User ne settings mein email change kr di — Stripe mein purana customer reh gya, naya customer ban gya. Uski payment history split ho gayi.
> 2. Billing history poori nahi dikhti. User complain krta hy "mery purany invoices kahan gye?"
> 3. Support team ko manual kaam krna parta hy — 2 Stripe accounts ko merge krna parta hy.
> 4. Reporting galat hoti hy — aik user 2 baar count hota hy, revenue numbers mis-match krty hein.
>
> **Fix krny k bad kya hoga:** Pehli dafa Stripe customer banty waqt hm uska `cus_xyz123` ID apny database mein save kr lein gy. Ab email change ho ya kuch bhi — hm seedha ID sy dhond lein gy. Ek user ka ek hi Stripe profile. Saf history, saf reporting.

### 🟠 P1 — No refund / dispute flow

Refunds must be manual in the Stripe dashboard + manual wallet adjustment in JewlX. No automation.

> 📖 **Simple Roman Urdu mein smjhein:**
>
> **Masla kya hy:** Jb kisi user ko paisy wapis krny hon (refund), ya user ny bank sy dispute kr di ho, to admin ko 2 jagah kaam krna parta hy: (1) Stripe dashboard khol k refund karo, (2) JewlX k database mein jaa k manually us user k wallet sy credits minus karo. Inn mein sy koi aik bhool gye, to nuqsan hojata hy.
>
> **Abhi kya nuqsaan horhy hein:**
> 1. Admin ny refund to de diya lekin wallet sy credits minus krna bhool gya — user ko double fayda, company ka double loss.
> 2. Dispute/chargeback bank sy aaya — admin ko manually detect krna parta hy. Jab tk pata chly, user aur 5 services use kr chuka hota hy bilkul free mein.
> 3. Scale pe ye totally impossible — 1000 refunds per month manually process nahi ho skty.
>
> **Fix krny k bad kya hoga:** Ek admin dashboard pe "Refund" button hoga. Ek click — Stripe ko refund instruction, saath hi wallet automatically adjust. Dispute bhi Stripe webhook sy auto-detect ho jaye gi aur account instantly flag ho jaye ga. Zero manual kaam, zero error.

### 🟡 P2 — Error messages leak server detail

`create-checkout/index.ts:134-138` returns `error.message` directly to client. If Stripe returns an error with any identifier, it's echoed back.

**Fix:** Use the `sanitizeErrorForClient` helper already in `_shared/secrets-validation.ts`.

> 📖 **Simple Roman Urdu mein smjhein:**
>
> **Masla kya hy:** Jb server mein error aata hy, hm poora error message user k browser mein bhej dety hein. Ye ese hy jese aap ko ghr ka address aur chabi ka serial number kisi ajnabi ko de dein. Stripe k error message mein kabhi kabhi customer ID, session ID, internal price ID jesi information hoti hy.
>
> **Abhi kya nuqsaan horhy hein:**
> 1. Hacker ko hmary system ki internal information mil jaati hy — wo aur attack plan kr skta hy.
> 2. Stripe k price IDs, customer IDs leak hoty hein — competitors ko hmari pricing structure pata chl jaati hy.
> 3. User ko technical error dikhty hein — wo confuse ho jata hy, support ko call karta hy, bad experience.
>
> **Fix krny k bad kya hoga:** Server ko detail log milega (debugging k liye), lekin user ko sirf simple friendly message "Kuch technical issue aya, dubara try krein". Hmara data safe, user bhi confuse nahi, support tickets bhi km.

### 🟡 P2 — Trial abuse unbounded

`trial_period_days: 30` with no check whether the same email/card has already trialed → same user creates multiple accounts for free months.

**Fix:** Query `subscription_history` by Stripe customer before allowing a new trial; or use Stripe's `trial_settings` with `end_behavior: "cancel"` + dedup on `customer_email_fingerprint`.

> 📖 **Simple Roman Urdu mein smjhein:**
>
> **Masla kya hy:** Hm har naye user ko 30 din ka free trial dety hein. Koi shatir user naya email bana k (faisal1@gmail.com, faisal2@gmail.com, faisal3@gmail.com) har mahiny free trial le skta hy — same card bhi use kr skta hy. Hm check nahi krty k ye banda pehly bhi trial le chuka hy ya nahi.
>
> **Abhi kya nuqsaan horhy hein:**
> 1. Aik banda infinite free trial le skta hy — company ko paisy nahi milty, bs resources use hoty rehty hein.
> 2. Agar ye trick Reddit ya YouTube pe viral ho jaye to sainkdo log same kryn gy. Bara financial loss.
> 3. AI costs lagty rehty hein (Lovable AI gateway paid hy), image generation k paisy jaty hein — trial abusers sb use krty hein bila paisa diye.
>
> **Fix krny k bad kya hoga:** Jb bhi koi banda trial start kary ga, hm check kr lein gy uska card fingerprint ya email fingerprint — agr phly bhi trial le chuka hy, to "Sorry, aap phly trial use kr chuky hein, ab sirf paid subscription available hy" bol dein gy. Pura free-trial abuse band.

### 🟡 P2 — No 3DS / SCA enforcement visible

For EU customers, SCA is enforced by Stripe Checkout by default — OK. But off-session auto-recharge (`process-auto-recharge`) can fail SCA without a fallback flow.

> 📖 **Simple Roman Urdu mein smjhein:**
>
> **Masla kya hy:** Europe (EU) k customers k liye bank aik extra security check maangta hy jb bhi card sy paisy kty hein — isko "SCA" ya "3DS" khty hein (jesy bank aapko OTP bhejta hy, ya app mein "Yes, Approve" krna prta hy). Jb customer khud baith kr checkout kr rha ho, tb Stripe ye check aaram sy krwata hy. Lekin jb hm **khud sy** customer k card sy paisy kaat rhy hein (auto-recharge — jb customer ki AI credits khatam ho jati hein or hm automatically uska card charge kr k refill krty hein), tb customer samny nhi hota. Aisy mein agr bank SCA check maang ly, to hmary pas koi plan nhi hy k aagy kya kryn.
>
> **Abhi kya nuqsaan horhy hein:**
> 1. EU customer ka auto-recharge try kiya — bank ne SCA maanga — hmara system fail — customer ki AI credits khatam, service ruk gai.
> 2. Customer ko pata bhi nhi chlega k kyun ruki — bs "Error" msg aayega. Wo frustrate ho k hmara SaaS chor dy ga.
> 3. Stripe aisi situations mein aik special error code bhejta hy (`authentication_required`) — hmara code isko handle hi nhi krta, bs generic fail kr deta hy.
>
> **Fix krny k bad kya hoga:** Jb off-session recharge SCA k waja sy fail ho, hm customer ko email bhej dein gy: "Aapky bank ne security confirmation maangi hy, please is link pe click krke approve krein." Customer link kholy ga, bank SCA krwayega, recharge complete ho jayega. Service continuously chlti rhy gi, EU customers bhi khush, bank bhi khush, compliance bhi perfect.

## 4. Performance & Optimization Issues

| Issue | File:Line | Cost |
|-------|-----------|------|
| 4× serial Stripe API calls on every page check | `check-subscription/index.ts:78-149` | ~800-1500ms p50 latency |
| `checkout.sessions.list({ limit: 50 })` + nested `listLineItems` per session | `check-subscription/index.ts:149-161` | Scales O(N) per customer, breaks after ~50 historical sessions |
| No caching on `check-subscription` response | — | Re-hits Stripe for every page nav |
| No backoff on 429 from Stripe | all files | Hard-fails the whole request |

**Fix summary:** DB-backed entitlement table → `check-subscription` becomes a `SELECT` → p50 drops to ~15ms.

## 5. Industry-Standard SaaS Checklist

- [ ] **Webhook handler** with `constructEvent` signature verification.
- [ ] **Webhook endpoint** protected at infra level (IP allowlist of Stripe's published ranges).
- [ ] **Webhook events stored** in `stripe_webhook_events` table with `idempotency` by `event.id` (Stripe retries).
- [ ] **Dead-letter queue** for webhook processing failures.
- [ ] **Idempotency keys** on every mutating Stripe call.
- [ ] **Entitlement table** (`customer_id`, `status`, `plan`, `period_end`, `has_license`) updated only by webhooks, read everywhere else.
- [ ] **Prices / products in DB** (or loaded from Stripe at boot via cron) — zero hardcoded price IDs.
- [ ] **Retry policy** with exponential backoff on Stripe 5xx / 429.
- [ ] **Stripe Radar** enabled for fraud signals on Checkout.
- [ ] **Dunning** emails wired to `invoice.payment_failed` with 3 retries over 7 days.
- [ ] **Proration** explicitly handled on plan upgrades (`subscription_proration_behavior`).
- [ ] **SCA fallback** — if off-session recharge fails with `authentication_required`, email the user a re-auth link.
- [ ] **Tax** — Stripe Tax enabled if selling globally (Canada GST/PST especially).
- [ ] **Logs**: every billing event logged with correlation ID linking Supabase user → Stripe customer → session → invoice.
- [ ] **Admin reconciliation tool** — nightly cron compares DB `subscriptions.status` to Stripe truth, flags drift.
- [ ] **Refund API** endpoint (admin-only) that calls `stripe.refunds.create` + adjusts wallet.
- [ ] **PCI DSS posture** — never touch raw card details; confirmed since all flows use Checkout / Portal.
- [ ] **Test mode** isolated via separate `STRIPE_SECRET_KEY_TEST` secret and feature flag.

## 6. Action Items (Prioritized)

### P0 (blocker — do first)

1. **Create `supabase/functions/stripe-webhook/index.ts`**
   - Import Stripe, load `STRIPE_WEBHOOK_SECRET` from env.
   - Read raw request body (do NOT call `.json()` first — signature breaks).
   - Call `stripe.webhooks.constructEvent(rawBody, sigHeader, webhookSecret)`.
   - Dispatch on `event.type` into handlers for: `checkout.session.completed`, `customer.subscription.created/updated/deleted`, `invoice.payment_succeeded/failed`, `charge.refunded`, `payment_method.attached`.
   - Insert `event.id` into `stripe_webhook_events` BEFORE processing (idempotency).
   - Register the webhook URL in Stripe dashboard → copy the signing secret.
2. **Create `client_subscriptions` migration** — columns: `client_id`, `stripe_customer_id`, `stripe_subscription_id`, `status`, `plan_name`, `current_period_end`, `trial_end`, `has_license_fee`, `updated_at`. Populate it from the webhook above.
3. **Rewrite `check-subscription`** to `SELECT` from `client_subscriptions` (fallback to Stripe only on cache miss > 15min).

### P1 (important)

4. Add `idempotencyKey` to every mutating `stripe.*` call (`checkout.sessions.create`, `subscriptions.update`, `refunds.create`, `paymentIntents.create`).
5. Persist `stripe_customer_id` on `clients` table; stop using email lookup.
6. Move price IDs to `platform_pricing` DB table.
7. Replace raw `error.message` leaks with `sanitizeErrorForClient`.
8. Add retry with exponential backoff (`p-retry` pattern) on Stripe 429/5xx.

### P2 (hardening)

9. Trial abuse dedup (same card fingerprint / email).
10. Stripe Tax evaluation for Canadian customers.
11. Admin nightly reconciliation cron (Supabase scheduled function) comparing DB vs Stripe.
12. Enable Stripe Radar advanced rules.

### P3 (nice-to-have)

13. Synthetic "canary" test checkouts in a dedicated test Stripe account, triggered hourly.
14. SCA re-auth email template for failed off-session charges.
