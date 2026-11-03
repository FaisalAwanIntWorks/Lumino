-- Update encrypt_shopify_token function to remove reference to deleted column
CREATE OR REPLACE FUNCTION public.encrypt_shopify_token(client_user_id uuid, token text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
BEGIN
  UPDATE clients
  SET shopify_access_token_encrypted = pgp_sym_encrypt(
    token,
    get_encryption_key()
  )
  WHERE user_id = client_user_id;
END;
$$;