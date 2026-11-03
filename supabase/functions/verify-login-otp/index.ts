import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

async function hashOtp(otp: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(otp);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error("Missing required env vars", {
        hasSupabaseUrl: !!supabaseUrl,
        hasServiceRoleKey: !!supabaseServiceKey,
      });
      return jsonResponse({ success: false, error: "Server configuration error" }, 500);
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { email, otp } = await req.json();

    if (!email || !otp) {
      return jsonResponse({ success: false, error: "Email and OTP are required" });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const normalizedOtp = String(otp).replace(/\D/g, "").trim();

    if (normalizedOtp.length !== 6) {
      return jsonResponse({ success: false, error: "Please enter a valid 6-digit code." });
    }

    const otpHash = await hashOtp(normalizedOtp);

    // Find recent unused, unexpired OTPs for this email. Keep this wide enough to
    // handle duplicate sends/resends without rejecting a still-valid emailed code.
    const nowIso = new Date().toISOString();
    const { data: tokenRows, error: fetchError } = await supabase
      .from("login_otp_tokens")
      .select("id, otp_hash, expires_at, used")
      .eq("email", normalizedEmail)
      .eq("used", false)
      .gt("expires_at", nowIso)
      .order("created_at", { ascending: false })
      .limit(25);

    if (fetchError) {
      console.error("DB fetch error:", fetchError);
      throw new Error("Verification failed");
    }

    if (!tokenRows || tokenRows.length === 0) {
      return jsonResponse({ success: false, error: "Invalid or expired code. Please request a new one." });
    }

    const matched = tokenRows.find((row) => row.otp_hash === otpHash);

    if (!matched) {
      console.warn("OTP mismatch", {
        email: normalizedEmail,
        candidateCount: tokenRows.length,
      });
      return jsonResponse({ success: false, error: "Incorrect code. Please try again." });
    }

    // Mark matched OTP as used immediately, and invalidate any other outstanding
    // unused OTPs for this email so they can't be reused.
    await supabase
      .from("login_otp_tokens")
      .update({ used: true })
      .eq("email", normalizedEmail)
      .eq("used", false);

    // Generate a magic link — extract hashed_token (the OTP) from the verify URL
    const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
      type: "magiclink",
      email: normalizedEmail,
    });

    if (linkError || !linkData?.properties) {
      console.error("Failed to generate magic link:", linkError);
      throw new Error("Failed to create session");
    }

    console.log("Link properties:", JSON.stringify(linkData.properties));

    // Supabase returns hashed_token directly in properties
    const hashedToken = (linkData.properties as any).hashed_token;

    if (!hashedToken) {
      // Fallback: parse from action_link
      const actionUrl = new URL(linkData.properties.action_link);
      const fromUrl =
        actionUrl.searchParams.get("token_hash") ||
        actionUrl.searchParams.get("token");
      if (!fromUrl) {
        console.error("No token in link. Action link:", linkData.properties.action_link);
        throw new Error("Failed to extract session token");
      }
      return jsonResponse({ success: true, token_hash: fromUrl });
    }

    return jsonResponse({ success: true, token_hash: hashedToken });
  } catch (error: any) {
    console.error("Error in verify-login-otp:", error);
    return jsonResponse({ success: false, error: "Verification failed. Please try again." }, 500);
  }
};

serve(handler);
