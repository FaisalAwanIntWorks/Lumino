import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.81.1";
import { requireSuperAdmin } from "../_shared/admin-access.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface DeleteAdminStaffRequest {
  staffMemberId: string;
  userId: string;
  staffEmail?: string;
  staffName?: string;
}

serve(async (req: Request) => {
  // Handle CORS
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Read-only admin staff must not perform any write operation.
  const readOnlyDenied = await requireSuperAdmin(req, corsHeaders);
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

    // ===== AUTHORIZATION: Require agency_admin role =====
    const { data: adminRole, error: roleError } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'agency_admin')
      .single();

    if (roleError || !adminRole) {
      return new Response(
        JSON.stringify({ error: 'Forbidden - Agency admin access required' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    // ===== END AUTHORIZATION =====

    const { staffMemberId, userId: targetUserId, staffEmail, staffName }: DeleteAdminStaffRequest = await req.json();

    // Validate input
    if (!staffMemberId || !targetUserId) {
      return new Response(
        JSON.stringify({ error: "Staff member ID and user ID are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 1. Delete admin_staff_members record
    const { error: staffError } = await supabaseAdmin
      .from("admin_staff_members")
      .delete()
      .eq("id", staffMemberId);

    if (staffError) {
      console.error("Error deleting admin staff member:", staffError);
      return new Response(
        JSON.stringify({ error: staffError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Delete user_roles record
    const { error: deleteRoleError } = await supabaseAdmin
      .from("user_roles")
      .delete()
      .eq("user_id", targetUserId);

    if (deleteRoleError) {
      console.error("Error deleting role:", deleteRoleError);
    }

    // 3. Delete auth user
    const { error: deleteAuthError } = await supabaseAdmin.auth.admin.deleteUser(targetUserId);

    if (deleteAuthError) {
      console.error("Error deleting auth user:", deleteAuthError);
      return new Response(
        JSON.stringify({ error: deleteAuthError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 4. Log admin activity
    await supabaseAdmin
      .from("admin_activity_logs")
      .insert({
        admin_user_id: user.id,
        admin_email: user.email || 'unknown',
        admin_type: 'agency_admin',
        action_type: 'staff_delete',
        action_category: 'admin_staff',
        description: `Deleted admin staff member: ${staffName || 'Unknown'} (${staffEmail || 'Unknown'})`,
        metadata: { 
          deleted_staff_email: staffEmail,
          deleted_staff_name: staffName,
          deleted_staff_id: staffMemberId,
        },
      });

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: "Admin staff member deleted successfully"
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
