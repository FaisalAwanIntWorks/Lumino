-- Add webhook secret column to clients table
ALTER TABLE public.clients 
ADD COLUMN IF NOT EXISTS shopify_webhook_secret_encrypted bytea DEFAULT NULL;

-- Create decrypt function for webhook secret
CREATE OR REPLACE FUNCTION public.decrypt_webhook_secret(client_user_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public', 'extensions'
AS $$
DECLARE
  decrypted_secret TEXT;
BEGIN
  SELECT pgp_sym_decrypt(
    shopify_webhook_secret_encrypted,
    get_encryption_key()
  )::TEXT
  INTO decrypted_secret
  FROM clients
  WHERE user_id = client_user_id
  AND shopify_webhook_secret_encrypted IS NOT NULL;
  
  RETURN decrypted_secret;
END;
$$;

-- Create encrypt function for webhook secret
CREATE OR REPLACE FUNCTION public.encrypt_webhook_secret(client_user_id uuid, secret text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public', 'extensions'
AS $$
BEGIN
  UPDATE clients
  SET shopify_webhook_secret_encrypted = pgp_sym_encrypt(
    secret,
    get_encryption_key()
  )
  WHERE user_id = client_user_id;
END;
$$;

-- Add shopify_order_id column to orders table for deduplication
ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS shopify_order_id text DEFAULT NULL;

-- Create unique index for deduplication
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_shopify_order_id 
ON public.orders(shopify_order_id) 
WHERE shopify_order_id IS NOT NULL;

-- Enable realtime for orders table
ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;