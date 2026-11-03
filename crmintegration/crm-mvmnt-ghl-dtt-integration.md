# CRM MVMNT Integration (Diamond Touch Toronto) — Source Reference

Internal name: **GoHighLevel (GHL) Integration**, branded as **CRM MVMNT** in the client UI.
Scope: Client account `Diamond Touch Toronto` (`client_id = aeec6491-bd1f-4787-97f9-6a47a2ddc8af`).
Purpose: Direct sync of Diamond Form leads → CRM MVMNT (GHL) subaccount (contact + opportunity + custom fields), replacing the legacy Pabbly workflow.

---

## 1. Frontend (Admin / Client Settings UI)

| File | Purpose |
|---|---|
| `src/components/settings/GoHighLevelIntegrationCard.tsx` | The full "CRM MVMNT Integration" card shown in the screenshot — Location ID, Pipeline, Stage, Opportunity name template, Monetary value source, Custom Field Mapping, "Load from CRM MVMNT", "Add mapping", Enabled toggle. Reads/writes `client_ghl_integrations` and `client_ghl_field_mappings`. Calls the metadata + test edge functions. |
| `src/pages/client/Settings.tsx` | Mounts `<GoHighLevelIntegrationCard />` inside the client Settings page (rendered under "Viewing as Diamond touch Toronto"). |
| `src/integrations/supabase/types.ts` | Auto-generated typings for `client_ghl_integrations`, `client_ghl_field_mappings`, `ghl_sync_logs`. Do NOT edit manually. |

---

## 2. Database — Tables

All in schema `public`.

| Table | Role |
|---|---|
| `client_ghl_integrations` | Per-client config row: `enabled`, `location_id`, `pipeline_id`, `pipeline_stage_id`, `opportunity_status`, `opportunity_name_template`, `monetary_value_source`, timestamps. |
| `client_ghl_field_mappings` | Per-client mapping rows: `question_key` (DB column on `diamond_form_leads`) → `ghl_custom_field_id` + optional `label`. |
| `ghl_sync_logs` | Audit log of every sync attempt: `lead_id`, `stage` (`contact` / `opportunity` / `custom_fields` / `backfill` / `tag`), `status`, `ghl_contact_id`, `ghl_response` (JSONB), `error`. |
| `diamond_form_leads` | Source-of-truth lead table that triggers the sync on INSERT. |

### Trigger

- `trg_dtt_ghl_sync_after_diamond_form_insert` on `diamond_form_leads` AFTER INSERT — calls the `sync-dtt-ghl-lead` edge function via `pg_net` for DTT only (`client_id = aeec6491-...`).

---

## 3. Database — Migrations

Listed in execution order (most relevant first).

| Migration | What it does |
|---|---|
| `supabase/migrations/20260621142037_9a62acec-f1b2-4b0c-bc7e-59db3fb24acd.sql` | Creates `client_ghl_integrations`, `client_ghl_field_mappings`, `ghl_sync_logs` + RLS + GRANTs. |
| `supabase/migrations/20260621142927_cb63700f-5e56-4226-94ea-4b471f6beab0.sql` | Adds the AFTER INSERT trigger on `diamond_form_leads` that invokes `sync-dtt-ghl-lead` via `pg_net` (DTT-scoped). |
| `supabase/migrations/20260624111341_280876c5-573b-41a3-bac6-569014bba405.sql` | Hardens the trigger / sync path after the `vkonlinee@gmail.com` outage. |
| `supabase/migrations/20260624112446_e3d02b26-8071-4525-8c2e-e61d3a859bdd.sql` | Restores RLS + GRANTs on `diamond_form_leads` so the widget (anon) can insert leads again. |
| `supabase/migrations/20260624113314_ce8001b1-c887-4ea2-b57c-c05faf140762.sql` | Final GRANT fix for `diamond_form_leads` after the dry-run audit. |
| `supabase/migrations/20260624123831_6bf2e117-8b9c-41aa-8648-7e102aa5b23f.sql` | Sets DTT `opportunity_name_template` to `{customer_name}` (drops the `Diamond Form —` prefix). |

---

## 4. Edge Functions

All under `supabase/functions/`.

| Function | Method | Called by | Purpose |
|---|---|---|---|
| `sync-dtt-ghl-lead` | POST | DB trigger on `diamond_form_leads` INSERT | Core sync: upsert GHL contact → create opportunity → push custom fields (with picklist-label translation). Writes to `ghl_sync_logs`. |
| `ghl-fetch-metadata` | POST | `GoHighLevelIntegrationCard` ("Load from CRM MVMNT" / "Load fields from CRM MVMNT") | Fetches Pipelines (with stages) and Custom Fields from GHL location using `DTT_GHL_PRIVATE_TOKEN`. |
| `test-ghl-connection` | POST | `GoHighLevelIntegrationCard` (test button) | Verifies the stored GHL token can read the supplied `location_id`. |
| `backfill-dtt-ghl-leads` | POST | Admin one-shot tool | Re-pushes historical DTT leads, overwrites contact custom fields, tags `backfill-retrigger`. DTT-only guard. |

### Shared helper

- `supabase/functions/_shared/dtt-ghl-value-map.ts` — `fetchGhlFieldMeta()` + `translateMappingValue()`. Translates DB slugs (e.g. `classic-2mm`) into the actual GHL picklist labels (RADIO / SINGLE / MULTI options) so custom field writes don't get rejected.

---

## 5. External API Endpoints (GoHighLevel / CRM MVMNT)

Base URL: `https://services.leadconnectorhq.com`
Headers: `Authorization: Bearer ${DTT_GHL_PRIVATE_TOKEN}`, `Version: 2021-07-28`, `Content-Type: application/json`.

| Endpoint | Used in | Purpose |
|---|---|---|
| `GET /locations/{locationId}` | `test-ghl-connection` | Verify token + location access. |
| `GET /locations/{locationId}/customFields?model=contact` | `ghl-fetch-metadata`, `sync-dtt-ghl-lead`, `backfill-dtt-ghl-leads` | List GHL contact custom fields (with picklist options). |
| `GET /opportunities/pipelines?locationId=...` | `ghl-fetch-metadata` | List pipelines + stages. |
| `GET /contacts/search/duplicate?locationId=...&email=...` | `sync-dtt-ghl-lead`, `backfill-dtt-ghl-leads` | Find existing contact by email. |
| `GET /contacts/search/duplicate?locationId=...&phone=...` | `sync-dtt-ghl-lead`, `backfill-dtt-ghl-leads` | Fallback lookup by E.164 phone. |
| `POST /contacts/` | `sync-dtt-ghl-lead` | Create new contact when no duplicate exists. |
| `PUT /contacts/{contactId}` | `sync-dtt-ghl-lead`, `backfill-dtt-ghl-leads` | Update custom fields on existing contact. |
| `POST /contacts/{contactId}/tags` | `backfill-dtt-ghl-leads` | Tag `backfill-retrigger` so a GHL workflow re-fires. |
| `POST /opportunities/` | `sync-dtt-ghl-lead` | Create opportunity (name from `opportunity_name_template`, value from `monetary_value_source`). |

---

## 6. Secrets

| Secret | Where | Used by |
|---|---|---|
| `DTT_GHL_PRIVATE_TOKEN` | Supabase Edge Function env | All 4 edge functions above. |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase Edge Function env | `sync-dtt-ghl-lead`, `backfill-dtt-ghl-leads` (writes to `ghl_sync_logs`, reads config). |
| `SUPABASE_URL` | Supabase Edge Function env | All edge functions. |

---

## 7. End-to-End Flow

```
Diamond Form Widget (anon)
   └─► INSERT INTO public.diamond_form_leads (RLS allows anon INSERT)
         └─► AFTER INSERT trigger trg_dtt_ghl_sync_after_diamond_form_insert
               └─► pg_net.http_post → supabase/functions/sync-dtt-ghl-lead
                     ├─► GET /contacts/search/duplicate  (email → phone fallback)
                     ├─► POST /contacts/  OR  PUT /contacts/{id}  (custom fields translated via dtt-ghl-value-map.ts)
                     ├─► POST /opportunities/  (name = {customer_name})
                     └─► INSERT INTO public.ghl_sync_logs  (stage-by-stage audit)
```

Admin UI (`GoHighLevelIntegrationCard`) configures everything via `client_ghl_integrations` + `client_ghl_field_mappings`, and uses `ghl-fetch-metadata` / `test-ghl-connection` to populate dropdowns and verify the token. `backfill-dtt-ghl-leads` is a manual recovery tool for past leads.

---

## 8. How the Admin Makes the Connection (Step-by-step)

The connection is **not** an OAuth flow. It is a GHL **Private Integration Token** (agency-side secret) plus a per-client config row written from the Settings UI.

### 8.1 One-time secret setup (platform side)
1. In the GHL sub-account (Diamond Touch Toronto) → Settings → Private Integrations, create a token with scopes:
   `contacts.readonly`, `contacts.write`, `opportunities.readonly`, `opportunities.write`, `locations/customFields.readonly`, `locations.readonly`.
2. Store it in Lovable Cloud secrets as `DTT_GHL_PRIVATE_TOKEN`.
   All four edge functions read it via `Deno.env.get("DTT_GHL_PRIVATE_TOKEN")` — it is never sent to the browser.

### 8.2 Admin UI flow (`GoHighLevelIntegrationCard.tsx`)
```
Admin opens Client → Settings → "CRM MVMNT Integration"
  1. Paste Location ID  (GHL sub-account ID)
  2. Click "Test connection"        → POST /functions/v1/test-ghl-connection
                                       → GET /locations/{locationId}
  3. Click "Load from CRM MVMNT"    → POST /functions/v1/ghl-fetch-metadata { resource: "pipelines" }
                                       → populates Pipeline + Stage dropdowns
  4. Pick Pipeline, Stage, Opportunity status
  5. Opportunity name template      → "{customer_name}" for DTT
     Monetary value source          → e.g. estimated_total
  6. Click "Load fields from CRM MVMNT"
                                    → POST /functions/v1/ghl-fetch-metadata { resource: "custom_fields" }
  7. "Add mapping" rows: lead column (question_key) → GHL custom field id
  8. Toggle "Enabled" → row saved to client_ghl_integrations,
     mapping rows upserted into client_ghl_field_mappings
```

### 8.3 What each save writes
| UI control | Table.column |
|---|---|
| Location ID | `client_ghl_integrations.location_id` |
| Pipeline / Stage | `pipeline_id`, `pipeline_stage_id` |
| Opportunity status | `opportunity_status` |
| Opportunity name template | `opportunity_name_template` (DTT = `{customer_name}`) |
| Monetary value source | `monetary_value_source` |
| Enabled toggle | `enabled` |
| Each mapping row | `client_ghl_field_mappings(question_key, ghl_custom_field_id, label)` |

### 8.4 Authorization model
- `ghl-fetch-metadata`, `test-ghl-connection`, `backfill-dtt-ghl-leads` → `requireAgencyAdmin()` in `supabase/functions/_shared/ghl-auth.ts` (JWT → `user_roles.role = 'agency_admin'`).
- `sync-dtt-ghl-lead` → `requireServiceRole()`: accepts the service-role JWT **or** header `x-trigger-secret` matching `public.cron_config.dtt_ghl_trigger_secret` (pg_net cannot carry the service key).

### 8.5 Value translation layer
`supabase/functions/_shared/dtt-ghl-value-map.ts`
- `DTT_SLUG_TO_LABEL` maps DB slugs (`classic-2mm`) → exact GHL picklist labels (`Classic 2mm(+$0)`), including price suffixes.
- `fetchGhlFieldMeta(token, locationId)` pulls each field's `dataType` + `picklistOptions` once per sync.
- `translateMappingValue()` picks array vs string form (`MULTIPLE_OPTIONS`/`CHECKBOX` → array), and records a warning when a label is absent from the picklist so blank-dropdown bugs are visible in `ghl_sync_logs`.
- Phone normalisation is shared via `_shared/dtt-phone.ts` (`toE164`) so contact create and duplicate lookup never disagree — this is what prevents duplicate contacts.

### 8.6 Scoping / blast radius
Everything is DTT-scoped:
- Trigger body checks `client_id = 'aeec6491-bd1f-4787-97f9-6a47a2ddc8af'`.
- `backfill-dtt-ghl-leads` has an explicit DTT-only guard.
- Config is per-row in `client_ghl_integrations`, so other clients are untouched even if the UI card is rendered.

### 8.7 Troubleshooting checklist
| Symptom | Where to look |
|---|---|
| No opportunity created | `ghl_sync_logs` rows with `stage='opportunity'`, plus edge function logs for `sync-dtt-ghl-lead` |
| Custom fields blank in GHL | `ghl_response.warnings` — label not in picklist → update `DTT_SLUG_TO_LABEL` |
| Duplicate contacts | phone/email mismatch — verify `toE164` output on both paths |
| Trigger never fires | `cron_config.dtt_ghl_trigger_secret` present and matching; `pg_net` enabled |
| 401 from edge function | Missing/expired `DTT_GHL_PRIVATE_TOKEN`, or caller lacks `agency_admin` role |
| Historical leads missing | Run `backfill-dtt-ghl-leads` (tags `backfill-retrigger` to re-fire GHL workflows) |
