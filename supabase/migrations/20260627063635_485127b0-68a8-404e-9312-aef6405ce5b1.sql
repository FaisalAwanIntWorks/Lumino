-- Backfill: clients with RingOS enabled (product_catalogue true) should also have
-- embed_branding (Widget) and jewlx_agent (JewlX Agent) enabled, since these are
-- part of the unified RingOS product group.
update public.clients
set enabled_features = enabled_features
  || jsonb_build_object(
       'embed_branding', coalesce((enabled_features->>'product_catalogue')::boolean, true),
       'jewlx_agent',    coalesce((enabled_features->>'product_catalogue')::boolean, true)
     )
where coalesce((enabled_features->>'product_catalogue')::boolean, true) = true
  and (
    (enabled_features->>'embed_branding') is distinct from 'true'
    or (enabled_features->>'jewlx_agent') is distinct from 'true'
  );