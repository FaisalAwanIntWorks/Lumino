# Ring OS Widget — JewlX Agent Reference

Complete map of all source files, edge functions, database migrations, and configuration touchpoints that power the **Ring OS Widget's JewlX AI Chat Agent** on the JewlX platform.

Use `supabase/functions/ring-chat/index.ts` (backend brain) and `src/components/ring-builder/ChatAssistant.tsx` (frontend UI) as the two starting points.

---

## 1. Frontend — Chat UI Components

| File | Purpose |
|------|---------|
| `src/components/ring-builder/ChatAssistant.tsx` | Main chat panel — sends/receives messages, calls `ring-chat` edge function, handles APPLY_CONFIG directives |
| `src/components/ring-builder/StreamingMessage.tsx` | Typewriter/streaming assistant message bubble |
| `src/components/ring-builder/AICraftingAnimation.tsx` | Loading / "AI is crafting" animation |
| `src/components/ring-builder/WizardRingBuilder.tsx` | Wizard host that mounts the chat side-panel |
| `src/components/ring-builder/ConfigurationPanel.tsx` | Receives APPLY_CONFIG updates from the agent |
| `src/components/ring-builder/ElegantConfigurationPanel.tsx` | Themed alternate configuration panel |

---

## 2. Frontend — Hooks / Helpers

| File | Purpose |
|------|---------|
| `src/lib/ring-config-helpers.ts` | `getNextRelevantStep`, `isCheckoutReady`, `resolveDiamondFromPresets`, `resolveDiamondForBudget` — pricing + step resolution used by APPLY_CONFIG |
| `src/hooks/useRingConfiguration.ts` | Ring configuration state consumed by the chat |
| `src/hooks/useClientDiamondPresets.ts` | Diamond presets used during APPLY_CONFIG diamond resolution |
| `src/lib/rate-limit-client.ts` | Client-side rate limiting wrapper for chat calls |
| `src/lib/xss-sanitizer.ts` | Sanitizes chat input/output |
| `src/lib/embed-utils.ts` | Embed / widget bootstrap helpers (feature-gates `jewlx_agent`) |

---

## 3. Frontend — Pages / Entry Points

| File | Purpose |
|------|---------|
| `src/pages/RingBuilder.tsx` | Main Ring Builder page (Ring OS) |
| `src/pages/CustomRingBuilder.tsx` | Custom ring builder variant |
| `src/pages/EmbedConfigurator.tsx` | Public iframe widget entry — hosts the JewlX Agent chat |
| `src/pages/Ring3DDemo.tsx` | 3D demo page with the chat side-panel |
| `src/pages/client/Embed.tsx` | Client portal embed configuration (toggles JewlX Agent visibility) |
| `src/App.tsx` | Route registration for the above |

---

## 4. Feature Gating & Access Control

| File | Purpose |
|------|---------|
| `src/components/admin/ClientFeatureMatrix.tsx` | Admin toggle for `jewlx_agent` per client (grouped under Ring OS) |
| `src/hooks/useClientFeatures.ts` | Resolves `jewlx_agent` flag from `enabled_features` + subscription/impersonation state |
| `src/lib/client-nav-config.ts` | Sidebar entry gating for JewlX Agent |
| `src/pages/admin/Dashboard.tsx` | Admin overview references |

---

## 5. Backend — Edge Functions

| File | Purpose |
|------|---------|
| `supabase/functions/ring-chat/index.ts` | **Main AI chat edge function** — Lovable Gateway → OpenRouter → OpenAI fallback chain, APPLY_CONFIG protocol, pricing enforcement, 45s timeout cap |
| `supabase/functions/_shared/ai-quota.ts` | Credit / quota checks used by `ring-chat` |
| `supabase/functions/ai-intelligence-stats/index.ts` | Aggregates `ring-chat` usage for the AI Intelligence Center |
| `supabase/functions/enforce-subscription-grace/index.ts` | Enforces subscription state that gates `jewlx_agent` |
| `supabase/functions/stripe-webhook/index.ts` | Subscription events that flip the `jewlx_agent` feature flag |
| `supabase/config.toml` | Function configuration (`verify_jwt`, etc.) for `ring-chat` |

---

## 6. Database — Migrations

Chat sessions, messages, AI usage logging, credit ledger, feature flags, and pricing schema:

- `supabase/migrations/20260210080754_27f987d7-616c-4b36-b0b3-0b8b3706c4f3.sql`
- `supabase/migrations/20260210081103_83ea47f5-69a0-4ad7-b183-96dbbe85227c.sql`
- `supabase/migrations/20260318184616_9a718b20-4e9a-4d40-a93b-fe7ba301f5b9.sql`
- `supabase/migrations/20260329120404_4d017aa3-f2cc-4f60-89b7-1ef2e60eac6c.sql`
- `supabase/migrations/20260402204608_415cb84b-3ac2-488a-b424-ce801e01d1dd.sql`
- `supabase/migrations/20260406225445_26c1894f-3c86-4c20-94b2-aa826f8724e9.sql`
- `supabase/migrations/20260407010454_e052ba81-a658-4baf-93f5-f0c279b3eda6.sql`
- `supabase/migrations/20260407021523_634f17f2-b937-423c-8570-7a58072e6974.sql`
- `supabase/migrations/20260407022822_f97ecd05-d40b-4758-9cb6-fc136403979d.sql`
- `supabase/migrations/20260407025411_b0272d01-8dd5-4c4b-a44d-e97bf01f15e0.sql`
- `supabase/migrations/20260407034853_c00f6aaa-9cfd-46c5-ae82-10e7ca276c64.sql`
- `supabase/migrations/20260411171037_b10cc40f-1b13-42ef-8488-10bdc1c0b1f8.sql`
- `supabase/migrations/20260416130424_8906adb4-8934-45fd-b391-ada775157a6e.sql`
- `supabase/migrations/20260416150000_rename-free-credits-columns-to-dollars.sql`
- `supabase/migrations/20260420113119_09a98b74-dbfc-46ef-974b-3c2c1527ef66.sql`
- `supabase/migrations/20260420141449_d8e9a17b-b87c-4ae1-8768-26b5ce7efc67.sql`
- `supabase/migrations/20260427125350_e35a98e8-ca56-4c9e-bf44-879ef9fc070e.sql`
- `supabase/migrations/20260603120000_diamond-catalog-attributes.sql`
- `supabase/migrations/20260605171844_fbaa393e-a1df-4fa9-a568-8e36a7d380b2.sql`
- `supabase/migrations/20260627063635_485127b0-68a8-404e-9312-aef6405ce5b1.sql`
- `supabase/migrations/20260710125340_acaec822-f4ff-4b22-892a-959895eefd6a.sql`

---

## 7. Admin Views Consuming Chat Data

| File | Purpose |
|------|---------|
| `src/pages/admin/AIDataCenter.tsx` | Conversation transcripts & analytics |
| `src/pages/admin/ProductAnalytics.tsx` | Funnel analytics including chat events |
| `src/components/settings/AiUsageTabContent.tsx` | Per-client AI usage from chat |
| `src/components/settings/AiUsageSection.tsx` | AI usage summary section |

---

## 8. API Endpoint

- **Edge function URL:** `POST https://<project>.supabase.co/functions/v1/ring-chat`
- **Payload:** `{ messages, ringConfiguration, clientId, sessionId, ... }`
- **Response:** streamed assistant text + APPLY_CONFIG directives

---

## 9. Key Architectural Notes

- **APPLY_CONFIG protocol** — structured directive returned by the agent to drive the configurator UI (see `features/ai-agent/architecture-and-ux` memory).
- **Pricing logic** — Ring Price = Style + Shank + Metal + Diamond. Carat is a **filter**, not a standalone price.
- **AI fallback chain** — Lovable Gateway → OpenRouter → OpenAI.
- **Timeout cap** — 45 seconds (per cost-optimization strategy).
- **Credit billing** — Dynamic per-token; free credits debited first.
- **Feature flag** — `jewlx_agent` under Ring OS group in `client_features.enabled_features`.

---

## 10. Where to Start

1. **Backend brain:** `supabase/functions/ring-chat/index.ts`
2. **Frontend UI:** `src/components/ring-builder/ChatAssistant.tsx`
3. **Widget entry:** `src/pages/EmbedConfigurator.tsx`
4. **Feature gate:** `src/hooks/useClientFeatures.ts` + `src/components/admin/ClientFeatureMatrix.tsx`
