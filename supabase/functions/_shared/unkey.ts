/**
 * Unkey API Key Management Utilities
 * 
 * Provides key verification, creation, listing, and revocation
 * through the Unkey.com API.
 */

export const UNKEY_API_BASE = 'https://api.unkey.dev/v1';

export interface UnkeyVerifyResult {
  valid: boolean;
  ownerId?: string;
  meta?: Record<string, unknown>;
  remaining?: number;
  enabled?: boolean;
  code?: string;
}

export interface UnkeyCreateKeyOptions {
  apiId: string;
  name?: string;
  ownerId?: string;
  meta?: Record<string, unknown>;
  prefix?: string;
  expires?: number; // Unix timestamp in ms
  ratelimit?: {
    type: 'fast' | 'consistent';
    limit: number;
    refillRate: number;
    refillInterval: number; // ms
  };
  remaining?: number; // Total usage limit
}

export interface UnkeyCreateKeyResult {
  keyId: string;
  key: string;
}

export interface UnkeyKeyInfo {
  id: string;
  start: string;
  ownerId?: string;
  meta?: Record<string, unknown>;
  createdAt: number;
  expires?: number;
  remaining?: number;
  enabled: boolean;
  name?: string;
}

/**
 * Get required Unkey secrets from environment.
 * Throws if not configured.
 */
export function getUnkeyConfig(): { rootKey: string; apiId: string } {
  const rootKey = Deno.env.get('UNKEY_ROOT_KEY');
  const apiId = Deno.env.get('UNKEY_API_ID');

  if (!rootKey) {
    console.error('UNKEY_ROOT_KEY not configured');
    throw new Error('Service configuration error');
  }
  if (!apiId) {
    console.error('UNKEY_API_ID not configured');
    throw new Error('Service configuration error');
  }

  return { rootKey, apiId };
}

/**
 * Verify an API key with Unkey.
 * Returns verification result including validity, owner, metadata, and rate limit info.
 */
export async function verifyApiKey(key: string): Promise<UnkeyVerifyResult> {
  const { apiId } = getUnkeyConfig();

  const res = await fetch(`${UNKEY_API_BASE}/keys.verifyKey`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ apiId, key }),
  });

  if (!res.ok) {
    console.error(`Unkey verify failed: ${res.status}`);
    return { valid: false, code: 'VERIFICATION_ERROR' };
  }

  return await res.json();
}

/**
 * Create a new API key via Unkey.
 * Returns the key ID and the full key (shown only once).
 */
export async function createApiKey(options: UnkeyCreateKeyOptions): Promise<UnkeyCreateKeyResult> {
  const { rootKey } = getUnkeyConfig();

  const res = await fetch(`${UNKEY_API_BASE}/keys.createKey`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${rootKey}`,
    },
    body: JSON.stringify(options),
  });

  if (!res.ok) {
    const errBody = await res.text();
    console.error(`Unkey createKey failed [${res.status}]: ${errBody}`);
    throw new Error('Failed to create API key');
  }

  return await res.json();
}

/**
 * List API keys for a specific owner (e.g., client ID).
 */
export async function listApiKeys(ownerId?: string): Promise<{ keys: UnkeyKeyInfo[]; total: number }> {
  const { rootKey, apiId } = getUnkeyConfig();

  const params = new URLSearchParams({ apiId });
  if (ownerId) params.set('ownerId', ownerId);

  const res = await fetch(`${UNKEY_API_BASE}/apis.listKeys?${params.toString()}`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${rootKey}`,
    },
  });

  if (!res.ok) {
    const errBody = await res.text();
    console.error(`Unkey listKeys failed [${res.status}]: ${errBody}`);
    throw new Error('Failed to list API keys');
  }

  return await res.json();
}

/**
 * Revoke (delete) an API key by its key ID.
 */
export async function revokeApiKey(keyId: string): Promise<void> {
  const { rootKey } = getUnkeyConfig();

  const res = await fetch(`${UNKEY_API_BASE}/keys.deleteKey`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${rootKey}`,
    },
    body: JSON.stringify({ keyId }),
  });

  if (!res.ok) {
    const errBody = await res.text();
    console.error(`Unkey deleteKey failed [${res.status}]: ${errBody}`);
    throw new Error('Failed to revoke API key');
  }
}

/**
 * Middleware helper: Extract and verify API key from request headers.
 * Checks `x-api-key` header first, then `Authorization: Bearer <jwlx_...>`.
 * 
 * Returns the verification result or null if no API key provided
 * (meaning the request might be using JWT auth instead).
 */
export async function verifyRequestApiKey(req: Request): Promise<UnkeyVerifyResult | null> {
  // Try x-api-key header first (preferred for API key auth)
  const apiKeyHeader = req.headers.get('x-api-key');
  if (apiKeyHeader) {
    return await verifyApiKey(apiKeyHeader);
  }

  // Try Authorization header — only if it looks like an Unkey key (starts with jwlx_)
  const authHeader = req.headers.get('Authorization');
  if (authHeader?.startsWith('Bearer jwlx_')) {
    const key = authHeader.replace('Bearer ', '');
    return await verifyApiKey(key);
  }

  // No API key found — caller may be using JWT auth
  return null;
}

export interface DualAuthResult {
  /** Auth method used: 'api_key' or 'jwt' */
  method: 'api_key' | 'jwt';
  /** Client ID (from Unkey metadata or from clients table) */
  clientId: string;
  /** User ID (only set for JWT auth) */
  userId?: string;
  /** Unkey verification result (only set for API key auth) */
  unkeyResult?: UnkeyVerifyResult;
}

/**
 * Dual-auth middleware: Supports both Unkey API key and JWT authentication.
 * 
 * Flow:
 * 1. Check for API key (x-api-key header or Bearer jwlx_...)
 *    - If valid: extract clientId from Unkey metadata
 *    - If invalid: return 401
 * 2. Fall back to JWT auth (Bearer <jwt>)
 *    - Verify via supabase.auth.getUser()
 *    - Look up clientId from clients table
 * 3. If neither: return 401
 * 
 * Returns DualAuthResult on success, or a Response (error) to return immediately.
 */
export async function dualAuth(req: Request): Promise<DualAuthResult | Response> {
  const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
  
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  // 1. Try API key auth
  const unkeyResult = await verifyRequestApiKey(req);
  if (unkeyResult !== null) {
    if (!unkeyResult.valid) {
      return new Response(
        JSON.stringify({ error: 'Invalid or expired API key' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const clientId = (unkeyResult.meta as Record<string, string>)?.clientId;
    if (!clientId) {
      console.error('Unkey key missing clientId in metadata');
      return new Response(
        JSON.stringify({ error: 'API key misconfigured' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return {
      method: 'api_key',
      clientId,
      unkeyResult,
    };
  }

  // 2. Fall back to JWT auth
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(
      JSON.stringify({ error: 'Authorization required. Provide an API key or JWT token.' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);

  if (authError || !user) {
    return new Response(
      JSON.stringify({ error: 'Invalid authentication token' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // Look up client ID
  const { data: clientData } = await supabase
    .from('clients')
    .select('id')
    .eq('user_id', user.id)
    .single();

  if (!clientData) {
    // User might be staff — check staff_members
    const { data: staffData } = await supabase
      .from('staff_members')
      .select('client_id')
      .eq('user_id', user.id)
      .single();

    if (staffData) {
      return {
        method: 'jwt',
        clientId: staffData.client_id,
        userId: user.id,
      };
    }

    // Check if agency admin
    const { data: roleData } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .single();

    if (roleData?.role === 'agency_admin') {
      // Admin needs to pass clientId in body/params
      return {
        method: 'jwt',
        clientId: '', // Admin — caller must provide clientId
        userId: user.id,
      };
    }

    return new Response(
      JSON.stringify({ error: 'No client account found' }),
      { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  return {
    method: 'jwt',
    clientId: clientData.id,
    userId: user.id,
  };
}

/**
 * Check if a DualAuthResult from API key auth is rate-limited.
 * Unkey embeds rate limit info in the verification response.
 * Returns a 429 Response if rate-limited, or null if allowed.
 */
export function checkUnkeyRateLimit(authResult: DualAuthResult): Response | null {
  if (authResult.method !== 'api_key' || !authResult.unkeyResult) return null;

  const { remaining } = authResult.unkeyResult;

  // If remaining is defined and 0, the key has hit its rate limit
  if (remaining !== undefined && remaining <= 0) {
    return new Response(
      JSON.stringify({
        error: 'Rate limit exceeded. Please try again later.',
        remaining: 0,
      }),
      {
        status: 429,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }

  return null;
}

/**
 * Standard CORS headers for edge functions with API key support.
 */
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-key, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};
