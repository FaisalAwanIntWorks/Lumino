-- Phase 1A: Enable encryption and add encrypted columns
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Add encrypted columns for Shopify tokens
ALTER TABLE clients 
ADD COLUMN IF NOT EXISTS shopify_access_token_encrypted BYTEA;

-- Add encrypted columns for CRM API keys
ALTER TABLE crm_integrations
ADD COLUMN IF NOT EXISTS api_key_encrypted BYTEA;

-- Create encryption key setting (stored in Supabase secrets)
-- This will be set via ALTER DATABASE but we'll use a placeholder function
CREATE OR REPLACE FUNCTION get_encryption_key()
RETURNS TEXT
LANGUAGE SQL
SECURITY DEFINER
AS $$
  SELECT COALESCE(
    current_setting('app.settings.encryption_key', true),
    'CHANGE_THIS_KEY_IN_PRODUCTION_VIA_SECRETS'
  );
$$;

-- Function to encrypt Shopify token
CREATE OR REPLACE FUNCTION encrypt_shopify_token(
  client_user_id UUID,
  token TEXT
)
RETURNS VOID
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE clients
  SET shopify_access_token_encrypted = pgp_sym_encrypt(
    token,
    get_encryption_key()
  ),
  shopify_access_token = NULL -- Clear plaintext
  WHERE user_id = client_user_id;
END;
$$;

-- Function to decrypt Shopify token
CREATE OR REPLACE FUNCTION decrypt_shopify_token(client_user_id UUID)
RETURNS TEXT
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  decrypted_token TEXT;
BEGIN
  SELECT pgp_sym_decrypt(
    shopify_access_token_encrypted,
    get_encryption_key()
  )::TEXT
  INTO decrypted_token
  FROM clients
  WHERE user_id = client_user_id
  AND shopify_access_token_encrypted IS NOT NULL;
  
  RETURN decrypted_token;
END;
$$;

-- Function to encrypt CRM API key
CREATE OR REPLACE FUNCTION encrypt_crm_api_key(
  integration_id UUID,
  key TEXT
)
RETURNS VOID
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE crm_integrations
  SET api_key_encrypted = pgp_sym_encrypt(
    key,
    get_encryption_key()
  ),
  api_key = NULL -- Clear plaintext
  WHERE id = integration_id;
END;
$$;

-- Function to decrypt CRM API key
CREATE OR REPLACE FUNCTION decrypt_crm_api_key(integration_id UUID)
RETURNS TEXT
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  decrypted_key TEXT;
BEGIN
  SELECT pgp_sym_decrypt(
    api_key_encrypted,
    get_encryption_key()
  )::TEXT
  INTO decrypted_key
  FROM crm_integrations
  WHERE id = integration_id
  AND api_key_encrypted IS NOT NULL;
  
  RETURN decrypted_key;
END;
$$;

-- Migrate existing Shopify tokens to encrypted storage
UPDATE clients
SET shopify_access_token_encrypted = pgp_sym_encrypt(
  shopify_access_token,
  get_encryption_key()
)
WHERE shopify_access_token IS NOT NULL
AND shopify_access_token_encrypted IS NULL;

-- Migrate existing CRM API keys to encrypted storage
UPDATE crm_integrations
SET api_key_encrypted = pgp_sym_encrypt(
  api_key,
  get_encryption_key()
)
WHERE api_key IS NOT NULL
AND api_key_encrypted IS NULL;

-- Phase 1B: Secure storage bucket with RLS policies
CREATE POLICY "Clients can upload to their folder"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'product-assets' AND
  (storage.foldername(name))[1] = get_user_client_id(auth.uid())::TEXT
);

CREATE POLICY "Users can read their client's assets"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'product-assets' AND
  (storage.foldername(name))[1] = get_user_client_id(auth.uid())::TEXT
);

CREATE POLICY "Admins can access all assets"
ON storage.objects FOR ALL
TO authenticated
USING (
  bucket_id = 'product-assets' AND
  has_role(auth.uid(), 'agency_admin'::app_role)
)
WITH CHECK (
  bucket_id = 'product-assets' AND
  has_role(auth.uid(), 'agency_admin'::app_role)
);

-- Make product-assets bucket private (update existing bucket)
UPDATE storage.buckets
SET public = false
WHERE id = 'product-assets';

-- Phase 1D: Create rate limiting table
CREATE TABLE IF NOT EXISTS rate_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  identifier TEXT NOT NULL, -- IP address or user ID
  endpoint TEXT NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 1,
  window_start TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(identifier, endpoint, window_start)
);

-- Index for fast rate limit lookups
CREATE INDEX IF NOT EXISTS idx_rate_limits_lookup 
ON rate_limits(identifier, endpoint, window_start DESC);

-- Auto-cleanup old rate limit records (older than 1 hour)
CREATE OR REPLACE FUNCTION cleanup_old_rate_limits()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM rate_limits
  WHERE window_start < NOW() - INTERVAL '1 hour';
END;
$$;

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON rate_limits TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON rate_limits TO anon;