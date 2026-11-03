# JewlX — Master Marketing Context Pack

**Purpose:** a single, product-first context document to paste into AI strategy tools (Claude, ChatGPT, etc.) so they can produce marketing strategy, positioning, campaigns, and content with full knowledge of what JewlX is, who it serves, what it costs, and the proof we have.

**Audience:** AI strategy tools + the internal JewlX team.
**Prepared:** 21 August 2026. All platform figures pulled live from the JewlX production database on that date.

---

## 1. Company snapshot

**One-liner:** JewlX turns a jeweler's website into a lead machine — AI-powered jewelry configurators and quote widgets that capture, price, and qualify custom-jewelry buyers 24/7.

**Elevator pitch:** Most jewelers rely on walk-ins, DMs, and "contact us" forms. A customer who wants a custom engagement ring has to email, wait, and get a vague reply. JewlX replaces that with embeddable, fully branded configurators: the customer picks their diamond, metal, setting, and budget, sees an instant AI-rendered preview or a real price estimate, and books or pays a deposit — all on the jeweler's own site. Every submission lands in the jeweler's dashboard and CRM as a fully-specced, pre-qualified lead.

**Category framing (pick per audience):**
- Conversion / lead-gen software for jewelry retail (primary)
- Product configurator + CPQ for custom jewelry
- Vertical AI SaaS for jewelers
- "Shopify for custom jewelry quoting" (analogy, use sparingly)

**Core promise, three outcomes:**
1. **More leads** — the website starts producing enquiries at volume instead of a trickle.
2. **Better leads** — every lead arrives with shape, carat, metal, budget, timeline, and contact details already captured.
3. **Less manual work** — no more back-and-forth quoting, manual CAD briefs, or copy-pasting into a CRM.

**Business model:** monthly SaaS subscription per jeweler, some tiers with a one-time license fee, plus metered AI credits for image generation and AI assistant usage. Widgets are white-labeled to the jeweler's brand and locked to their domains.

**Delivery model:** embeddable iframe widgets on the jeweler's existing site (Shopify, WordPress, custom) + a hosted client dashboard. No replatforming required. This is a key sales point: JewlX bolts on, it doesn't rebuild.

---

## 2. ICP — who we sell to

**Primary ICP:** jewelers and jewelry store owners. Independent and small-chain retailers who sell custom or semi-custom jewelry and already get website traffic they aren't converting.

### Segments

| Segment | What they sell | Which JewlX product leads |
|---|---|---|
| Engagement-ring retailers | Diamond rings, bridal | Ring OS + Instant Quote |
| Custom / bespoke jewelers | One-off commissions, redesigns | Custom X (Custom Enquiry, Ring Builder) |
| Hip-hop / street jewelers | Grillz, iced-out pieces, chains | Custom X (Grillz Builder) |
| Gold buyers / refiners | Buying scrap gold and metals from the public | Metal IQ |
| Multi-location / full-service | All of the above | JewlX Suite / Elite |

### Buying triggers
- Paid traffic (Meta/Google) is running but the site converts poorly.
- Owner or sales staff drowning in DMs and "how much would this cost?" messages.
- Losing bridal buyers to online-native competitors (Blue Nile, Brilliant Earth, With Clarity) that offer instant configuration and pricing.
- Expanding into custom work and needing a repeatable intake process.
- A new website launch or rebrand.
- Wanting to pre-qualify buyers so consultation slots aren't wasted.

### Pains (use their words)
- "People message us for a price and we never hear back from them."
- "We don't know a lead's budget until we've spent 30 minutes with them."
- "Our website is a brochure, not a salesperson."
- "Every quote is a manual job for me or my CAD guy."
- "We get leads but no details — just a name and 'hi, interested in a ring.'"

### Objections and answers
| Objection | Answer |
|---|---|
| "We already have a contact form." | A contact form captures a name. JewlX captures the ring: shape, carat, metal, setting, budget, timeline, inspiration images — plus a live estimate. Same visitor, dramatically more sales-ready. |
| "Showing prices online kills our margin/negotiation." | Estimate mode shows "starting at" ranges you control; you set every price component and can run it as a range or hide totals. |
| "Our customers want to come in-store." | The widget's job is to book them in, pre-qualified. Deposit and appointment booking are built in. |
| "Setup will be a nightmare." | It's an iframe embed plus a guided configurator. No replatform, works on Shopify/WordPress/custom. |
| "We tried an AI tool and the renders looked fake." | Photorealistic, catalog-grade renders on clean backgrounds — built specifically for jewelry, not a generic image model prompt. |
| "Too expensive." | One recovered custom ring order typically covers a month. Average quoted ring value across our largest deployment is ~$4,300. |

### Competitive alternatives
- **Doing nothing / generic contact form** — the real #1 competitor.
- **Generic Shopify product-option apps** (Infinite Options, Globo) — options, no pricing intelligence, no AI previews, no CRM pipeline.
- **Agency-built custom form** — expensive, static, unmaintained.
- **Jewelry website platforms** (Punchmark, GemFind, Podium for messaging) — site/CMS or chat, not configuration + quoting + AI.
- **Online-native retailers** (Blue Nile, Brilliant Earth, With Clarity) — not vendors, but the buying experience local jewelers are being benchmarked against. This is the sharpest positioning wedge: *give your store the online experience your customers already expect from the big diamond sites.*

---

## 3. The product suite

JewlX is sold as four product lines plus a shared platform layer. Each line is independently licensable and independently toggled per client account.

### 3.1 Ring OS — the engagement-ring builder
The flagship. A full ring-building experience embedded on the jeweler's site.

- Customer flows through: ring style → setting/shank → metal & karat → diamond (shape, carat, cut, clarity, colour) → review → checkout or enquiry.
- **Live diamond catalog** — the jeweler's own diamond inventory (natural and lab), filterable by shape/carat/quality, with per-client display limits.
- **Real pricing** — Ring price = style + shank + metal + diamond, with live metal-price tracking so gold-price movements flow into quotes automatically.
- **Visuals** — high-resolution ring imagery per configuration, video and 3D preview support.
- **Multiple widget themes** — split-panel and full-screen wizard layouts, fully colour-themed to the brand.
- **Checkout** — Shopify cart integration with deposit-based checkout, or **$0 "Enquiry" mode** for jewelers who'd rather capture every lead with zero payment friction.
- **CAD request pipeline** — a won design can be pushed straight into a CAD request with messaging, delivery, and resize handling.
- **Multi-currency** — 10 local currencies supported.

**Sell it as:** "Blue Nile's ring builder, running on your website, with your diamonds and your prices."

### 3.2 Custom X — the custom-jewelry form suite
Three wizard-style configurators for non-catalog work, all sharing one shell, theming engine, and AI preview system.

- **Ring Builder** — guided custom ring intake: style, metal, karat, diamond quality, budget ranges, timeline, engraving, inspiration uploads, plus unlimited jeweler-defined custom questions.
- **Grillz Builder** — teeth selector, Plain vs Iced Out types (with client-added custom types), per-type metal imagery, deposits.
- **Custom Jewelry Enquiry** — open-ended commissions: jewelry type, metal colour (multi-select), karats, diamond quality with jeweler-written notes ("VVS1 is the best"), diamond setup, budget, timeline, vision description, inspiration images.

**AI previews:** the customer describes or configures their piece and gets a photorealistic, catalog-grade render on a clean background — no props, no people, e-commerce isolation standard. This is the single most demo-able feature in the product and the biggest "wow" in sales calls.

**Everything is client-configurable:** step order, which steps run, every option list (add/delete/rename/reorder), custom images per option, colours, deposit amount, and custom questions interleaved anywhere in the flow.

### 3.3 Instant Quote (Quote Estimator Form) — the lead-volume engine
Originally built for one client (Diamond Touch Toronto), it out-performed everything else and is now a standardized platform product.

- A fast, linear, step-by-step diamond ring quoting flow: diamond type (natural/lab) → shape → size → quality → setting → holder → band → band width → metal → personalization → inspiration → timeline → contact → **instant estimate**.
- The customer sees a real number at the end. That number is the conversion mechanic — it's why completion rates are high and why lead volume is an order of magnitude above a standard enquiry form.
- Fully configurable per client: steps, order, colours, welcome copy, option lists, per-option images, deposit vs contact submission mode.
- Fires Meta Pixel + Conversions API `Lead` events on the thank-you screen, so paid-media teams can optimize against it.
- Sends branded "New Instant Quote Lead" emails to the jeweler and a branded confirmation to the customer (toggleable, so CRM-connected clients don't double-email).

**Sell it as:** "the highest-volume lead capture we ship — an instant ring price estimate, in your brand, on your site."

### 3.4 Metal IQ — the gold-buying widget
For jewelers who buy metal from the public.

- Live metal pricing feed with the jeweler's own margin settings applied.
- Customer enters weight, purity, and photos; the widget returns an instant estimated payout.
- Built-in lead capture and a dedicated leads pipeline.

**Sell it as:** "turn 'what's my gold worth?' searches into booked walk-ins."

### 3.5 JewlX Agent — the AI sales assistant
An AI assistant living inside the Ring OS widget. It answers buyer questions, recommends configurations, and can apply a configuration directly to the builder (carat → quality ranks → price logic). Trained on the client's own catalog and pricing rules with a server-side pricing gatekeeper, so it never invents a price. No emoji, brand-consistent tone.

### 3.6 Platform layer (shared across all products)

| Capability | What it means commercially |
|---|---|
| **Unified CRM + Customer Hub** | Every lead from every widget in one timeline per customer, with status tags, notes, follow-ups, and quote history. |
| **CRM integrations (GoHighLevel / CRM MVMNT)** | Leads auto-create contacts, opportunities, notes, and mapped custom fields in the jeweler's CRM the moment they submit. Multi-client, multi-form. |
| **Shopify integration** | Catalog sync, deposit products, cart permalinks, line-item attributes carrying the full ring spec into the order. |
| **Bookings** | Appointment booking with timezone handling, no past dates, and client availability. |
| **Orders & CAD** | Order management linked to leads; CAD request, delivery, resize, and add-on purchase flow. |
| **Analytics** | Widget views, funnel/step drop-off, lead source attribution, traffic source breakdown per feature. |
| **Tracking** | Meta Pixel + server-side Conversions API, Google Tag Manager, per-client pixel IDs. |
| **Branded email system** | 27 designed transactional templates — lead alerts, customer confirmations, quotes, CAD, billing, auth. Client logo and CTA pulled from settings. |
| **White-label & security** | Client branding, colour theming, custom subdomains, domain-locked embeds (server-side referrer whitelist), screenshot protection on widgets. |
| **Team & access** | Staff accounts with granular per-module permissions; admin impersonation for support. |
| **AI wallet** | Per-client AI credit balance, free monthly allocation, auto-recharge, top-up packs, and full usage/cost reporting. |

**Portals:** `builder.jewlx.ai` (client dashboard), `admin.jewlx.ai` (JewlX admin), `vault.jewlx.ai`.

---

## 4. Commercials

Live plan data as configured in the platform (USD/month unless noted).

| Plan | Price | One-time | Tagline | Headline inclusions | Commission |
|---|---|---|---|---|---|
| **Metal IQ** | $297/mo (or +$99/mo as an add-on) | — | Jewelers who want to buy gold faster through their website | Branded metal-buying form, unlimited metal pricing API, instant estimates, custom margins, lead capture | 12% |
| **Custom X** | $497/mo · 30-day free trial | — | Best for custom jewelry stores | Custom jewelry form builder, AI image previews, Shopify integration, analytics, custom branding | 10% |
| **Ring OS** | $897/mo | + $4,999 license | Best for engagement ring retailers | Ring builder OS, JewlX Agent AI chat, 3D previews, Shopify, CAD request system, priority support | 8% |
| **JewlX Suite** ⭐ | $1,297/mo · 30-day free trial | + $4,999 license | Best for full-service jewelers | Everything in Ring OS + Grillz + Custom Enquiry + Metal IQ, advanced analytics, dedicated account manager, API access, priority CAD queue | 5% |
| **Elite** | $1,999/mo | custom onboarding from $19,000 | For enterprise jewelers | Everything in Suite + white-glove onboarding, custom integrations, dedicated success manager, SLAs, custom AI model training, unlimited CAD | 0% |

**Additional revenue lines:**
- **AI credits** — metered image generation and AI assistant usage. Monthly free allocation per plan, top-up packs, auto-recharge, and a client-facing wallet with cost estimator.
- **CAD add-ons** — purchasable CAD capacity beyond plan limits.
- **One-time license fees** — $4,999 on Ring OS and Suite; from $19,000 custom onboarding on Elite.

**Pricing narrative for marketing:** entry at $297 for a single-purpose widget, land-and-expand to $1,297 Suite. The $4,999 license on the ring-builder tiers signals implementation weight and filters for serious retailers. 30-day free trials on the two self-serve tiers (Custom X, Suite) are the primary top-of-funnel offer.

---

## 5. Flagship case study — Diamond Touch Toronto (DTT)

The single most important proof asset JewlX has. A Toronto engagement-ring retailer, live on the Quote Estimator (Instant Quote) form.

### Platform-side numbers (JewlX production data, as of 21 Aug 2026)

| Metric | Value |
|---|---|
| First Quote Estimator lead captured | **4 March 2026** |
| Total Quote Estimator leads captured | **3,459** |
| Time span | ~5.5 months |
| Average run rate | **~625 form leads / month** |
| Average quoted ring value on submissions | **~$4,317** |
| Total quoted pipeline value implied | **~$14.9M** in requested-ring value |

### Client CRM numbers (client's own CRM, 21 Feb – 21 Aug 2026)

| Metric | Value |
|---|---|
| Total leads entered CRM (6 months, all sources) | **3,912** |
| Won / converted | **45** |
| Lost | 18 |
| Abandoned | 2 |
| Still open in pipeline | 3,847 |
| Avg won deal value | **~$2,950** |
| Won revenue, 6-month window | **~$133,000** |
| Won revenue reported in CRM (all-time in account) | **C$228.37K** |
| Win rate on *resolved* leads | **69.2%** |
| Win rate on *all* leads | 1.15% |

### The story to tell

**Before:** a jewelry site that produced a handful of vague enquiries a month, each needing manual quoting.

**After:** ~625 fully-specced ring enquiries a month, each carrying diamond type, shape, size, quality, setting, band, metal, personalization, timeline, contact details, inspiration images, and a price estimate the customer already accepted seeing — flowing automatically into their CRM as contacts, opportunities, and mapped custom fields with zero manual entry.

**The honest, credible framing (this is what makes the case study persuasive rather than hypey):**
> The form didn't just increase leads — it moved the bottleneck. DTT closes **69% of the leads they actually work**. Their constraint is no longer demand generation; it's follow-up capacity. 3,847 leads sit open, most at the earliest stage, and every lost deal died at "Hot Lead" — the follow-up gap, not the closing ability.

That framing does three things for marketing:
1. It's believable — we're not claiming a magic conversion rate.
2. It reframes the value: *JewlX solves the demand problem so completely that staffing follow-up becomes the new priority.*
3. It's the natural upsell: CRM automation, JewlX Agent, and automated nurture sequences are the answer to the bottleneck JewlX itself created.

**High-value deals lost at Hot Lead stage** (recovery opportunity, useful for a "speed-to-lead" content angle): $5,800, $4,500, $4,000 — all lost after showing real intent.

**Lead sources in the won column:** Engagement Ring Consultation bookings, incoming calls (including Instagram), direct messages, and the Ring Estimate website form. Consultation bookings are both the biggest won source and the biggest lost source — proof that the intake is working and the follow-up cadence is the variable.

### Standardization — DTT → platform product

The form built for DTT performed so well it was generalized into a platform-wide product:
- Now a per-client feature toggle with its own configuration surface (step order, colours, copy, option lists, per-option images, submission mode).
- Live for **9 client accounts**, with **3,647 total quote-estimator leads** captured platform-wide.
- DTT alone accounts for 3,459 of those (~95%) — because they're the longest-running deployment and drive the most traffic to it, not because it only works for them. Newer deployments are early in their ramp.

**Marketing implication:** this is a product-led proof loop — "we built it for one jeweler, it 10x'd their enquiry volume, so we shipped it to everyone." That's a story worth its own landing page, case study PDF, and paid-social creative set.

---

## 6. Platform-wide proof points and metrics library

Use these with the caveats attached. Do not round up or restate them as industry-wide claims.

| Stat | Value | Caveat / source |
|---|---|---|
| Quote Estimator leads captured, all clients | 3,647 | Platform DB, all time to 21 Aug 2026 |
| Quote Estimator leads, DTT | 3,459 | Platform DB, since 4 Mar 2026 |
| Client accounts live with Instant Quote | 9 | Platform DB |
| Client accounts on the platform | 23 total, 18 active | Platform DB |
| Custom Enquiry leads captured | 353 | Platform DB, all clients, all time |
| Grillz Builder leads captured | 165 | Platform DB |
| Metal IQ leads captured | 145 | Platform DB |
| Custom X design requests | 249 | Platform DB |
| Total unified form leads | 767 | Excludes Instant Quote table |
| Appointments booked through widgets | 38 | Platform DB |
| CAD requests raised | 26 | Platform DB |
| Avg quoted ring value (DTT) | ~$4,317 | Customer-selected configuration value, not closed revenue |
| Avg closed deal value (DTT) | ~$2,950 | Client CRM |
| Win rate on worked leads (DTT) | 69.2% | Client CRM, resolved leads only — **always state "of leads they actively worked"** |

**Claims that are safe to make:**
- "One JewlX client captured over 3,400 fully-specced ring enquiries in under six months."
- "Our largest deployment averages more than 600 qualified ring enquiries a month."
- "Average requested ring value across those enquiries: ~$4,300."
- "That client closes ~69% of the enquiries they actively follow up."

**Claims to avoid:**
- Any platform-wide "average customer sees X% lift" — we don't have a controlled before/after baseline.
- Presenting quoted pipeline value ($14.9M) as revenue. It's requested-ring value only.
- Using the 1.15% all-leads win rate without the follow-up-capacity context; it reads badly out of context.

---

## 7. Messaging assets

### Value proposition by product

- **Ring OS** — *"Your diamonds. Your prices. A ring builder as good as the big online retailers, on your own website."*
- **Instant Quote** — *"Give every visitor a price in 90 seconds — and get their ring spec, budget, and contact details in return."*
- **Custom X** — *"Turn 'can you make this?' into a briefed, deposited, AI-visualized order."*
- **Grillz Builder** — *"Teeth-level configuration, iced or plain, priced and deposited on your site."*
- **Metal IQ** — *"Instant gold payout estimates, live-priced, on your margins."*
- **JewlX Agent** — *"A jewelry-trained AI that sells while you sleep — and never quotes a price you didn't set."*

### Before / after narrative (the core story arc)

| | Before JewlX | With JewlX |
|---|---|---|
| Website role | Brochure | Salesperson |
| Enquiry content | "Hi, interested in a ring" | Shape, carat, quality, metal, setting, budget, timeline, images, estimate |
| Response time | Hours to days, manual | Instant estimate + automatic confirmation email |
| Quoting | Manual, per lead | Automated from the jeweler's own price rules |
| Lead volume | A trickle | Hundreds per month (DTT: ~625/mo) |
| CRM | Copy-paste or nothing | Auto-created contact, opportunity, and full spec |
| Consultations | Unqualified | Pre-qualified with a known budget |

### Sample headlines
- "Your website should be quoting rings while you sleep."
- "3,459 ring enquiries in five months. One jeweler. One form."
- "Stop losing bridal buyers to Blue Nile."
- "Every enquiry, fully specced. Every time."
- "The ring builder your customers already expect."
- "What's my gold worth? Answer it instantly — and get the lead."

### Content angles that write themselves
1. Speed-to-lead: the DTT "Hot Lead" drop-off data as a cautionary tale.
2. "Should jewelers show prices online?" — estimate mode as the middle ground.
3. AI renders in jewelry retail: what's credible, what isn't.
4. Anatomy of a high-converting jewelry quote form (step-by-step teardown).
5. Local jeweler vs online giant: the experience gap, and closing it.
6. Deposit vs. free enquiry — the $0-deposit friction debate, with both sides.

---

## 8. Marketing surface inventory

**Currently live:**
- `jewlx.ai` marketing presence and published product site.
- Client-facing portals: `builder.jewlx.ai`, `admin.jewlx.ai`, `vault.jewlx.ai`.
- Embedded widgets on every client's own website — a distributed brand surface (branding visibility is a per-client toggle).
- Stripe payment links per plan (direct-purchase capable, usable as ad landing destinations).
- 30-day free trials on Custom X and JewlX Suite.
- Transactional email system (27 branded templates) reaching both jewelers and their end customers.

**Under-used / not yet built out (strategy opportunities):**
- Public case-study library — DTT is the obvious first one and is currently untold publicly.
- Interactive public demo of the Instant Quote form (highest-converting asset we could build; the product demos itself).
- Comparison pages vs. Shopify option apps, Punchmark, and DIY forms.
- Jeweler-facing content/SEO engine (currently no consistent programme).
- Partner/referral channel: jewelry web agencies, Shopify Plus partners, CAD studios, diamond suppliers.
- Industry presence: JCK, IJL, trade associations, jeweler Facebook/Reddit communities.
- Client-facing co-marketing: widgets on client sites are shop-window placements we can formalize.

---

## 9. Open questions for the strategist

These are **not** in the platform data — an AI tool producing strategy should ask or the team should supply them:

1. Current CAC and by which channel (paid, outbound, referral, inbound)?
2. Trial → paid conversion rate on Custom X and Suite?
3. Monthly churn and net revenue retention?
4. Sales cycle length and how deals actually close today (self-serve vs. demo-led)?
5. Current MRR and plan mix across the 18 active clients?
6. Geographic concentration (Canada/US-heavy? which metros)?
7. Who runs sales — founder-led, or a team?
8. Current marketing spend and channels in use?
9. Is the $4,999 license a conversion blocker in observed deals?
10. What does onboarding time-to-live look like, and who does the work?

---

## 10. Quick-reference fact sheet (for pasting into a prompt)

```
Company: JewlX — AI configurator & lead-gen platform for jewelers
ICP: Jewelers and jewelry store owners (bridal, custom, grillz, gold buyers)
Delivery: Embeddable white-label widgets + client dashboard; no replatform
Products: Ring OS | Custom X (Ring Builder, Grillz, Custom Enquiry) |
          Instant Quote (Quote Estimator) | Metal IQ | JewlX Agent
Platform: Unified CRM, GoHighLevel + Shopify integrations, bookings, orders,
          CAD pipeline, analytics, Meta Pixel/CAPI + GTM, branded emails,
          multi-currency, AI credit wallet, staff roles, domain-locked embeds
Pricing: Metal IQ $297/mo · Custom X $497/mo · Ring OS $897/mo + $4,999 license
         JewlX Suite $1,297/mo + $4,999 license · Elite $1,999/mo + $19k+ onboarding
         30-day trials on Custom X & Suite; metered AI credits on top
Scale: 23 client accounts (18 active); 3,647 Instant Quote leads platform-wide
Flagship proof (Diamond Touch Toronto, Toronto engagement-ring retailer):
  - 3,459 quote-estimator leads since 4 Mar 2026 (~625/month)
  - ~$4,317 average requested ring value per enquiry
  - Client CRM (6 months): 3,912 leads, 45 won, ~$133K won revenue,
    C$228.37K won all-time, ~$2,950 avg deal, 69.2% win rate on worked leads
  - Bottleneck moved from lead generation to follow-up capacity
Positioning wedge: give local jewelers the online buying experience their
  customers already expect from Blue Nile / Brilliant Earth
Brand: pure black, white text, emerald/lime accents, minimal, no emojis
```

---

*All platform figures verified against the JewlX production database on 21 August 2026. CRM figures supplied by the Diamond Touch Toronto CRM review covering 21 Feb – 21 Aug 2026.*
