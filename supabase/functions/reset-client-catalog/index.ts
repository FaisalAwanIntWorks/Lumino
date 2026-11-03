import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify the caller is authorized (must be client owner or agency admin, NOT staff)
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Authorization required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid authentication' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { clientId } = await req.json();

    if (!clientId) {
      throw new Error('Client ID is required');
    }

    // Check if user is an agency admin
    const { data: adminRole } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'agency_admin')
      .maybeSingle();

    // Check if user owns the client
    const { data: clientData } = await supabase
      .from('clients')
      .select('id')
      .eq('id', clientId)
      .eq('user_id', user.id)
      .maybeSingle();

    // Check if user is a staff member and their permissions
    const { data: staffData } = await supabase
      .from('staff_members')
      .select('id, client_id, permissions')
      .eq('user_id', user.id)
      .maybeSingle();

    // Staff members can only reset if they have 'edit' catalog access for THIS client
    if (staffData) {
      const permissions = staffData.permissions as { catalog_access?: string | boolean } | null;
      const catalogAccess = String(permissions?.catalog_access ?? '').toLowerCase();
      const hasEditPermission = catalogAccess === 'edit';
      const isSameClient = staffData.client_id === clientId;

      if (!hasEditPermission) {
        console.log('Staff member without edit permission attempted to reset catalog - denied');
        return new Response(
          JSON.stringify({ error: 'Staff members cannot reset catalogs. Contact your administrator.' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (!isSameClient) {
        console.log('Staff member attempted to reset catalog for a different client - denied');
        return new Response(
          JSON.stringify({ error: 'You are not authorized to reset this catalog' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      console.log('Staff member with edit permission resetting catalog');
    }

    if (!adminRole && !clientData && !staffData) {
      console.log('Unauthorized user attempted to reset catalog');
      return new Response(
        JSON.stringify({ error: 'You are not authorized to reset this catalog' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Resetting catalog for client: ${clientId}`);

    // Delete client ring catalog entries
    const { error: catalogError } = await supabase
      .from('client_ring_catalog')
      .delete()
      .eq('client_id', clientId);

    if (catalogError) {
      console.error('Error deleting catalog:', catalogError);
      throw catalogError;
    }

    // Delete client carat options
    const { error: caratError } = await supabase
      .from('client_carat_options')
      .delete()
      .eq('client_id', clientId);

    if (caratError) {
      console.error('Error deleting carat options:', caratError);
      throw caratError;
    }

    // Delete client size options
    const { error: sizeError } = await supabase
      .from('client_size_options')
      .delete()
      .eq('client_id', clientId);

    if (sizeError) {
      console.error('Error deleting size options:', sizeError);
      throw sizeError;
    }

    // Reset onboarding status
    const { error: onboardingError } = await supabase
      .from('client_onboarding_preferences')
      .update({ 
        onboarding_completed: false,
        completed_at: null,
        updated_at: new Date().toISOString()
      })
      .eq('client_id', clientId);

    if (onboardingError) {
      console.error('Error resetting onboarding:', onboardingError);
      throw onboardingError;
    }

    // Log the activity
    const userInfo = staffData 
      ? { userEmail: user.email || '', userName: null, userType: 'staff' as const }
      : { userEmail: user.email || '', userName: null, userType: 'owner' as const };

    await supabase.from('client_activity_logs').insert({
      client_id: clientId,
      user_id: user.id,
      user_email: userInfo.userEmail,
      user_name: userInfo.userName,
      user_type: userInfo.userType,
      action_type: 'catalog_reset',
      action_category: 'catalog',
      description: 'Reset catalog and preferences',
      metadata: { timestamp: new Date().toISOString() },
    });

    console.log(`Successfully reset catalog for client: ${clientId}`);

    return new Response(
      JSON.stringify({ success: true, message: 'Catalog reset successfully' }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    console.error('Error resetting catalog:', error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    );
  }
});
