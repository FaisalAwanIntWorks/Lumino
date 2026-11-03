import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.81.1";
import { 
  getRequiredSecret, 
  sanitizeErrorForClient,
  corsHeaders 
} from '../_shared/secrets-validation.ts';
import { denyReadOnlyAdmin } from "../_shared/admin-access.ts";
import { MODULES_OFF_FEATURE_SET } from "../_shared/feature-registry.ts";

interface CreateClientRequest {
  email: string;
  password: string;
  companyName: string;
}

serve(async (req: Request) => {
  // Handle CORS
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Read-only admin staff must not perform any write operation.
  const readOnlyDenied = await denyReadOnlyAdmin(req, corsHeaders);
  if (readOnlyDenied) return readOnlyDenied;

  try {
    // SECURITY: Use validated secret getters - never log values
    const supabaseUrl = getRequiredSecret("SUPABASE_URL");
    const serviceRoleKey = getRequiredSecret("SUPABASE_SERVICE_ROLE_KEY");
    
    // Create admin client
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const { email: rawEmail, password, companyName }: CreateClientRequest = await req.json();

    const email = (rawEmail ?? "").trim().toLowerCase();

    // Validate input
    if (!email || !password || !companyName) {
      return new Response(
        JSON.stringify({ error: "Email, password, and company name are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 1. Create the auth user. Normally not auto-confirmed (we verify via email link).
    // Temporary: AUTO_CONFIRM_CLIENT_EMAIL=true confirms it immediately, for while the
    // verification email cannot reach clients (no verified sending domain).
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: Deno.env.get("AUTO_CONFIRM_CLIENT_EMAIL") === "true",
    });

    // If the user already exists, we can attempt to "complete" a previously-failed signup
    // (e.g., auth user exists but missing client/role rows).
    if (authError) {
      const code = (authError as any)?.code;

      if (code === "email_exists" || authError.message?.toLowerCase().includes("already been registered")) {
        const perPage = 1000;
        let existingUser: { id: string; email?: string } | undefined;

        for (let page = 1; page <= 20 && !existingUser; page++) {
          const { data: listData, error: listError } = await supabaseAdmin.auth.admin.listUsers({
            page,
            perPage,
          });

          if (listError) {
            console.error("Error listing users after email_exists:", listError);
            return new Response(
              JSON.stringify({
                success: true,
                existingUser: true,
                message: "Account already exists. Please sign in.",
                email,
              }),
              { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }

          existingUser = listData?.users?.find((u) => (u.email ?? "").toLowerCase() === email);

          // If we've reached the last page (fewer results than perPage), stop searching.
          if (!existingUser && (listData?.users?.length ?? 0) < perPage) {
            break;
          }
        }

        if (!existingUser?.id) {
          return new Response(
            JSON.stringify({
              success: true,
              existingUser: true,
              message: "Account already exists. Please sign in.",
              email,
            }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // If client already exists, don't create anything; respond success and tell frontend to route to login.
        const { data: existingClient } = await supabaseAdmin
          .from("clients")
          .select("id")
          .eq("user_id", existingUser.id)
          .maybeSingle();

        if (existingClient?.id) {
          return new Response(
            JSON.stringify({
              success: true,
              existingUser: true,
              message: "Account already exists. Please sign in.",
              userId: existingUser.id,
              email,
            }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // SECURITY NOTE: Do NOT update passwords for existing users here.
        // If the user forgot their password, they must use the password reset flow.

        // Complete setup (client + role) for this existing auth user.
        const { data: agencyData, error: agencyError } = await supabaseAdmin
          .from("agencies")
          .select("id")
          .limit(1)
          .single();

        if (agencyError || !agencyData) {
          console.error("Error fetching agency:", agencyError);
          return new Response(
            JSON.stringify({ error: "Could not find agency" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const { error: clientError } = await supabaseAdmin
          .from("clients")
          .insert({
            user_id: existingUser.id,
            agency_id: agencyData.id,
            company_name: companyName,
            email,
            status: "active",
            // Every module starts OFF; an admin switches them on by hand.
            enabled_features: { ...MODULES_OFF_FEATURE_SET },
          });

        if (clientError) {
          console.error("Error creating client for existing auth user:", clientError);
          return new Response(
            JSON.stringify({ error: clientError.message }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Ensure client role exists
        const { data: existingRole } = await supabaseAdmin
          .from("user_roles")
          .select("user_id")
          .eq("user_id", existingUser.id)
          .eq("role", "client")
          .maybeSingle();

        if (!existingRole?.user_id) {
          const { error: roleError } = await supabaseAdmin
            .from("user_roles")
            .insert({ user_id: existingUser.id, role: "client" });

          if (roleError) {
            console.error("Error assigning role for existing auth user:", roleError);
            // Best-effort cleanup to avoid leaving a half-created client
            await supabaseAdmin.from("clients").delete().eq("user_id", existingUser.id);
            return new Response(
              JSON.stringify({ error: roleError.message }),
              { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
        }

        return new Response(
          JSON.stringify({
            success: true,
            existingUser: true,
            message: "Existing account found; completed setup.",
            userId: existingUser.id,
            email,
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      console.error("Error creating auth user:", authError);
      return new Response(
        JSON.stringify({ error: authError.message }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userId = authData.user.id;

    // 2. Get agency ID
    const { data: agencyData, error: agencyError } = await supabaseAdmin
      .from("agencies")
      .select("id")
      .limit(1)
      .single();

    if (agencyError || !agencyData) {
      console.error("Error fetching agency:", agencyError);
      // Clean up auth user
      await supabaseAdmin.auth.admin.deleteUser(userId);
      return new Response(
        JSON.stringify({ error: "Could not find agency" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Create client record
    const { error: clientError } = await supabaseAdmin
      .from("clients")
      .insert({
        user_id: userId,
        agency_id: agencyData.id,
        company_name: companyName,
        email,
        status: "active",
        // Every module starts OFF; an admin switches them on by hand.
        enabled_features: { ...MODULES_OFF_FEATURE_SET },
      });

    if (clientError) {
      console.error("Error creating client:", clientError);
      // Clean up auth user
      await supabaseAdmin.auth.admin.deleteUser(userId);
      return new Response(
        JSON.stringify({ error: clientError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 4. Assign client role
    const { error: roleError } = await supabaseAdmin
      .from("user_roles")
      .insert({
        user_id: userId,
        role: "client",
      });

    if (roleError) {
      console.error("Error assigning role:", roleError);
      // Clean up to avoid orphaned auth users / clients
      await supabaseAdmin.from("clients").delete().eq("user_id", userId);
      await supabaseAdmin.auth.admin.deleteUser(userId);
      return new Response(
        JSON.stringify({ error: roleError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Send welcome email with password setup link
    let apiKey: string | null = null;
    
    // Auto-create Unkey API key for this client (best-effort, non-blocking)
    try {
      const unkeyRootKey = Deno.env.get("UNKEY_ROOT_KEY");
      const unkeyApiId = Deno.env.get("UNKEY_API_ID");
      
      if (unkeyRootKey && unkeyApiId) {
        // First get the client ID we just created
        const { data: newClient } = await supabaseAdmin
          .from("clients")
          .select("id")
          .eq("user_id", userId)
          .maybeSingle();
        
        if (newClient?.id) {
          const unkeyResponse = await fetch("https://api.unkey.dev/v1/keys.createKey", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${unkeyRootKey}`,
            },
            body: JSON.stringify({
              apiId: unkeyApiId,
              prefix: "jwlx",
              name: `${companyName} - Auto`,
              meta: { clientId: newClient.id, companyName },
              ratelimit: {
                type: "fast",
                limit: 100,
                refillRate: 100,
                refillInterval: 60000,
              },
            }),
          });

          if (unkeyResponse.ok) {
            const unkeyData = await unkeyResponse.json();
            apiKey = unkeyData.key || null;
            console.log("Auto-created Unkey API key for client:", newClient.id);
          } else {
            console.warn("Failed to auto-create Unkey API key:", await unkeyResponse.text());
          }
        }
      }
    } catch (unkeyError) {
      console.warn("Unkey auto-key creation skipped:", unkeyError);
    }

    try {
      const welcomeEmailPayload = {
        user_id: userId,
        client_email: email,
        company_name: companyName,
      };

      // Call the welcome email function
      const emailResponse = await fetch(`${supabaseUrl}/functions/v1/send-client-welcome-email`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${serviceRoleKey}`,
        },
        body: JSON.stringify(welcomeEmailPayload),
      });

      if (!emailResponse.ok) {
        console.error("Failed to send welcome email:", await emailResponse.text());
      } else {
        console.log("Client welcome email sent successfully");
      }
    } catch (emailError) {
      // Log but don't fail - the client was created successfully
      console.error("Error sending welcome email:", emailError);
    }

    return new Response(
      JSON.stringify({
        success: true,
        existingUser: false,
        message: `Client ${companyName} created successfully`,
        userId,
        email,
        ...(apiKey ? { apiKey } : {}),
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    // SECURITY: Never expose internal error details to client
    const safeMessage = sanitizeErrorForClient(error, "Account creation failed. Please try again.");
    console.error("Create client user error - safe message returned");
    return new Response(
      JSON.stringify({ error: safeMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
