import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { dualAuth, checkUnkeyRateLimit, corsHeaders } from '../_shared/unkey.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Dual auth: supports both API key and JWT
    const authResult = await dualAuth(req);
    if (authResult instanceof Response) return authResult;

    // Check Unkey rate limit for API key auth
    const rateLimited = checkUnkeyRateLimit(authResult);
    if (rateLimited) return rateLimited;

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { table } = await req.json();

    const allowedTables = ['my_master_db_data', 'client_ring_catalog', 'client_diamond_presets'];
    if (!allowedTables.includes(table)) {
      return new Response(JSON.stringify({ error: 'Table not allowed' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      });
    }

    // For API key auth, scope client-specific tables by clientId
    const scopedClientId = authResult.clientId || null;
    const clientScopedTables = ['client_ring_catalog', 'client_diamond_presets'];
    const needsClientScope = clientScopedTables.includes(table) && scopedClientId;

    // Fetch all rows (paginate to avoid 1000-row limit)
    let allData: unknown[] = [];
    let offset = 0;
    const pageSize = 500;

    while (true) {
      let query = supabaseClient
        .from(table)
        .select('*');

      // Apply client scoping for client-specific tables when using API key auth
      if (needsClientScope) {
        query = query.eq('client_id', scopedClientId);
      }

      const { data, error } = await query.range(offset, offset + pageSize - 1);

      if (error) throw error;
      if (!data || data.length === 0) break;

      allData = allData.concat(data);
      if (data.length < pageSize) break;
      offset += pageSize;
    }

    return new Response(JSON.stringify(allData, null, 2), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="${table}.json"`,
      },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});
