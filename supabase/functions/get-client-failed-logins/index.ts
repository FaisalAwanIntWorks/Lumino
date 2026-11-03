import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type FailedLoginAttempt = {
  id: string;
  email: string;
  attempted_at: string;
  ip_address: string | null;
  user_agent: string | null;
  failure_reason: string | null;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify caller
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Authorization required' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid authentication' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json().catch(() => ({}));
    const clientId = String(body?.clientId ?? '').trim();
    const dateFrom = String(body?.dateFrom ?? '').trim();
    const limit = Number.isFinite(body?.limit) ? Number(body.limit) : 100;

    if (!clientId) {
      return new Response(JSON.stringify({ error: 'clientId is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Authorization: agency_admin OR owner of the client OR staff of the client
    const [{ data: adminRole }, { data: clientOwner }, { data: staffMember }] = await Promise.all([
      supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .eq('role', 'agency_admin')
        .maybeSingle(),
      supabase
        .from('clients')
        .select('id')
        .eq('id', clientId)
        .eq('user_id', user.id)
        .maybeSingle(),
      supabase
        .from('staff_members')
        .select('id, client_id')
        .eq('user_id', user.id)
        .maybeSingle(),
    ]);

    const isStaffForClient = !!staffMember && staffMember.client_id === clientId;
    const isAuthorized = !!adminRole || !!clientOwner || isStaffForClient;

    if (!isAuthorized) {
      return new Response(JSON.stringify({ error: 'Not authorized' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Collect emails for this client (owner + staff)
    const [{ data: clientData }, { data: staffData }] = await Promise.all([
      supabase
        .from('clients')
        .select('email')
        .eq('id', clientId)
        .maybeSingle(),
      supabase
        .from('staff_members')
        .select('email')
        .eq('client_id', clientId),
    ]);

    const emails = new Set<string>();
    if (clientData?.email) emails.add(clientData.email.toLowerCase().trim());
    (staffData || []).forEach((s) => {
      if (s?.email) emails.add(String(s.email).toLowerCase().trim());
    });

    const emailList = Array.from(emails).filter(Boolean);
    if (emailList.length === 0) {
      return new Response(JSON.stringify({ attempts: [] as FailedLoginAttempt[] }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch failed login attempts (table is protected by RLS, so we read via service role here)
    let query = supabase
      .from('failed_login_attempts')
      .select('id,email,attempted_at,ip_address,user_agent,failure_reason')
      .in('email', emailList)
      .order('attempted_at', { ascending: false })
      .limit(Math.min(Math.max(limit, 1), 500));

    if (dateFrom) {
      query = query.gte('attempted_at', dateFrom);
    }

    const { data: attempts, error } = await query;

    if (error) {
      console.error('Failed to fetch failed_login_attempts:', error);
      return new Response(JSON.stringify({ error: 'Failed to load failed login attempts' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ attempts: (attempts || []) as FailedLoginAttempt[] }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in get-client-failed-logins:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
