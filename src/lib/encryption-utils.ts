import { supabase } from '@/integrations/supabase/client';

/**
 * Encrypts and stores a Shopify Admin API access token
 */
export async function encryptShopifyToken(userId: string, token: string): Promise<void> {
  const { error } = await supabase.rpc('encrypt_shopify_token', {
    client_user_id: userId,
    token: token,
  });

  if (error) {
    console.error('Error encrypting Shopify token:', error);
    throw new Error('Failed to encrypt Shopify token');
  }
}

/**
 * Decrypts and retrieves a Shopify Admin API access token
 */
export async function decryptShopifyToken(userId: string): Promise<string | null> {
  const { data, error } = await supabase.rpc('decrypt_shopify_token', {
    client_user_id: userId,
  });

  if (error) {
    console.error('Error decrypting Shopify token:', error);
    return null;
  }

  return data;
}

/**
 * Encrypts and stores a Shopify Storefront API access token
 */
export async function encryptStorefrontToken(userId: string, token: string): Promise<void> {
  const { error } = await supabase.rpc('encrypt_storefront_token', {
    client_user_id: userId,
    token: token,
  });

  if (error) {
    console.error('Error encrypting Storefront token:', error);
    throw new Error('Failed to encrypt Storefront token');
  }
}

/**
 * Decrypts and retrieves a Shopify Storefront API access token
 */
export async function decryptStorefrontToken(userId: string): Promise<string | null> {
  const { data, error } = await supabase.rpc('decrypt_storefront_token', {
    client_user_id: userId,
  });

  if (error) {
    console.error('Error decrypting Storefront token:', error);
    return null;
  }

  return data;
}

/**
 * Encrypts and stores a CRM API key
 */
export async function encryptCrmApiKey(integrationId: string, key: string): Promise<void> {
  const { error } = await supabase.rpc('encrypt_crm_api_key', {
    integration_id: integrationId,
    key: key,
  });

  if (error) {
    console.error('Error encrypting CRM API key:', error);
    throw new Error('Failed to encrypt CRM API key');
  }
}

/**
 * Decrypts and retrieves a CRM API key
 */
export async function decryptCrmApiKey(integrationId: string): Promise<string | null> {
  const { data, error } = await supabase.rpc('decrypt_crm_api_key', {
    integration_id: integrationId,
  });

  if (error) {
    console.error('Error decrypting CRM API key:', error);
    return null;
  }

  return data;
}
