import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.81.1";
import { denyReadOnlyAdmin } from "../_shared/admin-access.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
  // Handle CORS
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Read-only admin staff must not perform any write operation.
  const readOnlyDenied = await denyReadOnlyAdmin(req, corsHeaders);
  if (readOnlyDenied) return readOnlyDenied;

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
    // Create admin client
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // ===== JWT AUTHENTICATION =====
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized - Authentication required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized - Invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    // ===== END JWT AUTHENTICATION =====

    const { staffMemberId } = await req.json();

    // Validate input
    if (!staffMemberId) {
      return new Response(
        JSON.stringify({ error: "Staff member ID is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get the staff member to find user_id, client_id, and other info for logging
    const { data: staffData, error: fetchError } = await supabaseAdmin
      .from("staff_members")
      .select("user_id, name, email, client_id")
      .eq("id", staffMemberId)
      .single();

    if (fetchError) {
      console.error("Error fetching staff member:", fetchError);
      return new Response(
        JSON.stringify({ error: fetchError.message }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userId = staffData?.user_id;
    const staffName = staffData?.name;
    const staffEmail = staffData?.email;
    const clientId = staffData?.client_id;

    // ===== AUTHORIZATION: Verify user owns this client =====
    const { data: client, error: clientError } = await supabaseAdmin
      .from('clients')
      .select('user_id')
      .eq('id', clientId)
      .single();

    if (clientError || !client) {
      return new Response(
        JSON.stringify({ error: 'Client not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if user is the client owner OR an agency_admin
    const { data: adminRole } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'agency_admin')
      .single();

    if (client.user_id !== user.id && !adminRole) {
      return new Response(
        JSON.stringify({ error: 'Forbidden - Not authorized to manage staff for this client' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    // ===== END AUTHORIZATION =====

    // Delete the staff_members record first
    const { error: deleteStaffError } = await supabaseAdmin
      .from("staff_members")
      .delete()
      .eq("id", staffMemberId);

    if (deleteStaffError) {
      console.error("Error deleting staff member:", deleteStaffError);
      return new Response(
        JSON.stringify({ error: deleteStaffError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // If there's a user_id, delete the auth user (this will cascade delete user_roles)
    if (userId) {
      const { error: deleteUserError } = await supabaseAdmin.auth.admin.deleteUser(userId);
      if (deleteUserError) {
        console.error("Error deleting auth user:", deleteUserError);
        // Don't fail the request, staff member is already deleted
      }
    }

    // Log the activity
    if (clientId) {
      await supabaseAdmin.from('client_activity_logs').insert({
        client_id: clientId,
        user_id: user.id,
        user_email: user.email || 'unknown',
        user_name: 'Client Owner',
        user_type: 'client',
        action_type: 'staff_delete',
        action_category: 'staff_management',
        description: `Staff member "${staffName || 'Unknown'}" was deleted`,
        metadata: { 
          staff_email: staffEmail,
          staff_name: staffName,
          deleted_by: 'owner',
          deleted_by_user_id: user.id,
          deleted_by_email: user.email
        },
      });
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: "Staff member deleted successfully"
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    console.error("Unexpected error:", error);
    return new Response(
      JSON.stringify({ error: "An unexpected error occurred" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
