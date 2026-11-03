import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Verify user
    const supabaseAuth = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { leadId, customerEmail, clientId } = await req.json();
    if (!leadId || !clientId) {
      return new Response(JSON.stringify({ error: "leadId and clientId are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Auth check: user must be admin, client owner, or staff of client
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { data: isAdmin } = await supabase.rpc("has_role", {
      _user_id: user.id,
      _role: "agency_admin",
    });

    if (!isAdmin) {
      const { data: clientData } = await supabase
        .from("clients")
        .select("id")
        .eq("id", clientId)
        .eq("user_id", user.id)
        .maybeSingle();

      if (!clientData) {
        const { data: isStaff } = await supabase.rpc("is_staff_of_client", {
          _user_id: user.id,
          _client_id: clientId,
        });

        if (!isStaff) {
          return new Response(JSON.stringify({ error: "Forbidden" }), {
            status: 403,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }
    }

    // Query email_logs by lead_id in metadata OR by customer email
    // Using service role to bypass RLS on email_logs
    let query = supabase
      .from("email_logs")
      .select("id, email_type, recipient_email, subject, status, created_at, error_message, metadata")
      .order("created_at", { ascending: false })
      .limit(50);

    // Build OR filter
    const filters: string[] = [];
    filters.push(`metadata->>lead_id.eq.${leadId}`);
    if (customerEmail) {
      // Same customer can submit to several clients; only show this client's emails
      filters.push(`and(recipient_email.eq.${customerEmail},metadata->>client_id.eq.${clientId})`);
    }

    const { data: emailLogs, error: queryError } = await supabase
      .from("email_logs")
      .select("id, email_type, recipient_email, subject, status, created_at, error_message, metadata")
      .or(filters.join(","))
      .order("created_at", { ascending: false })
      .limit(50);

    if (queryError) {
      console.error("Query error:", queryError);
      return new Response(JSON.stringify({ error: "Failed to fetch email logs" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Deduplicate by id
    const seen = new Set<string>();
    const deduplicated = (emailLogs || []).filter((log) => {
      if (seen.has(log.id)) return false;
      seen.add(log.id);
      return true;
    });

    return new Response(JSON.stringify({ data: deduplicated }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
