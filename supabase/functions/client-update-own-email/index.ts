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
    const callerEmail = (claims.claims.email as string | undefined)?.toLowerCase();

    const body = await req.json().catch(() => ({}));
    const { newEmail } = body as { newEmail?: string };

    const emailOk =
      typeof newEmail === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail.trim());
    if (!emailOk) {
      return new Response(JSON.stringify({ error: 'Invalid email address' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const cleanEmail = newEmail!.trim().toLowerCase();
    if (callerEmail && callerEmail === cleanEmail) {
      return new Response(JSON.stringify({ ok: true, unchanged: true }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    // Block staff accounts from self-editing email
    const { data: staffRole } = await admin
      .from('user_roles')
      .select('role')
      .eq('user_id', callerUserId)
      .eq('role', 'staff')
      .maybeSingle();
    if (staffRole) {
      return new Response(
        JSON.stringify({
          error: 'Staff accounts cannot change their own email. Contact an admin.',
        }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Look up existing user with that email via getUserByEmail (more reliable than listUsers)
    const { data: existing } = await admin.auth.admin.getUserById(callerUserId);
    console.log('caller user', { id: callerUserId, current: existing?.user?.email, target: cleanEmail });

    const forceEmailUpdate = async (reason: string) => {
      console.warn('using force_client_auth_email_update fallback', { reason, id: callerUserId, target: cleanEmail });
      const { data, error } = await admin.rpc('force_client_auth_email_update', {
        p_user_id: callerUserId,
        p_new_email: cleanEmail,
      });
      if (error) return { ok: false, error: error.message };
      const result = data as { ok?: boolean; email?: string; error?: string } | null;
      if (!result?.ok) return { ok: false, error: result?.error || 'Email update failed' };
      return { ok: true, email: result.email || cleanEmail };
    };

    if ((existing?.user as any)?.email_change) {
      const forced = await forceEmailUpdate('stale_email_change');
      if (!forced.ok) {
        return new Response(JSON.stringify({ error: forced.error }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({ ok: true, email: forced.email }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Instant swap on auth user (bypass double-confirmation)
    const { data: updData, error: updErr } = await admin.auth.admin.updateUserById(callerUserId, {
      email: cleanEmail,
      email_confirm: true,
    });
    if (updErr) {
      console.error('updateUserById failed', updErr);
      const forced = await forceEmailUpdate((updErr as any).code || updErr.message);
      if (!forced.ok) {
        return new Response(
          JSON.stringify({ error: forced.error, code: (updErr as any).code, status: (updErr as any).status }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(JSON.stringify({ ok: true, email: forced.email }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    console.log('updateUserById ok', updData?.user?.email);

    // Mirror to clients row for immediate consistency
    const { data: clientRow } = await admin
      .from('clients')
      .select('id, email')
      .eq('user_id', callerUserId)
      .maybeSingle();

    if (clientRow?.id) {
      await admin.from('clients').update({ email: cleanEmail }).eq('id', clientRow.id);
      await admin
        .from('client_activity_logs')
        .insert({
          client_id: clientRow.id,
          action_type: 'self_email_change',
          metadata: {
            old_email: clientRow.email,
            new_email: cleanEmail,
            changed_by: callerUserId,
          },
        })
        .then(() => {}, () => {});
    }

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
