-- Create RPC function to encrypt and store Shopify Storefront token
CREATE OR REPLACE FUNCTION public.encrypt_storefront_token(client_user_id uuid, token text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  UPDATE clients
  SET shopify_storefront_token_encrypted = pgp_sym_encrypt(
    token,
    get_encryption_key()
  )
  WHERE user_id = client_user_id;
END;
$function$;