-- ── CRM MVMNT (GoHighLevel) sync for completed Shopify orders ───────────────
-- Until now the CRM pipeline covered every *lead* surface but not the purchase
-- itself: a shopper who finished the Ring OS "Add to Cart" flow went to Shopify
-- checkout and the resulting order landed only in public.orders (plus order
-- notifications and the Meta CAPI Purchase event). Nothing reached CRM MVMNT.
--
-- This migration adds the missing surface:
--
--   order → orders   (Shopify checkout that started in a JewlX widget)
--
-- Everything else is reused as-is: the per-(client, form_type) config rows, the
-- per-form field mappings, the audit log and the generic sync-crm-lead function
-- all key off form_type and already handle a new one without changes. The
-- registry entry lives in supabase/functions/_shared/crm-form-registry.ts.
--
-- SAFETY:
--   * Purely additive. No existing trigger, function or constraint is altered.
--   * public.orders is written by exactly one place — the shopify-order-webhook
--     edge function — and that function already de-duplicates on
--     shopify_order_id, so AFTER INSERT fires once per real order.
--   * trigger_crm_form_sync() returns early unless an admin has enabled the
--     'order' tab for that client and picked a Location ID, so no client starts
--     pushing orders to CRM without opting in.

COMMENT ON COLUMN public.client_ghl_integrations.form_type IS
  'Which lead surface this row configures: diamond | grillz | enquiry | metal | ring_request | ring_design | appointment | order.';

DROP TRIGGER IF EXISTS trg_crm_sync_orders ON public.orders;
CREATE TRIGGER trg_crm_sync_orders
  AFTER INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.trigger_crm_form_sync('order');