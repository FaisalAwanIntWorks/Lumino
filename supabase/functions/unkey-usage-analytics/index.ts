import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-key',
};

const UNKEY_API_BASE = 'https://api.unkey.dev/v1';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Authenticate via JWT
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Determine client ID (from query param for admins, or from user's own client)
    const url = new URL(req.url);
    let clientId = url.searchParams.get('clientId');

    // Get the user's own client
    const { data: ownClientData } = await supabase
      .from('clients')
      .select('id')
      .eq('user_id', user.id)
      .single();

    if (!clientId) {
      clientId = ownClientData?.id || null;
    } else if (clientId !== ownClientData?.id) {
      // If requesting a different client's data, verify user is an admin
      const { data: adminRole } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .eq('role', 'agency_admin')
        .maybeSingle();

      if (!adminRole) {
        return new Response(JSON.stringify({ error: 'Not authorized to view this client\'s analytics' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    if (!clientId) {
      return new Response(JSON.stringify({ error: 'No client found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const rootKey = Deno.env.get('UNKEY_ROOT_KEY');
    const apiId = Deno.env.get('UNKEY_API_ID');
    if (!rootKey || !apiId) {
      return new Response(JSON.stringify({ error: 'Unkey not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 1. List keys for this client
    const keysRes = await fetch(
      `${UNKEY_API_BASE}/apis.listKeys?apiId=${apiId}&ownerId=${clientId}`,
      { headers: { Authorization: `Bearer ${rootKey}` } }
    );
    if (!keysRes.ok) throw new Error('Failed to list keys');
    const keysData = await keysRes.json();
    const keys = keysData.keys || [];

    // 2. Get verifications for each key
    const keyAnalytics = await Promise.all(
      keys.map(async (key: any) => {
        try {
          const verRes = await fetch(
            `${UNKEY_API_BASE}/keys.getVerifications?keyId=${key.id}&granularity=day`,
            { headers: { Authorization: `Bearer ${rootKey}` } }
          );
          if (!verRes.ok) {
            console.error(`Verifications fetch failed for key ${key.id}: ${verRes.status}`);
            return {
              keyId: key.id,
              name: key.name || 'API Key',
              start: key.start,
              enabled: key.enabled,
              createdAt: key.createdAt,
              expires: key.expires,
              remaining: key.remaining,
              verifications: [],
              totalSuccess: 0,
              totalRateLimited: 0,
              totalUsageExceeded: 0,
            };
          }
          const verData = await verRes.json();
          const verifications = verData.verifications || [];

          let totalSuccess = 0;
          let totalRateLimited = 0;
          let totalUsageExceeded = 0;

          for (const v of verifications) {
            totalSuccess += v.success || 0;
            totalRateLimited += v.rateLimited || 0;
            totalUsageExceeded += v.usageExceeded || 0;
          }

          return {
            keyId: key.id,
            name: key.name || 'API Key',
            start: key.start,
            enabled: key.enabled,
            createdAt: key.createdAt,
            expires: key.expires,
            remaining: key.remaining,
            verifications: verifications.slice(-30), // Last 30 days
            totalSuccess,
            totalRateLimited,
            totalUsageExceeded,
          };
        } catch (err) {
          console.error(`Error fetching verifications for key ${key.id}:`, err);
          return {
            keyId: key.id,
            name: key.name || 'API Key',
            start: key.start,
            enabled: key.enabled,
            createdAt: key.createdAt,
            verifications: [],
            totalSuccess: 0,
            totalRateLimited: 0,
            totalUsageExceeded: 0,
          };
        }
      })
    );

    // 3. Aggregate totals
    const totals = keyAnalytics.reduce(
      (acc, k) => ({
        totalRequests: acc.totalRequests + k.totalSuccess + k.totalRateLimited + k.totalUsageExceeded,
        successfulRequests: acc.successfulRequests + k.totalSuccess,
        rateLimited: acc.rateLimited + k.totalRateLimited,
        usageExceeded: acc.usageExceeded + k.totalUsageExceeded,
      }),
      { totalRequests: 0, successfulRequests: 0, rateLimited: 0, usageExceeded: 0 }
    );

    return new Response(
      JSON.stringify({
        clientId,
        totalKeys: keys.length,
        activeKeys: keys.filter((k: any) => k.enabled).length,
        totals,
        keys: keyAnalytics,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in unkey-usage-analytics:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
