import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.81.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
  // Handle CORS
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

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

    // Get all staff members without user_id
    const { data: staffMembers, error: fetchError } = await supabaseAdmin
      .from("staff_members")
      .select("*")
      .is("user_id", null);

    if (fetchError) {
      throw fetchError;
    }

    console.log(`Found ${staffMembers?.length || 0} staff members to migrate`);

    const results = [];

    for (const staff of staffMembers || []) {
      try {
        // Create auth user with existing password
        const { data: authData, error: createAuthError } = await supabaseAdmin.auth.admin.createUser({
          email: staff.email,
          password: staff.password,
          email_confirm: true,
        });

        if (createAuthError) {
          console.error(`Error creating auth user for ${staff.email}:`, createAuthError);
          results.push({ email: staff.email, success: false, error: createAuthError.message });
          continue;
        }

        const userId = authData.user.id;

        // Assign staff role
        const { error: staffRoleError } = await supabaseAdmin
          .from("user_roles")
          .insert({
            user_id: userId,
            role: "staff",
          });

        if (staffRoleError) {
          console.error(`Error assigning role for ${staff.email}:`, staffRoleError);
          // Clean up auth user
          await supabaseAdmin.auth.admin.deleteUser(userId);
          results.push({ email: staff.email, success: false, error: staffRoleError.message });
          continue;
        }

        // Update staff_members with user_id
        const { error: updateError } = await supabaseAdmin
          .from("staff_members")
          .update({ user_id: userId })
          .eq("id", staff.id);

        if (updateError) {
          console.error(`Error updating staff member ${staff.email}:`, updateError);
          // Clean up
          await supabaseAdmin.from("user_roles").delete().eq("user_id", userId);
          await supabaseAdmin.auth.admin.deleteUser(userId);
          results.push({ email: staff.email, success: false, error: updateError.message });
          continue;
        }

        console.log(`Successfully migrated ${staff.email}`);
        results.push({ email: staff.email, success: true, userId });

      } catch (err: any) {
        console.error(`Unexpected error for ${staff.email}:`, err);
        results.push({ email: staff.email, success: false, error: err.message });
      }
    }

    // Log the migration activity
    await supabaseAdmin.from('admin_activity_logs').insert({
      admin_user_id: user.id,
      admin_email: user.email || 'unknown',
      admin_type: 'agency_admin',
      action_type: 'staff_migration',
      action_category: 'system',
      description: `Migrated ${results.filter(r => r.success).length} staff members, ${results.filter(r => !r.success).length} failed`,
      metadata: { results },
    });

    return new Response(
      JSON.stringify({ 
        success: true, 
        migrated: results.filter(r => r.success).length,
        failed: results.filter(r => !r.success).length,
        results 
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
