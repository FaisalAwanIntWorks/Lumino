import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { timingSafeEqual } from "../_shared/timing-safe.ts";
import { validatePassword } from "../_shared/password-validation.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface VerifyRequest {
  token: string;
  new_password?: string;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { token, new_password }: VerifyRequest = await req.json();

    if (!token || typeof token !== 'string' || token.length < 32 || token.length > 128) {
      return new Response(
        JSON.stringify({ valid: false, error: "Invalid token format" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Fetch all unexpired, unused tokens for comparison
    // We'll use timing-safe comparison to find the matching token
    const { data: allTokens, error: tokenError } = await supabase
      .from("password_reset_tokens")
      .select("*")
      .is("used_at", null)
      .gt("expires_at", new Date().toISOString());

    if (tokenError) {
      console.error("Error fetching tokens:", tokenError);
      return new Response(
        JSON.stringify({ valid: false, error: "Failed to verify token" }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Use timing-safe comparison to find matching token
    let tokenData = null;
    for (const t of allTokens || []) {
      if (timingSafeEqual(token, t.token)) {
        tokenData = t;
        break;
      }
    }

    if (!tokenData) {
      // Use generic error to prevent token enumeration
      return new Response(
        JSON.stringify({ valid: false, error: "Invalid or expired token" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // If only verifying (no password provided), return valid
    if (!new_password) {
      // Mask email for privacy (show only first char and domain)
      const [local, domain] = tokenData.email.split('@');
      const maskedEmail = local.charAt(0) + '***@' + domain;
      return new Response(
        JSON.stringify({ valid: true, email: maskedEmail }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Fetch user's name and phone for password validation
    // Check clients table first
    let userName: string | undefined;
    let userPhone: string | undefined;

    const { data: clientData } = await supabase
      .from("clients")
      .select("company_name, phone")
      .eq("user_id", tokenData.user_id)
      .maybeSingle();

    if (clientData) {
      userName = clientData.company_name;
      userPhone = clientData.phone;
    } else {
      // Check staff_members table
      const { data: staffData } = await supabase
        .from("staff_members")
        .select("name, phone")
        .eq("user_id", tokenData.user_id)
        .maybeSingle();

      if (staffData) {
        userName = staffData.name;
        userPhone = staffData.phone;
      } else {
        // Check admin_staff_members table
        const { data: adminStaffData } = await supabase
          .from("admin_staff_members")
          .select("name, phone")
          .eq("user_id", tokenData.user_id)
          .maybeSingle();

        if (adminStaffData) {
          userName = adminStaffData.name;
          userPhone = adminStaffData.phone;
        }
      }
    }

    // Validate password strength with name/phone check
    const passwordValidation = validatePassword(new_password, { 
      name: userName, 
      phone: userPhone 
    });
    if (!passwordValidation.valid) {
      return new Response(
        JSON.stringify({ error: passwordValidation.error }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Update the user's password AND confirm email (for admin-created users who haven't confirmed yet)
    const { error: updateError } = await supabase.auth.admin.updateUserById(
      tokenData.user_id,
      { 
        password: new_password,
        email_confirm: true  // Confirm email when user sets password via secure token
      }
    );

    if (updateError) {
      console.error("Error updating password:", updateError);
      // A weak / previously-leaked password is a user error (422 from auth),
      // not a server failure — surface the real reason so it can be fixed.
      const status = (updateError as { status?: number }).status;
      const isUserError = status === 422 || status === 400;
      return new Response(
        JSON.stringify({ error: isUserError ? updateError.message : "Failed to update password" }),
        { status: isUserError ? 400 : 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Mark token as used
    await supabase
      .from("password_reset_tokens")
      .update({ used_at: new Date().toISOString() })
      .eq("id", tokenData.id);

    // Update the timestamp on staff_members if the user is a staff member
    // Note: Passwords are NOT stored in staff tables - managed by Supabase Auth only
    const { data: staffData } = await supabase
      .from("staff_members")
      .select("id")
      .eq("user_id", tokenData.user_id)
      .maybeSingle();

    if (staffData) {
      await supabase
        .from("staff_members")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", staffData.id);
    }

    // Also update timestamp on admin_staff_members if applicable
    const { data: adminStaffData } = await supabase
      .from("admin_staff_members")
      .select("id")
      .eq("user_id", tokenData.user_id)
      .maybeSingle();

    if (adminStaffData) {
      await supabase
        .from("admin_staff_members")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", adminStaffData.id);
    }

    console.log("Password reset successful for user:", tokenData.user_id);

    return new Response(
      JSON.stringify({ success: true, message: "Password updated successfully" }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: any) {
    console.error("Error in verify-reset-token:", error);
    return new Response(
      JSON.stringify({ error: "Failed to process request" }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
