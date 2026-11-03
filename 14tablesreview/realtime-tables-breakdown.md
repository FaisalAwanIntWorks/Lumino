# Realtime Tables Breakdown — JewelX

**Generated:** 2026-04-22
**Context:** The 14 tables that were broadcasting via Postgres `supabase_realtime` publication before the cost-optimization patch, what they do, where they're referenced in code, and the migration files that govern them.

---

## Summary

| Status | Count | Tables |
|---|---|---|
| ✅ **KEPT** in realtime publication | 6 | `admin_notifications`, `client_notifications`, `cad_requests`, `cad_request_messages`, `orders`, `clients` |
| ❌ **REMOVED** from realtime (now polled every 45s) | 8 | `saved_designs`, `grill_form_leads`, `custom_enquiry_leads`, `design_requests`, `appointment_bookings`, `metal_buying_leads`, `diamond_form_leads`, `ai_chat_sessions` |

**Optimization migration:** `supabase/migrations/20260422182534_458dcbf2-bea6-4c9e-b91c-c6cbe5879e95.sql`

---

## ✅ KEPT IN REALTIME (6 tables)

These remain in `supabase_realtime` because they drive UX-critical, low-volume events (notification bells, chat messages, status flips).

### 1. `admin_notifications`
**Purpose:** Alerts surfaced to platform admins (new lead, new CAD message, system events).
**Why kept:** Bell icon must blink instantly when something needs attention.
**Frontend references:**
- `src/hooks/useAdminNotifications.ts` — primary subscriber, renders bell badge
- `src/components/cad-requests/CadRequestChat.tsx` — listens for new chat-related notifications
**Migration files:**
- Initial publication add: `supabase/migrations/20260201130106_4a670dc2-650e-4089-809b-c8c19d82e4f9.sql`
- Re-asserted: `supabase/migrations/20260422182534_458dcbf2-bea6-4c9e-b91c-c6cbe5879e95.sql`

---

### 2. `client_notifications`
**Purpose:** Alerts for jeweler/client users (new lead arrived, CAD reply, order status).
**Why kept:** Drives the in-app notification toasts and bell counter on the client portal. Acts as the "instant ping" that triggers polling-driven dashboards to refetch removed tables.
**Frontend references:**
- `src/hooks/useNotifications.ts` — primary subscriber
- `src/hooks/useClientDashboard.ts` — listens for inserts to trigger immediate refetch of leads/orders
- `src/components/cad-requests/CadRequestChat.tsx`
- `src/components/cad-requests/AdminCadRequestDetailView.tsx`
**Migration files:**
- Initial publication add: `supabase/migrations/20260201130106_4a670dc2-650e-4089-809b-c8c19d82e4f9.sql`
- Re-asserted: `supabase/migrations/20260422182534_458dcbf2-bea6-4c9e-b91c-c6cbe5879e95.sql`

---

### 3. `cad_requests`
**Purpose:** CAD design tickets between clients and admin (jewelry production workflow).
**Why kept:** Status changes (new → in_progress → delivered) must reflect immediately for both parties watching the same ticket.
**Frontend references:**
- `src/components/cad-requests/CadRequestsTab.tsx`
- `src/components/cad-requests/CadRequestDetailView.tsx`
- `src/components/cad-requests/AdminCadRequestDetailView.tsx`
- `src/components/customers/ActivityDetailContent.tsx`
- `src/hooks/useCustomerHub.ts`
**Migration files:**
- Publication add: `supabase/migrations/20260209133923_6ce5bc14-b03a-463b-aaf2-df092601475f.sql`
- Re-asserted: `supabase/migrations/20260422182534_458dcbf2-bea6-4c9e-b91c-c6cbe5879e95.sql`

---

### 4. `cad_request_messages`
**Purpose:** Chat messages within a CAD ticket (admin ↔ client conversation).
**Why kept:** A chat that doesn't update in real time is broken — this is true messaging UX.
**Frontend references:**
- `src/components/cad-requests/CadRequestChat.tsx`
**Migration files:**
- Publication add: `supabase/migrations/20260209133923_6ce5bc14-b03a-463b-aaf2-df092601475f.sql`
- Re-asserted: `supabase/migrations/20260422182534_458dcbf2-bea6-4c9e-b91c-c6cbe5879e95.sql`

---

### 5. `orders`
**Purpose:** Customer orders (Shopify deposit checkouts and direct purchases).
**Why kept:** Order status changes (paid, shipped, manufacturing) must reflect live in admin/client dashboards.
**Frontend references:**
- `src/hooks/useClientDashboard.ts`
- `src/hooks/useCustomerHub.ts`
- `src/pages/admin/Orders.tsx`
- `src/pages/admin/Manufacturing.tsx`
- `src/pages/admin/Analytics.tsx`
- `src/pages/admin/ClientDetail.tsx`
- `src/pages/admin/Clients.tsx`
- `src/pages/client/Orders.tsx`
**Migration files:**
- Publication add: `supabase/migrations/20251124161437_9da91122-723f-49c7-b5c5-8b7c83e2fe8e.sql`
- Re-asserted: `supabase/migrations/20260422182534_458dcbf2-bea6-4c9e-b91c-c6cbe5879e95.sql`

---

### 6. `clients`
**Purpose:** Jeweler/retailer master records, including branding config (`branding_config`, logo, colors).
**Why kept:** Live branding sync — when an admin updates a client's theme, the client's preview should reflect immediately. Also drives feature-flag toggles.
**Frontend references:**
- `src/components/admin/ClientFeatureMatrix.tsx`
- `src/components/admin/ProductClientMatrix.tsx`
- `src/components/admin/ai-cost/ClientQuotaManager.tsx`
- `src/components/admin/settings/AdminStaffTabContent.tsx`
- `src/components/layout/DashboardSearch.tsx`
- `src/components/settings/NotificationPreferencesTab.tsx`
**Migration files:**
- Publication add: `supabase/migrations/20260211123246_a8661cea-ca07-4a8c-a18c-1a092d7b4848.sql`
- Re-asserted: `supabase/migrations/20260422182534_458dcbf2-bea6-4c9e-b91c-c6cbe5879e95.sql`

---

## ❌ REMOVED FROM REALTIME (8 tables)

These were the cost drivers — high-write lead tables broadcasting to every connected dashboard tab. They are now refreshed by:
1. **45-second background polling** (`setInterval(refetch, 45000)`)
2. **Window `focus` event** (instant refresh when the user tabs back)
3. **`client_notifications` insert** (still realtime) triggers an immediate refetch when a new lead arrives

**No UX regression** — users still see updates within 45s passively, instantly when they re-focus the tab, and immediately when a notification fires.

---

### 7. `saved_designs`
**Purpose:** Customer-saved Ring OS configurations (lead capture).
**Volume:** High — every "Save Design" click on a public widget.
**Frontend references:**
- `src/hooks/useCustomerHub.ts` — now polled
- `src/components/cad-requests/CadRequestDetailView.tsx`
- `src/components/cad-requests/AdminCadRequestDetailView.tsx`
- `src/pages/admin/Clients.tsx`
**Migration files:**
- Originally added: `supabase/migrations/20260201130106_4a670dc2-650e-4089-809b-c8c19d82e4f9.sql`
- **Removed:** `supabase/migrations/20260422182534_458dcbf2-bea6-4c9e-b91c-c6cbe5879e95.sql`

---

### 8. `grill_form_leads`
**Purpose:** Grillz Builder form submissions.
**Volume:** Medium-high during marketing campaigns.
**Frontend references:**
- `src/hooks/useCustomerHub.ts`
- `src/components/cad-requests/CadRequestDetailView.tsx`
- `src/components/cad-requests/AdminCadRequestDetailView.tsx`
**Migration files:**
- Originally added: `supabase/migrations/20260314142503_d83a7303-01d3-4a72-9e4b-d8ca2b1ee184.sql`
- **Removed:** `supabase/migrations/20260422182534_458dcbf2-bea6-4c9e-b91c-c6cbe5879e95.sql`

---

### 9. `custom_enquiry_leads`
**Purpose:** Custom Enquiry form submissions (custom jewelry requests).
**Volume:** Medium-high.
**Frontend references:**
- `src/hooks/useCustomerHub.ts`
- `src/components/cad-requests/CadRequestDetailView.tsx`
- `src/components/cad-requests/AdminCadRequestDetailView.tsx`
**Migration files:**
- Originally added: `supabase/migrations/20260325172224_cf371cf5-563f-4b2d-837a-d207841dab15.sql`
- **Removed:** `supabase/migrations/20260422182534_458dcbf2-bea6-4c9e-b91c-c6cbe5879e95.sql`

---

### 10. `design_requests`
**Purpose:** Generic design request leads.
**Volume:** Medium.
**Frontend references:**
- `src/pages/admin/DesignRequests.tsx`
- `src/hooks/useCustomerHub.ts`
- `src/pages/admin/Clients.tsx`
- `src/components/cad-requests/CadRequestDetailView.tsx`
- `src/components/cad-requests/AdminCadRequestDetailView.tsx`
**Migration files:**
- Originally added: `supabase/migrations/20260325175528_b893f4dc-d101-458d-ae93-fec835e9eb61.sql`
- **Removed:** `supabase/migrations/20260422182534_458dcbf2-bea6-4c9e-b91c-c6cbe5879e95.sql`

---

### 11. `appointment_bookings`
**Purpose:** "Book Appointment" widget submissions.
**Volume:** Low-medium, but still broadcast on every insert/update.
**Frontend references:**
- `src/hooks/useCustomerHub.ts`
**Migration files:**
- Originally added: `supabase/migrations/20260330103251_5ba6ad6f-3371-4201-a226-f801b9a42857.sql`
- **Removed:** `supabase/migrations/20260422182534_458dcbf2-bea6-4c9e-b91c-c6cbe5879e95.sql`

---

### 12. `metal_buying_leads`
**Purpose:** Metal IQ "sell your gold/silver" lead form submissions.
**Volume:** Medium.
**Frontend references:**
- `src/hooks/useCustomerHub.ts`
- `src/pages/admin/ProductAnalytics.tsx`
**Migration files:**
- Originally added: `supabase/migrations/20260331110214_a9c0f119-abe3-4721-8f83-398f33256d70.sql`
- **Removed:** `supabase/migrations/20260422182534_458dcbf2-bea6-4c9e-b91c-c6cbe5879e95.sql`

---

### 13. `diamond_form_leads`
**Purpose:** Diamond Touch / DTT diamond inquiry form submissions.
**Volume:** Medium during campaigns.
**Frontend references:**
- `src/hooks/useCustomerHub.ts`
**Migration files:**
- Originally added: `supabase/migrations/20260331134237_47652236-7fe3-4c4c-979a-da5601becaaf.sql`
- **Removed:** `supabase/migrations/20260422182534_458dcbf2-bea6-4c9e-b91c-c6cbe5879e95.sql`

---

### 14. `ai_chat_sessions`
**Purpose:** Ring OS AI agent conversations (one row per session, updated as messages flow).
**Volume:** Highest of the bunch — every message in every concurrent AI chat triggered a publication broadcast.
**Frontend references:**
- `src/pages/admin/AIDataCenter.tsx`
- `src/pages/admin/Clients.tsx`
- `src/pages/admin/ProductAnalytics.tsx`
**Migration files:**
- Originally added: `supabase/migrations/20260403010632_e1f320fe-3ef8-43b6-af22-afda5dcbd594.sql`
- **Removed:** `supabase/migrations/20260422182534_458dcbf2-bea6-4c9e-b91c-c6cbe5879e95.sql`

---

## Polling Replacement Pattern

Both dashboards now use a **3-tier hybrid update model** instead of postgres_changes subscriptions for the removed tables:

```ts
// src/hooks/useClientDashboard.ts and src/hooks/useCustomerHub.ts
useEffect(() => {
  fetchData();
  const interval = setInterval(fetchData, 45000);              // (1) background poll
  const onFocus = () => fetchData();                           // (2) instant on tab return
  window.addEventListener('focus', onFocus);

  // (3) Realtime kept ONLY for client_notifications — fires immediate refetch on new lead
  const channel = supabase.channel('client-notifs')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'client_notifications' }, fetchData)
    .subscribe();

  return () => {
    clearInterval(interval);
    window.removeEventListener('focus', onFocus);
    supabase.removeChannel(channel);
  };
}, []);
```

---

## Verification Query

To confirm current publication state at any time:

```sql
SELECT tablename
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime'
ORDER BY tablename;
```

Expected output (6 rows): `admin_notifications`, `cad_request_messages`, `cad_requests`, `client_notifications`, `clients`, `orders`.

---

## Reference Memory

Full strategy documented at: `.lovable/memory/infrastructure/cost-optimization-strategy.md`
