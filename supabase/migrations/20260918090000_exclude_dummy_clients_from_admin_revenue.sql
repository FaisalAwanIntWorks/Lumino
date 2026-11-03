-- =====================================================================
-- Two more dummy accounts out of the platform (admin, all-clients)
-- Ring OS revenue. Both hold seeded demo orders, not Shopify sales:
--   Lumière Fine Jewelry  59 'jewlx-widget' orders, ~$830k
--   Demo Client           client@demo.com
-- Same flag as 20260917120000_ringos_revenue_rpc.sql; each account still
-- sees its own revenue on its own dashboard.
-- Lumière is matched by id (its email isn't recorded here), Demo Client
-- by email.
-- =====================================================================
UPDATE public.clients
   SET exclude_from_admin_revenue = true
 WHERE id = '65a0bc7d-84e2-4591-ba6c-ef4f4a6517ac'   -- Lumière Fine Jewelry
    OR lower(email) = 'client@demo.com';              -- Demo Client
