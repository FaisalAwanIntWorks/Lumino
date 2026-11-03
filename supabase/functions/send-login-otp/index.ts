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
const OTP_EXPIRY_MINUTES = 10;

function generateOtp(): string {
  const array = new Uint8Array(4);
  crypto.getRandomValues(array);
  const num = (new DataView(array.buffer).getUint32(0) % 1000000);
  return num.toString().padStart(6, "0");
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
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { email } = await req.json();

    if (!email || typeof email !== "string") {
      return new Response(
        JSON.stringify({ error: "Email is required" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(normalizedEmail) || normalizedEmail.length > 320) {
      return new Response(
        JSON.stringify({ error: "Invalid email format" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Check user exists — don't reveal this to the client
    let userExists = false;
    try {
      const perPage = 1000;
      for (let page = 1; page <= 10; page++) {
        const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
        if (error) break;
        const found = data?.users?.find((u) => (u.email || "").toLowerCase() === normalizedEmail);
        if (found) { userExists = true; break; }
        if (!data?.users?.length || data.users.length < perPage) break;
      }
    } catch {
      // Silently fail — return generic success to prevent enumeration
    }

    // Always return success to prevent user enumeration
    if (!userExists) {
      console.log("OTP requested for non-existent user:", normalizedEmail);
      return new Response(
        JSON.stringify({ success: true }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const otp = generateOtp();
    const otpHash = await hashOtp(otp);
    const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

    // Note: we do NOT delete previous unused OTPs here. Verification accepts any
    // unused, unexpired hash for this email, so concurrent sends (e.g. double-click
    // or React StrictMode) won't invalidate the code the user actually received.


    // Store hashed OTP
    const { error: insertError } = await supabase
      .from("login_otp_tokens")
      .insert({
        email: normalizedEmail,
        otp_hash: otpHash,
        expires_at: expiresAt.toISOString(),
      });

    if (insertError) {
      console.error("Error storing OTP:", insertError);
      throw new Error("Failed to create OTP");
    }

    // Send OTP email via Resend
    const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light only">
  <title>Your JewlX Sign-In Code</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f5f5f5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" style="width: 100%; max-width: 560px; border-collapse: collapse; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.08);">
          <!-- Header -->
          <tr>
            <td style="padding: 32px 40px 24px; text-align: center; background-color: #000000;">
              <img src="https://vault.jewlx.ai/images/jewelx-email-logo.png" alt="JewlX" style="height: 56px;" />
            </td>
          </tr>
          <!-- Content -->
          <tr>
            <td style="padding: 40px;">
              <h2 style="margin: 0 0 8px 0; color: #1a1a1a; font-size: 22px; font-weight: 600;">Your Sign-In Code</h2>
              <p style="margin: 0 0 32px 0; color: #555; font-size: 15px; line-height: 1.6;">
                Use the code below to sign in to your JewlX account. This code expires in <strong style="color: #1a1a1a;">${OTP_EXPIRY_MINUTES} minutes</strong>.
              </p>
              <!-- OTP Box -->
              <table role="presentation" style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td align="center" style="padding: 8px 0 32px 0;">
                    <div style="display: inline-block; background-color: #f8f8f8; border: 2px solid #0b6e4f; border-radius: 12px; padding: 20px 40px;">
                      <span style="font-size: 40px; font-weight: 700; letter-spacing: 10px; color: #0b6e4f; font-family: 'Courier New', Courier, monospace;">${otp}</span>
                    </div>
                  </td>
                </tr>
              </table>
              <p style="margin: 0; color: #888; font-size: 13px; line-height: 1.6; text-align: center;">
                If you didn't request this code, you can safely ignore this email.<br>
                Never share this code with anyone.
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
</html>`;

    const emailResponse = await resend.emails.send({
      from: FROM_EMAIL,
      to: [normalizedEmail],
      subject: "Your JewlX Sign-In Code",
      html: emailHtml,
      reply_to: REPLY_TO,
    });

    console.log("OTP email sent:", { recipient: normalizedEmail.substring(0, 3) + "***" });

    // Log the email
    await supabase.from("email_logs").insert({
      recipient_email: normalizedEmail,
      email_type: "login_otp",
      subject: "Your JewlX Sign-In Code",
      status: "sent",
      resend_id: emailResponse.data?.id,
    });

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: any) {
    console.error("Error in send-login-otp:", error);
    return new Response(
      JSON.stringify({ error: "Failed to send verification code" }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
