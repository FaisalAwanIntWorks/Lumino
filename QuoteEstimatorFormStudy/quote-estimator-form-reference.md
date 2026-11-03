# Quote Estimator Form — Complete Technical Reference

**Internal names:** "DTT Form", "Diamonds Form", embed variant `?variant=dtt`
**Feature flag:** `dtt_v2` (per-client, admin-controlled, default OFF)
**Origin client:** Diamond Touch Toronto — `aeec6491-bd1f-4787-97f9-6a47a2ddc8af`
**Dashboard route:** `/dashboard/diamonds-form?tab=dtt-form`
**Public embed route:** `/embed-diamonds/:clientId?variant=dtt`

---

## 1. Overview

The Quote Estimator Form is a linear, step-by-step diamond ring quoting configurator. It shares its step components with the newer wizard-based Ring Builder, but runs its own flow engine, its own per-client configuration table (`client_dtt_form_config`), its own lead table (`diamond_form_leads`), and its own CRM MVMNT (GoHighLevel) sync pipeline driven by a Postgres `AFTER INSERT` trigger.

Three surfaces exist in the client dashboard:

| Tab | Purpose | Primary file |
|---|---|---|
| **Preview** | Live render of the configured form | `src/pages/client/DiamondsForm.tsx` |
| **Configure** | Colors, step toggles, step order, per-option overrides, submission mode | `src/components/dtt-form-config/DttFormConfigure.tsx` |
| **Embed Code** | Generates responsive iframe snippet with `?variant=dtt` | `src/lib/diamond-form-embed.ts` |

---

## 2. Dashboard page — Preview / Configure / Embed Code

### `src/pages/client/DiamondsForm.tsx` (~1303 lines)

Hosts the whole tabbed experience.

| Line ref | Role |
|---|---|
| `:31` | imports `generateDiamondsFormEmbedCode` (Embed Code tab) |
| `:41` | imports `DttFormConfigure` (Configure tab) |
| `:47` | `DTT_CLIENT_ID` constant |
| `:202` | `isQuoteEstimatorContext = isDTT \|\| tabParam === 'dtt-form'` |
| `:206` | `useClientDttFormConfig(clientId)` |
| `:219-249` | Builds `ORDERED_STEPS` / `activeStepIndices` from `step_order` + `enabled_steps` |

Renders all 15 diamonds-form step components inline for the Preview tab, using the exact same components the public embed uses — so preview matches production output.

### Configure UI — `src/components/dtt-form-config/DttFormConfigure.tsx` (~357 lines)

| Line ref | Role |
|---|---|
| `:19-37` | `CONFIGURABLE_STEPS` / `OPTION_STEPS` definitions |
| `:62-63` | `useClientDttFormConfig` + `useAllDiamondFormOptions` |
| rest | Editors for `form_colors`, `enabled_steps`, `step_order` (drag reorder), `submission_mode`, `deposit_amount`, per-option enable/disable, per-option custom image override, Select All / Clear All per step |

Writes are upserts into `client_dtt_form_config`, followed by React Query cache invalidation so Preview updates instantly.

### Embed Code tab — `src/lib/diamond-form-embed.ts`

- `getDiamondsFormUrl(clientId, variant?)`
- `generateDiamondsFormEmbedCode(clientId, height, allowedDomains, variant)` — when `variant === 'dtt'`, appends `?variant=dtt` to the iframe `src` and emits the responsive iframe + `jewlx-resize` postMessage listener snippet.

---

## 3. Public embed page

### `src/pages/EmbedDiamondsForm.tsx` (~321 lines)

| Line ref | Role |
|---|---|
| `:43` | `useEmbedAutoHeight()` — posts `jewlx-ready` / `jewlx-resize` to parent iframe |
| `:48` | `isClassicMode = isDTT \|\| searchParams.get('variant') === 'dtt'` |
| `:86` | `supabase.rpc('get_client_branding', ...)` |
| `:89-95` | **Access gate** — classic mode requires `enabled_features.dtt_v2 === true`; default OFF |
| `:112-167` | Domain whitelist enforcement via `document.referrer` |
| `:178-186` | Builds `orderedStepKeys` from `enabled_steps` + `step_order` |
| `:225-256` | Meta Pixel / CAPI `Lead` event on contact submit |

When `dtt_v2` is OFF, the embedded widget refuses to render — identical behaviour to Ring OS / Custom X / Metal IQ gating.

---

## 4. Step components — `src/components/diamonds-form/`

All are `clientId`-aware so per-client option overrides apply.

| File | Lines | Role |
|---|---|---|
| `DiamondFormWelcome.tsx` | 29 | Intro screen, `onStart` |
| `DiamondTypeStep.tsx` | 76 | Natural vs Lab — `diamond_nature_options` |
| `DiamondShapeStep.tsx` | 72 | `diamond_shape_options` |
| `DiamondSizeStep.tsx` | 102 | `diamond_size_options`, price display |
| `DiamondQualityStep.tsx` | 84 | `diamond_quality_options` |
| `DiamondSettingStep.tsx` | 89 | `ring_setting_options` |
| `DiamondHolderStep.tsx` | 87 | `diamond_holder_options` |
| `DiamondBandStep.tsx` | 84 | `band_type_options` |
| `DiamondBandWidthStep.tsx` | 88 | `band_width_options` (multi-select) |
| `DiamondMetalStep.tsx` | 108 | `ring_metal_options` |
| `DiamondPersonalizationStep.tsx` | 117 | `personalization_options` (multi-select) |
| `DiamondInspirationStep.tsx` | 180 | Image upload, ring size, notes |
| `DiamondTimelineStep.tsx` | 75 | Delivery timeline w/ pricing |
| `DiamondContactStep.tsx` | 208 | Name / email / phone / consent |
| `DiamondEstimateSummary.tsx` | 488 | Total calc, image upload to `diamond-inspiration` bucket, insert into `diamond_form_leads` (`:198-222`), DTT-only Pabbly webhook (`:234+`) |

Lead ID is generated client-side (`crypto.randomUUID()`) because anonymous RLS allows `SELECT` on the `id` column only.

---

## 5. Hooks

| File | Role |
|---|---|
| `src/hooks/useClientDttFormConfig.ts` | React Query select of `client_dtt_form_config` by `client_id`; exports `ClientDttFormConfig` / `DttFormColors` types |
| `src/hooks/useDiamondFormOptions.ts` | Single option table fetch; uses RPC `get_client_diamond_form_options` when `clientId` present (applies overrides); `TABLE_TO_STEP` map |
| `src/hooks/useAllDiamondFormOptions.ts` | All 10 option tables in one RPC call, grouped by step, with Promise.all fallback |
| `src/hooks/useEmbedAutoHeight.ts` | `jewlx-resize` postMessage sizing |
| `src/hooks/useEmbedBootstrap.ts` | Shared embed bootstrap (domain + flag + pixel); `EmbedDiamondsForm` re-implements this inline |
| `src/hooks/useClientFeatures.ts` | `dtt_v2` flag: interface `:16`, default `false` `:29`, hydration `:89`, tracked list `:112` |

---

## 6. Libraries

| File | Role |
|---|---|
| `src/lib/diamond-form-embed.ts` | Embed URL + iframe snippet generator, `variant` param |
| `src/lib/diamond-form-cdn.ts` | `getDiamondFormImageUrl` — DTT legacy CloudFront mapping (`DTT_LEGACY_CDN_BASE`); override for `personalization_options.low-profile` `:14-17` |
| `src/lib/diamond-form-storage.ts` | `getStorageImageUrl` — `diamond-form-assets` bucket public URLs |
| `src/lib/client-nav-config.ts` | `DTT_FORM_EXPOSED_CLIENT_IDS` `:52`, `showDTTForm = !!features.dtt_v2` `:71`, nav entry "Quote Estimator Form" → `?tab=dtt-form`, `locked: !features.dtt_v2` `:75` |

---

## 7. Database

### `client_dtt_form_config`

| Column | Type |
|---|---|
| `id` | uuid PK |
| `client_id` | uuid UNIQUE FK → `clients` |
| `form_colors` | jsonb (`background`, `tabBorder`, `fontColor`, `imageBg`, `submitButtonBg`, `submitButtonText`) |
| `enabled_steps` | jsonb (`{ stepKey: boolean }`) |
| `step_order` | jsonb (string[]) |
| `submission_mode` | text CHECK IN (`deposit`,`contact`) DEFAULT `contact` |
| `deposit_amount` | numeric |
| `onboarding_completed` | boolean DEFAULT false |
| `created_at` / `updated_at` | timestamptz |

RLS: public SELECT (embeds need it), owner + agency_admin manage. Grants: `SELECT` to `anon`, full CRUD to `authenticated`. Trigger `trg_client_dtt_form_config_updated`.

### `diamond_form_leads`

`id`, `client_id`, `first_name`, `email`, `country_code`, `phone_number`, `sms_consent`, `marketing_consent`, `diamond_type`, `diamond_shape`, `diamond_size`, `diamond_quality`, `diamond_setting`, `diamond_holder`, `diamond_band`, `diamond_band_width text[]`, `diamond_metal`, `diamond_personalization text[]`, `ring_size`, `other_details`, `diamond_timeline`, `estimated_total numeric`, `inspiration_image_urls`, `created_at`, `updated_at`.

RLS: `anon` INSERT only + `SELECT (id)` only; client owner / staff / agency_admin may SELECT & DELETE. Included in the `supabase_realtime` publication.

### Option tables (10)

`diamond_nature_options`, `diamond_shape_options`, `diamond_size_options`, `diamond_quality_options`, `ring_setting_options`, `diamond_holder_options`, `band_type_options`, `band_width_options`, `ring_metal_options`, `personalization_options`.

Each: `id`, `name`, `option_value`, `price`, `image_url`, `display_order`. RLS: public SELECT, agency_admin manage.

### RPCs

| RPC | Role |
|---|---|
| `get_client_branding(client_uuid)` | Returns `enabled_features` (incl. `dtt_v2`), `allowed_domains`, `meta_pixel_id`, `subscription_active` |
| `get_client_diamond_form_options(client_uuid)` | Unions all 10 option tables with per-client overrides / enabled flags |

---

## 8. Migrations

| Migration | Purpose |
|---|---|
| `20260209044715_9e568351-*.sql` | Creates the 10 diamond form option tables + DTT seed data (CloudFront image URLs) |
| `20260209133923_6ce5bc14-*.sql` | Creates `diamond_form_leads` + RLS + `updated_at` trigger + realtime publication |
| `20260225135200`, `20260307080943`, `20260314142503`, `20260326201602`, `20260330123058`, `20260408002513`, `20260411154720`, `20260422182534`, `20260422200100`, `20260423000002_polling-hot-path-indexes.sql` | Incremental grants, columns (incl. `inspiration_image_urls`) and indexes on the lead/option tables |
| `20260624110321_*`, `20260624111341_280876c5-*`, `20260624112446_*`, `20260624112645_9593c938-*`, `20260624113314_*` | GHL sync wiring: grants for `anon`/`authenticated`/`service_role`, `trigger_dtt_ghl_sync()` SECURITY DEFINER function (`net.http_post` → `sync-dtt-ghl-lead`), trigger `trg_dtt_ghl_sync_after_diamond_form_insert`, anon SELECT restricted to `id`, test-row cleanup |
| `20260626120000_ghl-trigger-config-driven-key.sql` | Moves the trigger's service key to config-driven lookup (`cron_config` / `dtt_ghl_trigger_secret`) |
| `20260626174641_b6900820-*.sql` | Follow-up trigger/config grants |
| `20260720190936_5819efaa-*.sql` | Creates `client_dtt_form_config` (Configure tab backing table) + grants + RLS |
| `20260721165502_45a9cdd0-*.sql` | Image URL fix for `diamond_shape_options` (radiant) |
| `20260721180720_ee8da352-*.sql` | Enables `enabled_features.dtt_v2 = true` for the DTT client |

---

## 9. Edge functions

| Function | Lines | Role |
|---|---|---|
| `supabase/functions/sync-dtt-ghl-lead/index.ts` | 357 | Invoked by the DB trigger on lead insert. Guarded to the DTT client id (`:118`). Creates/reuses GHL contact, opportunity, note with full lead dump, and translated custom fields. Logs stages to `ghl_sync_logs` for idempotent retry. Requires service-role auth. |
| `supabase/functions/backfill-dtt-ghl-leads/index.ts` | 266 | Agency-admin-only batch re-sync of custom fields + tags for historic leads. |
| `supabase/functions/ghl-fetch-metadata/index.ts` | 86 | Admin-only; fetches GHL pipelines/stages/custom fields for mapping dropdowns using `DTT_GHL_PRIVATE_TOKEN`. |
| `supabase/functions/test-ghl-connection/index.ts` | 54 | Admin-only connection/health verification for a GHL location. |

Supporting shared module: `supabase/functions/_shared/dtt-ghl-value-map.ts` — translates internal option slugs to GHL picklist labels.

> `notify-form-lead` is **not** part of this flow — it serves Ring Builder / Grillz / Custom Enquiry. Quote Estimator notifications go through the GHL trigger and the DTT Pabbly webhook.

---

## 10. End-to-end data flow

```
Embed iframe (/embed-diamonds/:clientId?variant=dtt)
  └─ get_client_branding  →  dtt_v2 flag + allowed_domains gate
  └─ useClientDttFormConfig  →  colors / enabled_steps / step_order
  └─ get_client_diamond_form_options  →  per-client option overrides
       ↓ user completes steps
  DiamondEstimateSummary
       ├─ uploads inspiration images → storage bucket `diamond-inspiration`
       ├─ INSERT INTO diamond_form_leads (anon, client-generated uuid)
       └─ POST Pabbly webhook (DTT only)
             ↓ AFTER INSERT trigger
       trg_dtt_ghl_sync_after_diamond_form_insert
             ↓ net.http_post (service key from cron_config)
       sync-dtt-ghl-lead edge function
             ├─ GHL contact (create/reuse)
             ├─ GHL opportunity  (name template = {customer_name})
             ├─ GHL note (full lead dump)
             └─ 13 mapped custom fields
                   ↓
             ghl_sync_logs (audit / retry)
```

---

## 11. Access control summary

1. Admin toggles **DTT V2** in Settings → Client Access → writes `clients.enabled_features.dtt_v2`.
2. `useClientFeatures` hydrates the flag; `client-nav-config.ts` shows/locks the "Quote Estimator Form" sidebar item.
3. `EmbedDiamondsForm.tsx` re-checks `dtt_v2 === true` server-side via `get_client_branding` — embed code stops working when the toggle is OFF, matching Ring OS / Custom X / Metal IQ behaviour.
4. Domain whitelist is enforced separately via `document.referrer` against `allowed_domains`.
