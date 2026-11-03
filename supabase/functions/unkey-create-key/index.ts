import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { createApiKey, getUnkeyConfig, corsHeaders } from '../_shared/unkey.ts';
import { denyReadOnlyAdmin } from "../_shared/admin-access.ts";

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Read-only admin staff must not perform any write operation.
  const readOnlyDenied = await denyReadOnlyAdmin(req, corsHeaders);
  if (readOnlyDenied) return readOnlyDenied;

  try {
    // Verify admin auth
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const userId = claimsData.claims.sub as string;

    // Check admin role
    const adminSupabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { data: roleData } = await adminSupabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .single();

    if (!roleData || roleData.role !== 'agency_admin') {
      return new Response(JSON.stringify({ error: 'Admin access required' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();
    const { clientId, name, expiresInDays, rateLimit } = body;

    if (!clientId) {
      return new Response(JSON.stringify({ error: 'clientId is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Verify client exists
    const { data: client } = await adminSupabase
      .from('clients')
      .select('id, company_name')
      .eq('id', clientId)
      .single();

    if (!client) {
      return new Response(JSON.stringify({ error: 'Client not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { apiId } = getUnkeyConfig();

    const result = await createApiKey({
      apiId,
      name: name || `${client.company_name} API Key`,
      ownerId: clientId,
      prefix: 'jwlx',
      meta: {
        clientId,
        companyName: client.company_name,
        createdBy: userId,
      },
      expires: expiresInDays ? Date.now() + expiresInDays * 86400000 : undefined,
      ratelimit: rateLimit || {
        type: 'fast',
        limit: 100,
        refillRate: 100,
        refillInterval: 60000, // 100 requests per minute
      },
    });

    return new Response(JSON.stringify({
      keyId: result.keyId,
      key: result.key,
      message: 'API key created. Save this key — it won\'t be shown again.',
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('unkey-create-key error:', error instanceof Error ? error.message : 'Unknown');
    return new Response(JSON.stringify({ error: 'Failed to create API key' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
