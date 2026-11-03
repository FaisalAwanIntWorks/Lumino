UPDATE public.client_metal_buying_config
SET cta_config = jsonb_build_object(
  'book_url', COALESCE(cta_config->>'book_url',''),
  'call_number', regexp_replace(COALESCE(cta_config->>'call_number',''), '^\s*(tel|sms|callto|call)\s*:\s*', '', 'i'),
  'text_number', regexp_replace(COALESCE(cta_config->>'text_number',''), '^\s*(tel|sms|callto|call)\s*:\s*', '', 'i')
)
WHERE cta_config->>'call_number' ~* '^\s*(tel|sms|callto|call)\s*:'
   OR cta_config->>'text_number' ~* '^\s*(tel|sms|callto|call)\s*:';