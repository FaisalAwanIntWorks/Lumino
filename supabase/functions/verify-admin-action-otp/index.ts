import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MAX_ATTEMPTS = 5;

async function hashOtp(otp: string): Promise<string> {
  const data = new TextEncoder().encode(otp);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = await authClient.auth.getUser();
    if (!userData?.user?.email) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const admin = createClient(supabaseUrl, serviceKey);

    const { data: roleRow } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", userData.user.id)
      .eq("role", "agency_admin")
      .maybeSingle();
    if (!roleRow) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const { action_type, target_id, otp } = await req.json();
    if (!action_type || !otp || typeof otp !== "string") {
      return new Response(JSON.stringify({ error: "Missing action_type or otp" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const adminEmail = userData.user.email.toLowerCase();
    const otpHash = await hashOtp(otp.trim());

    let query = admin
      .from("admin_action_otp_tokens")
      .select("id, otp_hash, expires_at, used_at, attempts")
      .eq("email", adminEmail)
      .eq("action_type", action_type)
      .is("used_at", null)
      .order("created_at", { ascending: false })
      .limit(5);

    if (target_id) {
      query = query.eq("target_id", String(target_id));
    } else {
      query = query.is("target_id", null);
    }

    const { data: tokens, error: fetchErr } = await query;
    if (fetchErr) throw fetchErr;

    const now = Date.now();
    const match = (tokens || []).find(
      (t: any) =>
        t.otp_hash === otpHash &&
        new Date(t.expires_at).getTime() > now &&
        (t.attempts ?? 0) < MAX_ATTEMPTS,
    );

    if (!match) {
      // Increment attempts on most recent unused token
      const latest = (tokens || [])[0];
      if (latest) {
        await admin
          .from("admin_action_otp_tokens")
          .update({ attempts: (latest.attempts ?? 0) + 1 })
          .eq("id", latest.id);
      }
      return new Response(
        JSON.stringify({ error: "Invalid or expired code" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } },
      );
    }

    await admin
      .from("admin_action_otp_tokens")
      .update({ used_at: new Date().toISOString() })
      .eq("id", match.id);

    return new Response(JSON.stringify({ success: true, verified: true }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    console.error("verify-admin-action-otp error:", error);
    return new Response(JSON.stringify({ error: "Verification failed" }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
});
