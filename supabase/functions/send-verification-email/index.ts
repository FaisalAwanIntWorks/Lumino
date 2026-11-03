import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const Resend = (await import("https://esm.sh/resend@2.0.0")).Resend;

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const FROM_EMAIL = "JewlX <onboarding@resend.dev>";
const REPLY_TO = Deno.env.get("SUPPORT_EMAIL") || undefined;

// Generate a secure random token
function generateToken(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

interface VerificationRequest {
  user_id: string;
  email: string;
  company_name: string;
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

    const { user_id, email, company_name, redirect_url }: VerificationRequest = await req.json();

    if (!user_id || !email) {
      return new Response(
        JSON.stringify({ error: "user_id and email are required" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Generate token and expiry (24 hours)
    const token = generateToken();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    // Delete any existing tokens for this email
    await supabase
      .from("email_verification_tokens")
      .delete()
      .eq("email", email.toLowerCase());

    // Store the token
    const { error: insertError } = await supabase
      .from("email_verification_tokens")
      .insert({
        user_id,
        email: email.toLowerCase(),
        token,
        expires_at: expiresAt.toISOString(),
      });

    if (insertError) {
      console.error("Error storing verification token:", insertError);
      throw new Error("Failed to create verification token");
    }

    // Build verification URL
    const baseUrl = redirect_url || "https://vault.jewlx.ai";
    const verifyUrl = `${baseUrl}/verify-email?token=${token}`;

    // Send verification email
    const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Verify Your Email</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f5f5f5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" style="width: 100%; max-width: 560px; border-collapse: collapse; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);">
          <!-- Header -->
          <tr>
            <td style="padding: 32px 40px 24px; text-align: center; background-color: #000000;">
              <img src="https://vault.jewlx.ai/images/jewelx-email-logo.png" alt="JewlX" style="height: 56px;" />
            </td>
          </tr>
          <!-- Content -->
          <tr>
            <td style="padding: 40px;">
              <h2 style="margin: 0 0 16px 0; color: #1a1a1a; font-size: 22px; font-weight: 600;">Verify Your Email</h2>
              <p style="margin: 0 0 24px 0; color: #555; font-size: 15px; line-height: 1.6;">
                Hi${company_name ? ` <strong style="color: #1a1a1a;">${company_name}</strong>` : ""},<br><br>
                Thank you for signing up! Please verify your email address to complete your registration and get started with JewlX.
              </p>
              <!-- Button -->
              <table role="presentation" style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td align="center" style="padding: 16px 0;">
                    <a href="${verifyUrl}" style="display: inline-block; padding: 12px 24px; background-color: #0b6e4f; color: #ffffff; text-decoration: none; font-size: 15px; font-weight: 600; border-radius: 6px;">
                      Verify Email Address
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin: 24px 0 0 0; color: #555; font-size: 14px; line-height: 1.6;">
                This link will expire in <strong style="color: #1a1a1a;">24 hours</strong>. If you didn't create an account, you can safely ignore this email.
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding: 24px 40px; background-color: #fafafa; border-top: 1px solid #eee;">
              <p style="margin: 0; color: #999; font-size: 12px; text-align: center;">
                &copy; ${new Date().getFullYear()} JewlX. All rights reserved.<br>
                <a href="https://jewlx.ai" style="color: #0b6e4f; text-decoration: none; font-weight: 600;">jewlx.ai</a>
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
      subject: "Verify Your JewlX Account",
      html: emailHtml,
      reply_to: REPLY_TO,
    });

    console.log("Verification email sent:", emailResponse);

    // Log the email
    await supabase.from("email_logs").insert({
      recipient_email: email,
      email_type: "email_verification",
      subject: "Verify Your JewlX Account",
      status: "sent",
      resend_id: emailResponse.data?.id,
      metadata: { user_id, company_name },
    });

    return new Response(
      JSON.stringify({ success: true, message: "Verification email sent" }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: any) {
    console.error("Error in send-verification-email:", error);
    return new Response(
      JSON.stringify({ error: "Failed to send verification email" }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);