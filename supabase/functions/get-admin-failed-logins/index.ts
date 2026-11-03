import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.81.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type FailedLoginAttempt = {
  email: string;
  attempted_at: string;
  ip_address: string | null;
  user_agent: string | null;
  failure_reason: string | null;
};

serve(async (req: Request) => {
  // Handle CORS
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Get the JWT token from the request
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Create client with user's token to verify authentication
    const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await supabaseUser.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Create admin client for database operations
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Check if user is agency_admin
    const { data: adminRole } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "agency_admin")
      .maybeSingle();

    if (!adminRole) {
      return new Response(JSON.stringify({ error: "Not authorized - admin access required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Parse request body
    const { dateFrom, limit = 100 } = await req.json();

    // Fetch all admin staff emails
    const { data: adminStaff, error: staffError } = await supabaseAdmin
      .from("admin_staff_members")
      .select("email");

    if (staffError) {
      console.error("Error fetching admin staff:", staffError);
      return new Response(JSON.stringify({ error: "Failed to fetch admin staff" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Collect all admin emails
    const adminEmails: string[] = adminStaff?.map(s => s.email) || [];

    // Also include any emails from admin_activity_logs that might be admins
    const { data: loggedEmails } = await supabaseAdmin
      .from("admin_activity_logs")
      .select("admin_email")
      .limit(100);

    if (loggedEmails) {
      loggedEmails.forEach(log => {
        if (log.admin_email && !adminEmails.includes(log.admin_email)) {
          adminEmails.push(log.admin_email);
        }
      });
    }

    if (adminEmails.length === 0) {
      return new Response(JSON.stringify({ attempts: [] }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Query failed_login_attempts for admin emails
    let query = supabaseAdmin
      .from("failed_login_attempts")
      .select("email, attempted_at, ip_address, user_agent, failure_reason")
      .in("email", adminEmails)
      .order("attempted_at", { ascending: false })
      .limit(limit);

    if (dateFrom) {
      query = query.gte("attempted_at", dateFrom);
    }

    const { data: attempts, error: attemptsError } = await query;

    if (attemptsError) {
      console.error("Error fetching failed login attempts:", attemptsError);
      return new Response(JSON.stringify({ error: "Failed to fetch login attempts" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ attempts: attempts || [] }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: any) {
    console.error("Unexpected error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
