import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Authorization required' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid authentication' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { clientId } = await req.json();
    if (!clientId) throw new Error('Client ID is required');

    // Authorization check: agency admin, client owner, or staff with edit perm
    const [{ data: adminRole }, { data: clientData }, { data: staffData }] = await Promise.all([
      supabase.from('user_roles').select('role').eq('user_id', user.id).eq('role', 'agency_admin').maybeSingle(),
      supabase.from('clients').select('id').eq('id', clientId).eq('user_id', user.id).maybeSingle(),
      supabase.from('staff_members').select('id, client_id, permissions').eq('user_id', user.id).maybeSingle(),
    ]);

    let authorized = false;
    if (adminRole) authorized = true;
    if (clientData) authorized = true;
    if (staffData && staffData.client_id === clientId) {
      const perms = staffData.permissions as { catalog_access?: string } | null;
      if (String(perms?.catalog_access ?? '').toLowerCase() === 'edit') authorized = true;
    }

    if (!authorized) {
      return new Response(JSON.stringify({ error: 'Not authorized to reset this diamond catalog' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`Resetting diamond catalog for client: ${clientId}`);

    // Single DB call — runs DELETE in one SQL statement, no serial batching.
    // The reset_client_diamond_presets function also clears diamond_catalog_config.
    const { data: deletedCount, error: rpcErr } = await supabase
      .rpc('reset_client_diamond_presets', { p_client_id: clientId });

    if (rpcErr) {
      // RPC not deployed yet (migration pending) — fall back to direct deletes
      console.warn('RPC not available, falling back to direct delete:', rpcErr.message);

      const { error: delErr } = await supabase
        .from('client_diamond_presets')
        .delete()
        .eq('client_id', clientId);
      if (delErr) throw delErr;

      const { error: cfgErr } = await supabase
        .from('diamond_catalog_config')
        .delete()
        .eq('client_id', clientId);
      if (cfgErr) console.error('config delete error:', cfgErr);

      console.log(`Reset complete for ${clientId} (fallback path)`);
      return new Response(JSON.stringify({ success: true, deleted: 'unknown' }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`Reset complete for ${clientId}, deleted ${deletedCount} presets`);

    return new Response(JSON.stringify({ success: true, deleted: deletedCount }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('reset-client-diamonds error:', error);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
