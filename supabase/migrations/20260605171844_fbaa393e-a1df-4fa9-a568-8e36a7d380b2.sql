UPDATE public.clients
SET enabled_features = COALESCE(enabled_features, '{}'::jsonb)
  || jsonb_build_object('embed_branding', true, 'jewlx_agent', true)
WHERE id = '9d43af60-4e42-4b48-ac9a-b0fa9e608385';