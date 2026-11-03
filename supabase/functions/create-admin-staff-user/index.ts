import { createClient } from "https://esm.sh/@supabase/supabase-js@2.81.1";
import { validatePassword } from "../_shared/password-validation.ts";
import { requireSuperAdmin } from "../_shared/admin-access.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface CreateAdminStaffRequest {
  email: string;
  password: string;
  name: string;
  phone?: string;
  clientIds?: string[];
}

Deno.serve(async (req: Request) => {
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
    const { data: adminRole, error: roleCheckError } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'agency_admin')
      .single();

    if (roleCheckError || !adminRole) {
      return new Response(
        JSON.stringify({ error: 'Forbidden - Agency admin access required' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    // ===== END AUTHORIZATION =====

    const { email, password, name, phone, clientIds }: CreateAdminStaffRequest = await req.json();

    // Validate input
    if (!email || !password || !name) {
      return new Response(
        JSON.stringify({ error: "Email, password, and name are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate password strength with name/phone check
    const passwordValidation = validatePassword(password, { name, phone });
    if (!passwordValidation.valid) {
      return new Response(
        JSON.stringify({ error: passwordValidation.error }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 1. Create the auth user
    const { data: authData, error: createAuthError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (createAuthError) {
      console.error("Error creating auth user:", createAuthError);
      return new Response(
        JSON.stringify({ error: createAuthError.message }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userId = authData.user.id;

    // 2. Assign agency_admin role
    const { error: roleError } = await supabaseAdmin
      .from("user_roles")
      .insert({
        user_id: userId,
        role: "agency_admin",
      });

    if (roleError) {
      console.error("Error assigning role:", roleError);
      // Clean up auth user
      await supabaseAdmin.auth.admin.deleteUser(userId);
      return new Response(
        JSON.stringify({ error: roleError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Create admin_staff_members record (password is NOT stored - shown one-time only)
    const { data: staffData, error: staffError } = await supabaseAdmin
      .from("admin_staff_members")
      .insert({
        user_id: userId,
        name,
        email,
        phone: phone || null,
        status: "active",
      })
      .select('id')
      .single();

    if (staffError) {
      console.error("Error creating admin staff member:", staffError);
      // Clean up
      await supabaseAdmin.from("user_roles").delete().eq("user_id", userId);
      await supabaseAdmin.auth.admin.deleteUser(userId);
      return new Response(
        JSON.stringify({ error: staffError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 4. Create client access records if clientIds provided
    if (clientIds && clientIds.length > 0) {
      const accessRecords = clientIds.map(clientId => ({
        admin_staff_id: staffData.id,
        client_id: clientId,
      }));

      const { error: accessError } = await supabaseAdmin
        .from("admin_staff_client_access")
        .insert(accessRecords);

      if (accessError) {
        console.error("Error creating client access records:", accessError);
        // Note: We don't rollback the entire creation, just log the error
      }
    }

    // 5. Log admin activity
    await supabaseAdmin
      .from("admin_activity_logs")
      .insert({
        admin_user_id: user.id,
        admin_email: user.email || 'unknown',
        admin_type: 'agency_admin',
        action_type: 'staff_create',
        action_category: 'admin_staff',
        description: `Created admin staff member: ${name} (${email})`,
        metadata: { 
          created_staff_email: email,
          created_staff_name: name,
          created_staff_id: staffData.id,
        },
      });

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Admin staff member ${name} created successfully`,
        userId,
        email,
        // Return password one-time for display - it is NOT stored in the database
        temporaryPassword: password
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
