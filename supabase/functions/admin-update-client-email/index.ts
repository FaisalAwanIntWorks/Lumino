import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

    // Verify caller is an agency_admin
    const callerClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace('Bearer ', '');
    const { data: claims, error: claimsErr } = await callerClient.auth.getClaims(token);
    if (claimsErr || !claims?.claims?.sub) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const callerUserId = claims.claims.sub as string;

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    const { data: roleRow } = await admin
      .from('user_roles')
      .select('role')
      .eq('user_id', callerUserId)
      .eq('role', 'agency_admin')
      .maybeSingle();

    if (!roleRow) {
      return new Response(JSON.stringify({ error: 'Forbidden: admin only' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json().catch(() => ({}));
    const { clientId, newEmail } = body as { clientId?: string; newEmail?: string };

    const emailOk = typeof newEmail === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail.trim());
    if (!clientId || !emailOk) {
      return new Response(JSON.stringify({ error: 'Invalid clientId or newEmail' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const cleanEmail = newEmail.trim().toLowerCase();

    // Resolve client -> auth user id
    const { data: client, error: clientErr } = await admin
      .from('clients')
      .select('id, user_id, email')
      .eq('id', clientId)
      .maybeSingle();

    if (clientErr || !client?.user_id) {
      return new Response(JSON.stringify({ error: 'Client not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (client.email?.toLowerCase() === cleanEmail) {
      return new Response(JSON.stringify({ ok: true, unchanged: true }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Update auth user (admin override, mark confirmed)
    const { error: updErr } = await admin.auth.admin.updateUserById(client.user_id, {
      email: cleanEmail,
      email_confirm: true,
    });
    if (updErr) {
      return new Response(JSON.stringify({ error: updErr.message }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // The auth.users update trigger will sync clients.email automatically,
    // but write it directly too for immediate consistency.
    await admin.from('clients').update({ email: cleanEmail }).eq('id', clientId);

    // Activity log (best-effort)
    await admin.from('client_activity_logs').insert({
      client_id: clientId,
      action_type: 'admin_email_change',
      metadata: { old_email: client.email, new_email: cleanEmail, changed_by: callerUserId },
    }).then(() => {}, () => {});

    return new Response(JSON.stringify({ ok: true, email: cleanEmail }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
