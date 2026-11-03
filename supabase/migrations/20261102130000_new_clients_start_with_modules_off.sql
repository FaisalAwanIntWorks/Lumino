-- ── New clients start with every module OFF ──────────────────────────────
--
-- Clients created from the admin panel / signup (create-client-user) used to
-- get the column default, which switched Ring OS Catalog, Orders, Widget,
-- JewlX Agent and Ring Builder ON (and the embeds treat a missing key such as
-- grillz_builder / custom_enquiry as ON too). An admin now switches every
-- module on by hand, so the default lists every module key explicitly false.
--
-- Keep the key list in sync with src/lib/feature-registry.ts and
-- supabase/functions/_shared/feature-registry.ts (MODULES_OFF_FEATURE_SET).
-- Existing clients keep their current modules — only new rows are affected.

ALTER TABLE public.clients
  ALTER COLUMN enabled_features SET DEFAULT jsonb_build_object(
    'product_catalogue', false,
    'orders',            false,
    'embed_branding',    false,
    'jewlx_agent',       false,
    'diamond_form',      false,
    'dtt_v2',            false,
    'grillz_builder',    false,
    'custom_enquiry',    false,
    'metal_buying',      false,
    'experimental_ui',   false
  );
