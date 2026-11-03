import { createClient } from "npm:@supabase/supabase-js@2";

// Leads & Bookings rows for a STAFF member, read with the service role so the
// list does not depend on per-table RLS. Access is checked here instead:
// the caller must be an active staff member of `clientId` and the client must
// not have switched "Show Leads" off (permissions.show_leads === false).

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const LEAD_TABLES = [
  'saved_designs',
  'diamond_form_leads',
  'grill_form_leads',
  'custom_enquiry_leads',
  'design_requests',
  'appointment_bookings',
  'metal_buying_leads',
] as const;

const MAX_ROWS = 500;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Authorization required' }, 401);

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return json({ error: 'Invalid authentication' }, 401);

    const body = await req.json().catch(() => ({}));
    const clientId = String(body?.clientId ?? '').trim();
    if (!clientId) return json({ error: 'clientId is required' }, 400);

    const { data: staff, error: staffError } = await supabase
      .from('staff_members')
      .select('id, status, permissions')
      .eq('user_id', user.id)
      .eq('client_id', clientId)
      .limit(1)
      .maybeSingle();

    if (staffError) {
      console.error('Staff lookup failed:', staffError);
      return json({ error: 'Failed to verify staff access' }, 500);
    }
    if (!staff || staff.status !== 'active') return json({ error: 'Not authorized' }, 403);

    const perms = (staff.permissions || {}) as Record<string, unknown>;
    if (perms.show_leads === false || perms.show_leads === 'false') {
      return json({ error: 'Leads are hidden for this staff member' }, 403);
    }

    const results = await Promise.all(
      LEAD_TABLES.map(async (table) => {
        const { data, error } = await supabase
          .from(table)
          .select('*')
          .eq('client_id', clientId)
          .order('created_at', { ascending: false })
          .limit(MAX_ROWS);
        if (error) console.error(`Failed to fetch ${table}:`, error);
        return [table, error ? [] : (data || [])] as const;
      }),
    );

    return json({ tables: Object.fromEntries(results) });
  } catch (error) {
    console.error('Error in get-staff-leads:', error);
    return json({ error: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
});
