import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const Resend = (await import("https://esm.sh/resend@2.0.0")).Resend;

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const FROM_EMAIL = "Aurezo <onboarding@resend.dev>";
const REPLY_TO = Deno.env.get("SUPPORT_EMAIL") || undefined;

// Generate a secure random token
function generateToken(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

interface ResetRequest {
  email: string;
  redirect_url: string;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { email, redirect_url }: ResetRequest = await req.json();

    if (!email) {
      return new Response(
        JSON.stringify({ error: "Email is required" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Check if user exists (don't reveal if user exists or not)
    let user: { id: string; email?: string | null } | undefined;
    try {
      const perPage = 1000;
      for (let page = 1; page <= 10; page++) {
        const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
        if (error) {
          console.error("Error listing users:", error);
          break;
        }
        user = data?.users?.find((u) => (u.email || "").toLowerCase() === normalizedEmail);
        if (user) break;
        if (!data?.users?.length || data.users.length < perPage) break;
      }
    } catch (err) {
      console.error("Error searching user by email:", err);
    }

    // Always return success to prevent user enumeration
    if (!user) {
      console.log("Password reset requested for non-existent user:", normalizedEmail);
      return new Response(
        JSON.stringify({ success: true, message: "If an account exists, a reset link has been sent." }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Generate token and expiry (1 hour)
    const token = generateToken();
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    // Delete any existing tokens for this email
    await supabase
      .from("password_reset_tokens")
      .delete()
      .eq("email", normalizedEmail);

    // Store the token
    const { error: insertError } = await supabase
      .from("password_reset_tokens")
      .insert({
        user_id: user.id,
        email: normalizedEmail,
        token,
        expires_at: expiresAt.toISOString(),
      });

    if (insertError) {
      console.error("Error storing reset token:", insertError);
      throw new Error("Failed to create reset token");
    }

    // Build reset URL
    const baseUrl = redirect_url || "https://studio.aurezotech.com";
    const resetUrl = `${baseUrl}/reset-password?token=${token}`;

    // Send reset email
    const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light only">
  <meta name="supported-color-schemes" content="light only">
  <title>Reset Your Password</title>
  <style>
    :root { color-scheme: light only; }
    @media (prefers-color-scheme: dark) {
      .email-header { background-color: #000000 !important; }
      .email-wrapper { background-color: #f5f5f5 !important; }
      .email-card { background-color: #ffffff !important; }
    }
    [data-ogsc] .email-header { background-color: #000000 !important; }
  </style>
</head>
<body style="margin: 0; padding: 0; background-color: #f5f5f5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" style="width: 100%; max-width: 560px; border-collapse: collapse; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);">
          <!-- Header -->
          <tr>
            <td class="email-header" style="padding: 32px 40px 24px; text-align: center; background-color: #000000;">
              <img src="https://studio.aurezotech.com/images/aurezo-email-logo.png" alt="Aurezo" style="height: 56px;" />
            </td>
          </tr>
          <!-- Content -->
          <tr>
            <td style="padding: 40px;">
              <h2 style="margin: 0 0 16px 0; color: #1a1a1a; font-size: 22px; font-weight: 600;">Reset Your Password</h2>
              <p style="margin: 0 0 24px 0; color: #555; font-size: 15px; line-height: 1.6;">
                We received a request to reset the password for your Aurezo account. Click the button below to set a new password.
              </p>
              <!-- Button -->
              <table role="presentation" style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td align="center" style="padding: 16px 0;">
                    <a href="${resetUrl}" style="display: inline-block; padding: 12px 24px; background-color: #0b6e4f; color: #ffffff; text-decoration: none; font-size: 15px; font-weight: 600; border-radius: 6px;">
                      Reset Password
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin: 24px 0 0 0; color: #555; font-size: 14px; line-height: 1.6;">
                This link will expire in <strong style="color: #1a1a1a;">1 hour</strong>. If you didn't request this password reset, you can safely ignore this email.
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding: 24px 40px; background-color: #fafafa; border-top: 1px solid #eee;">
              <p style="margin: 0; color: #999; font-size: 12px; text-align: center;">
                &copy; ${new Date().getFullYear()} Aurezo. All rights reserved.<br>
                <a href="https://aurezotech.com" style="color: #0b6e4f; text-decoration: none; font-weight: 600;">aurezotech.com</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `;

    const emailResponse = await resend.emails.send({
      from: FROM_EMAIL,
      to: [email],
      subject: "Reset Your Aurezo Password",
      html: emailHtml,
      reply_to: REPLY_TO,
    });

    console.log("Password reset email sent:", emailResponse);

    // Log the email
    await supabase.from("email_logs").insert({
      recipient_email: email,
      email_type: "password_reset",
      subject: "Reset Your Aurezo Password",
      status: "sent",
      resend_id: emailResponse.data?.id,
    });

    return new Response(
      JSON.stringify({ success: true, message: "If an account exists, a reset link has been sent." }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: any) {
    console.error("Error in request-password-reset:", error);
    return new Response(
      JSON.stringify({ error: "Failed to process request" }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);