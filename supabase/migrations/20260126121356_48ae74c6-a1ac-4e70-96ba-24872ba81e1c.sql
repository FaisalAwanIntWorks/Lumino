
-- Remove unencrypted api_key column from crm_integrations
-- All API keys should use the api_key_encrypted column instead
ALTER TABLE public.crm_integrations DROP COLUMN IF EXISTS api_key;
