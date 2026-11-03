import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.81.1";
import { denyReadOnlyAdmin } from "../_shared/admin-access.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Read-only admin staff must not perform any write operation.
  const readOnlyDenied = await denyReadOnlyAdmin(req, corsHeaders);
  if (readOnlyDenied) return readOnlyDenied;

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // ===== JWT AUTH =====
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { staffMemberId, clientId, updates } = body;

    if (!staffMemberId || !clientId || !updates || typeof updates !== "object") {
      return new Response(
        JSON.stringify({ error: "staffMemberId, clientId and updates are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ===== AUTHORIZATION: caller must own client OR be an agency_admin =====
    const { data: client, error: clientError } = await supabaseAdmin
      .from("clients")
      .select("user_id, company_name")
      .eq("id", clientId)
      .single();

    if (clientError || !client) {
      return new Response(JSON.stringify({ error: "Client not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: adminRole } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "agency_admin")
      .maybeSingle();

    const isOwner = client.user_id === user.id;
    const isAdmin = !!adminRole;

    if (!isOwner && !isAdmin) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ===== Whitelist updatable fields =====
    const allowedFields = ["name", "email", "phone", "status", "permissions"];
    const sanitized: Record<string, unknown> = {};
    for (const key of allowedFields) {
      if (key in updates) sanitized[key] = updates[key];
    }

    if (Object.keys(sanitized).length === 0) {
      return new Response(JSON.stringify({ error: "No valid fields to update" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Ensure staff member belongs to the specified client
    const { data: staff, error: staffFetchError } = await supabaseAdmin
      .from("staff_members")
      .select("id, client_id, name, email")
      .eq("id", staffMemberId)
      .single();

    if (staffFetchError || !staff) {
      return new Response(JSON.stringify({ error: "Staff member not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (staff.client_id !== clientId) {
      return new Response(JSON.stringify({ error: "Staff member does not belong to this client" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { error: updateError } = await supabaseAdmin
      .from("staff_members")
      .update(sanitized)
      .eq("id", staffMemberId);

    if (updateError) {
      console.error("Update failed:", updateError);
      return new Response(JSON.stringify({ error: updateError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Activity log
    await supabaseAdmin.from("client_activity_logs").insert({
      client_id: clientId,
      user_id: user.id,
      user_email: user.email || "unknown",
      user_name: isAdmin && !isOwner ? "Agency Admin" : "Client Owner",
      user_type: isAdmin && !isOwner ? "admin" : "client",
      action_type: "staff_update",
      action_category: "staff_management",
      description: `Staff member "${staff.name || staff.email}" was updated`,
      metadata: {
        staff_id: staffMemberId,
        updated_fields: Object.keys(sanitized),
        via_impersonation: isAdmin && !isOwner,
      },
    });

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Unexpected error:", error);
    return new Response(JSON.stringify({ error: error?.message || "Unexpected error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
