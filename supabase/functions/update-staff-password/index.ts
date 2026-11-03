import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.81.1";
import { validatePassword } from "../_shared/password-validation.ts";

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

    const { userId, newPassword } = await req.json();

    // Validate input
    if (!userId || !newPassword) {
      return new Response(
        JSON.stringify({ error: "User ID and new password are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get the staff member to find the client_id and name/phone for validation
    const { data: staffData, error: staffFetchError } = await supabaseAdmin
      .from("staff_members")
      .select("client_id, name, email, phone")
      .eq("user_id", userId)
      .single();

    if (staffFetchError || !staffData) {
      return new Response(
        JSON.stringify({ error: "Staff member not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate password strength with name/phone check
    const passwordValidation = validatePassword(newPassword, { 
      name: staffData.name, 
      phone: staffData.phone 
    });
    if (!passwordValidation.valid) {
      return new Response(
        JSON.stringify({ error: passwordValidation.error }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const staffClientId = staffData.client_id;

    // ===== AUTHORIZATION: Verify user owns this client =====
    const { data: client, error: clientError } = await supabaseAdmin
      .from('clients')
      .select('user_id')
      .eq('id', staffClientId)
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

    // Update the Supabase Auth password (NOT stored in database)
    const { error: authUpdateError } = await supabaseAdmin.auth.admin.updateUserById(
      userId,
      { password: newPassword }
    );

    if (authUpdateError) {
      console.error("Error updating auth password:", authUpdateError);
      return new Response(
        JSON.stringify({ error: authUpdateError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Update the updated_at timestamp on staff_members
    await supabaseAdmin
      .from("staff_members")
      .update({ updated_at: new Date().toISOString() })
      .eq("user_id", userId);

    // Log the activity
    await supabaseAdmin.from('client_activity_logs').insert({
      client_id: staffClientId,
      user_id: user.id,
      user_email: user.email || 'unknown',
      user_name: 'Client Owner',
      user_type: 'client',
      action_type: 'staff_password_update',
      action_category: 'staff_management',
      description: `Password updated for staff member "${staffData.name || 'Unknown'}"`,
      metadata: { 
        staff_email: staffData.email,
        staff_name: staffData.name,
        updated_by_user_id: user.id,
        updated_by_email: user.email
      },
    });

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: "Password updated successfully"
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
