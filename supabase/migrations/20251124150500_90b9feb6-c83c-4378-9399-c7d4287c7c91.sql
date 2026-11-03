-- Fix search_path for encryption/decryption functions to include extensions schema

-- Update decrypt_shopify_token function
CREATE OR REPLACE FUNCTION decrypt_shopify_token(client_user_id UUID)
RETURNS TEXT
SECURITY DEFINER
SET search_path = public, extensions
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

-- Update encrypt_shopify_token function
CREATE OR REPLACE FUNCTION encrypt_shopify_token(
  client_user_id UUID,
  token TEXT
)
RETURNS VOID
SECURITY DEFINER
SET search_path = public, extensions
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE clients
  SET shopify_access_token_encrypted = pgp_sym_encrypt(
    token,
    get_encryption_key()
  ),
  shopify_access_token = NULL
  WHERE user_id = client_user_id;
END;
$$;

-- Update decrypt_crm_api_key function
CREATE OR REPLACE FUNCTION decrypt_crm_api_key(integration_id UUID)
RETURNS TEXT
SECURITY DEFINER
SET search_path = public, extensions
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

-- Update encrypt_crm_api_key function
CREATE OR REPLACE FUNCTION encrypt_crm_api_key(
  integration_id UUID,
  key TEXT
)
RETURNS VOID
SECURITY DEFINER
SET search_path = public, extensions
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE crm_integrations
  SET api_key_encrypted = pgp_sym_encrypt(
    key,
    get_encryption_key()
  ),
  api_key = NULL
  WHERE id = integration_id;
END;
$$;
