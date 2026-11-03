# CRM MVMNT — All Forms + Ring OS (multi-surface sync)

Extends the Diamond-Form-only CRM MVMNT (GoHighLevel) integration to **every lead surface on
the platform**, each independently configurable from the client Settings card.

Companion doc: `crm-mvmnt-ghl-dtt-integration.md` (the original Diamond Form / DTT wiring —
still accurate for that one form, but note it lists stale column names: the real columns are
`stage_id` and `value_source`, not `pipeline_stage_id` / `monetary_value_source`).

---

## 1. Surfaces covered

| `form_type` | Widget / page | Source table | Synced by |
|---|---|---|---|
| `diamond` | Quote Estimator (Diamond Form) | `diamond_form_leads` | `sync-dtt-ghl-lead` *(unchanged)* |
| `grillz` | Grillz Builder | `grill_form_leads` | `sync-crm-lead` |
| `enquiry` | Custom Enquiry (CustomX) | `custom_enquiry_leads` | `sync-crm-lead` |
| `metal` | Metal IQ (metal buying) | `metal_buying_leads` | `sync-crm-lead` |
| `ring_request` | Ring Builder (Custom X) | `design_requests` | `sync-crm-lead` |
| `ring_design` | Ring OS — saved configuration | `saved_designs` | `sync-crm-lead` |
| `appointment` | Ring OS / Metal IQ — booking | `appointment_bookings` | `sync-crm-lead` |
| `order` | Completed Shopify checkout from any JewlX widget | `orders` | `sync-crm-lead` |

**The Diamond Form path was deliberately preserved.** `trigger_dtt_ghl_sync()` and
`trg_dtt_ghl_sync_after_diamond_form_insert` are untouched, and `sync-crm-lead` explicitly
refuses `form_type = 'diamond'`.

One **mandatory** change was needed inside `sync-dtt-ghl-lead` and `backfill-dtt-ghl-leads`:
both loaded their config with `.eq("client_id", …).maybeSingle()`. Once a client also has a
grillz/enquiry/metal/ring row, `maybeSingle()` errors on multiple rows — `cfg` would come back
null and the Diamond Form would silently stop syncing. Both now filter
`.eq("form_type", "diamond")`, which is behaviour-identical today because every pre-existing row
defaults to `'diamond'`. **These two functions must be redeployed with the migration.**

---

## 2. Data model

Everything reuses the existing three tables — they simply gained a `form_type` dimension.

| Table | Change |
|---|---|
| `client_ghl_integrations` | `+ form_type` (default `'diamond'`), `+ create_opportunity`, `+ create_note`, `+ contact_source`, `+ contact_tags text[]`. `UNIQUE(client_id)` → `UNIQUE(client_id, form_type)`. |
| `client_ghl_field_mappings` | `+ form_type` (default `'diamond'`). `UNIQUE(client_id, question_key)` → `UNIQUE(client_id, form_type, question_key)`. |
| `ghl_sync_logs` | `+ form_type` (default `'diamond'`) + index `(form_type, lead_id)` so per-stage idempotency stays scoped to one surface. |
| `client_ghl_credentials` | Unchanged — the Private Integration Token is per **client**, shared by every form. |

Because `form_type` defaults to `'diamond'`, every pre-existing row keeps working with no data
migration. RLS policies are unchanged (agency admin / client owner / assigned staff).

`value_source` semantics (unchanged, now generalised): `'none'`, `'fixed'` (uses `fixed_value`),
or **the name of a numeric column** on that form's lead table. Dotted JSON paths are allowed,
e.g. `configuration.stone.price` for a saved Ring OS design.

---

## 3. Trigger

One generic function serves all six new tables; the form type is passed as a trigger argument.

```sql
public.trigger_crm_form_sync()   -- TG_ARGV[0] = form_type
```

- Skips silently when `NEW.client_id IS NULL` (`appointment_bookings.client_id` is nullable).
- Fires **only** when an enabled `client_ghl_integrations` row with a `location_id` exists for
  that `(client_id, form_type)`. No unconditional branch — unlike the DTT/Diamond trigger.
- Same transport as the Diamond trigger: URL + `anon_key` + `dtt_ghl_trigger_secret` read from
  `public.cron_config`, `POST` via `pg_net` with header `x-trigger-secret`.

Triggers created: `trg_crm_sync_grill_form_leads`, `trg_crm_sync_custom_enquiry_leads`,
`trg_crm_sync_metal_buying_leads`, `trg_crm_sync_design_requests`,
`trg_crm_sync_saved_designs`, `trg_crm_sync_appointment_bookings`,
`trg_crm_sync_orders` (added by `20260826120000_crm_sync_shopify_orders.sql`).

> Note: `design_requests` is also written from the client portal (`src/pages/client/DesignRequests.tsx`),
> so a jeweler manually logging a request will also push it to CRM once `ring_request` is enabled.

---

## 4. Files

| File | Role |
|---|---|
| `supabase/migrations/20260804120000_crm-multi-form-sync.sql` | Schema + generic trigger + the six triggers. |
| `supabase/functions/_shared/crm-form-registry.ts` | **Source of truth.** Per-form table, contact columns, mappable question keys, value columns, JSON flattening (JSONB *and* JSON-in-TEXT), slug prettifying. |
| `supabase/functions/sync-crm-lead/index.ts` | Generic sync: contact → opportunity → note → custom fields, with retry + per-stage idempotency. |
| `src/lib/crm-form-registry.ts` | UI mirror of the registry (tab list, question keys, value columns). Keep in sync with the `_shared` one. |
| `src/components/settings/GoHighLevelIntegrationCard.tsx` | Reworked settings card: one shared Connection block + one tab per form. |

Reused unchanged: `_shared/ghl-auth.ts` (`requireServiceRole`, `getClientGhlToken`),
`_shared/dtt-ghl-value-map.ts` (`fetchGhlFieldMeta`, `translateMappingValue`),
`_shared/dtt-phone.ts` (`toE164`).

---

## 5. Nested / JSON answers

### 5.1 Ring Builder (Custom X)

The Ring Builder wizard does **not** get a column per answer. It writes one JSON blob into
`design_requests.description`, which is a plain TEXT column:

```json
{ "selections": { "nature": "lab-grown", "shape": "round", "metal": "14k-yellow-gold", ... },
  "multiSelections": { "personalization": ["engraving", "milgrain"] },
  "ringSize": "6.5", "budget": "$3,001 - $6,000",
  "additionalNotes": "...", "otherDetails": "...", "engravingText": "..." }
```

`jsonTextColumns: ['description']` makes `expandJsonTextColumns()` parse it before mapping, so
every answer becomes an ordinary dotted key and can be mapped to its own CRM custom field:

```
description.selections.nature    description.selections.band        description.ringSize
description.selections.shape     description.selections.band_width  description.budget
description.selections.size      description.selections.metal       description.engravingText
description.selections.quality   description.selections.karat       description.additionalNotes
description.selections.setting   description.selections.personalization
description.selections.holder    description.selections.timeline    description.otherDetails
```

`multiSelections` is folded over `selections`, so the multi-select Personalization step maps
through the same `description.selections.personalization` key as a single-select one would.

A `description` that is **not** JSON — a request typed by hand in the client portal
(`src/pages/client/DesignRequests.tsx`) — is left as the plain text it is and still syncs; only
the dotted keys come back empty for it.

Selection values are catalog slugs, so the same prettifier used for Ring OS applies
(`lab-grown` → `Lab Grown`). Numeric ranges keep their hyphen: `1-2-weeks` → `1-2 Weeks`.

### 5.2 Ring OS

Ring OS stores its configuration as JSONB (`saved_designs.configuration`,
`appointment_bookings.ring_configuration`). The registry flattens it into dotted keys so each
attribute is individually mappable to a CRM custom field:

```
configuration.style            configuration.stone.type      configuration.engraving.enabled
configuration.shank            configuration.stone.carat     configuration.engraving.text
configuration.metal            configuration.stone.color     configuration.engraving.bandWidth
configuration.shape            configuration.stone.clarity   configuration.engraving.otherRequest
configuration.caratRange       configuration.stone.price
configuration.size             configuration.stone.reportNo
```

Catalog attributes (`style`, `shank`, `metal`, `shape`, `stone.type`) are stored as slugs
(`three-stone`, `14k-yellow`). They are **prettified** to `Three Stone` / `14k Yellow` before
being sent, so CRM shows readable text. For picklist custom fields, the existing
`matchPicklistOption()` normaliser then matches them against the client's live CRM options.

The note attached to the contact contains the whole submission, with the ring configuration
expanded leaf by leaf.

---

### 5.3 Shopify orders (`order`)

`orders` is the only surface that is *not* a form. It is written by one place only —
`shopify-order-webhook`, when Shopify posts a `JewlX`-sourced order back (detected via the
`_source` line-item attribute / note attribute). The webhook already skips duplicate
`shopify_order_id`, so `AFTER INSERT` fires exactly once per real order.

**Where the data lives.** The webhook copies every Shopify line-item property onto
`orders.configuration` as a flat key, so the ring the shopper configured in Ring OS arrives as
`configuration.Style`, `configuration.Metal`, `configuration.Stone Carat`, … — the literal
attribute names `shopify-add-to-cart` writes, spaces and capitals included. Grillz and Custom
Enquiry orders bring their own property names (`Metal Type`, `Top Teeth`, `Jewelry Type`, …),
and all of them are listed in `ORDER_CONFIG_KEYS` in the registry.

**Contact identity.** `orders` has no phone column; Shopify puts the number on the shipping
address. The registry therefore uses a *dotted* contact path, `customer_shipping.phone`, and
`resolvePhone()` / `resolveCustomerName()` in `sync-crm-lead` resolve `contact.*` through
`getLeadValue()` so a dotted path works exactly like a column name.

**Note hygiene.** `noteSkipKeys` drops the plumbing that would otherwise bloat the CRM note:
`configuration.line_items` (a JSON array whose every field is already flattened above it) and
Shopify's internal `_source` / `_client_id` / `_pricing_mode` / `_catalog_item_id` attributes.

**Monetary value.** Default `value_source` is `total_amount` — the real amount paid, which makes
this the one surface where the CRM opportunity value is a fact rather than an estimate. Default
opportunity name is `Order {configuration.shopify_order_number} — {customer_name}`.

> **Expected double entry for Grillz / Custom Enquiry.** The webhook already cross-posts those
> orders into `grill_form_leads` / `custom_enquiry_leads`, which have their own CRM triggers. With
> both tabs enabled, one purchase produces a lead entry *and* an order entry in CRM. That is
> intentional (the lead is the enquiry, the order is the purchase) — turn off one tab if the
> client wants a single entry. Ring OS "Add to Cart" orders are not cross-posted, so they produce
> one entry only.

---

## 6. Phone handling

Every widget except the Diamond Form already writes `customer_phone` in E.164 (they call
`formatPhoneE164` before insert). `resolvePhone()` therefore only prefixes a dialling code when
the stored value clearly lacks one, which is what prevents `+1+1416…` on
`metal_buying_leads` (which stores `country_code` separately *and* bakes it into the phone).

`contact.phone` may also be a **dotted path** rather than a column — `orders` uses
`customer_shipping.phone`. An order with no shipping phone still syncs on `customer_email` alone;
only a row with neither email nor phone is rejected (`422`, logged as stage `contact`).

---

## 7. Admin flow

```
Client → Settings → "CRM MVMNT Integration"

  Connection (shared by all forms)
    1. Paste Private Integration Token           → save-ghl-credentials (server-side only)
    2. Paste Location ID → "Test connection"     → test-ghl-connection

  Then per tab (Quote Estimator / Ring Builder / Grillz / Custom Enquiry / Metal IQ /
                Ring OS Saved Design / Ring OS Appointment):
    3. Enabled toggle
    4. "Load from CRM MVMNT" → pick Pipeline + Stage + Opportunity status
    5. Opportunity name template, Monetary value source
    6. Contact Source, Contact Tags (comma separated)
    7. Create opportunity / Attach full submission as a note toggles
    8. "Load fields from CRM MVMNT" → Add mapping rows (form question → CRM custom field)
    9. "Save <form> settings"
```

Saving writes only the active tab's row + that tab's mappings; the Location ID is propagated to
every form row for the client so all tabs stay pointed at the same sub-account. A green dot on a
tab means that surface is enabled.

The Backfill panel remains DTT + Diamond Form only (the edge function itself guards to DTT).

---

## 8. Deploy

Order matters: push the migration first (it adds `form_type`), then deploy the functions that
now filter on it, then the frontend.

```bash
supabase db push
supabase functions deploy sync-crm-lead sync-dtt-ghl-lead backfill-dtt-ghl-leads backfill-crm-leads
# then deploy the frontend as usual
```

**Preconditions** (already true on this project — the Diamond Form sync depends on them):
- `public.cron_config` holds real values for `supabase_url`, `anon_key`, `dtt_ghl_trigger_secret`.
- `pg_net` extension enabled.

Not affected, no redeploy needed: `ghl-fetch-metadata`, `test-ghl-connection`,
`save-ghl-credentials` (it updates `token_last4` across every form row for the client, which is
the intended behaviour since the token is per client).

**Between `db push` and the function deploy** there is a short window where a client with more
than one form row would break the Diamond sync — but no client has a second row until an admin
creates one in the UI, so pushing and deploying back-to-back is safe.

---

## 9. Troubleshooting

| Symptom | Where to look |
|---|---|
| Form doesn't sync at all | `client_ghl_integrations` row for that `(client_id, form_type)` — `enabled = true` and `location_id` set? The trigger no-ops otherwise. |
| Nothing in `ghl_sync_logs` | Trigger never fired → check `cron_config` keys, then `pg_net` request log. |
| Contact created, no opportunity | `create_opportunity`, `pipeline_id`, `stage_id` on that row; then `ghl_sync_logs` rows with `stage='opportunity'`. |
| Custom field blank in CRM | `ghl_sync_logs.ghl_response.warnings` — the value didn't match a picklist option. Rename the CRM option or map to a TEXT field. |
| Ring Builder answers all blank | `description` wasn't JSON (hand-typed request) — map the plain `description` column instead. |
| Ring attributes show as slugs | The value reached a TEXT field before prettifying could help, or the picklist option text differs — check the warnings above. |
| `422 Lead has no email or phone` | The lead row genuinely has neither; CRM cannot create a contact without one. |
| Duplicate contacts | Compare the E.164 string in `ghl_sync_logs` against the CRM contact — see §6. |
| Need to retry a failed lead | Re-invoke `sync-crm-lead` with `{client_id, lead_id, form_type}`; completed stages are skipped and only the missing ones re-run. |
