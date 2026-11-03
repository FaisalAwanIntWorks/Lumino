-- Add function to decrypt storefront token
CREATE OR REPLACE FUNCTION public.decrypt_storefront_token(client_user_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  decrypted_token TEXT;
BEGIN
  SELECT pgp_sym_decrypt(
    shopify_storefront_token_encrypted,
    get_encryption_key()
  )::TEXT
  INTO decrypted_token
  FROM clients
  WHERE user_id = client_user_id
  AND shopify_storefront_token_encrypted IS NOT NULL;
  
  RETURN decrypted_token;
END;
$function$;