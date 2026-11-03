UPDATE public.clients
SET enabled_features = COALESCE(enabled_features, '{}'::jsonb) || '{"metal_buying": true}'::jsonb
WHERE id = '9732d0a9-0917-4b42-b2ae-70aa956927cd';