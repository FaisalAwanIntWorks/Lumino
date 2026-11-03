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

interface StaffWelcomeRequest {
  user_id: string;
  staff_email: string;
  staff_name: string;
  client_company_name: string;
  client_email: string;
  redirect_url?: string;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { 
      user_id, 
      staff_email, 
      staff_name, 
      client_company_name, 
      client_email,
      redirect_url 
    }: StaffWelcomeRequest = await req.json();

    if (!user_id || !staff_email || !staff_name || !client_company_name) {
      return new Response(
        JSON.stringify({ error: "user_id, staff_email, staff_name, and client_company_name are required" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Generate token and expiry (48 hours for new staff setup)
    const token = generateToken();
    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000); // 48 hours

    // Delete any existing tokens for this email
    await supabase
      .from("password_reset_tokens")
      .delete()
      .eq("email", staff_email.toLowerCase());

    // Store the token in password_reset_tokens table
    const { error: insertError } = await supabase
      .from("password_reset_tokens")
      .insert({
        user_id,
        email: staff_email.toLowerCase(),
        token,
        expires_at: expiresAt.toISOString(),
      });

    if (insertError) {
      console.error("Error storing setup token:", insertError);
      throw new Error("Failed to create setup token");
    }

    // Build setup URL
    const baseUrl = redirect_url || "https://vault.jewlx.ai";
    const setupUrl = `${baseUrl}/reset-password?token=${token}`;

    // Send welcome email with setup link
    const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Welcome to JewlX</title>
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
              <h2 style="margin: 0 0 16px 0; color: #1a1a1a; font-size: 22px; font-weight: 600;">Welcome to JewlX, ${staff_name}</h2>
              <p style="margin: 0 0 24px 0; color: #555; font-size: 15px; line-height: 1.6;">
                You have been added as a staff member by <strong style="color: #1a1a1a;">${client_company_name}</strong>.
              </p>
              <!-- Account Details -->
              <div style="background-color: #f9f9f9; border: 1px solid #eee; border-radius: 6px; padding: 20px; margin-bottom: 24px;">
                <p style="margin: 0 0 12px 0; color: #1a1a1a; font-size: 13px; font-weight: 600; text-transform: uppercase;">Your Account Details</p>
                <table style="width: 100%; border-collapse: collapse;">
                  <tr>
                    <td style="padding: 6px 0; color: #777; font-size: 14px; width: 110px;">Email:</td>
                    <td style="padding: 6px 0; color: #1a1a1a; font-size: 14px; font-weight: 500;">${staff_email}</td>
                  </tr>
                  <tr>
                    <td style="padding: 6px 0; color: #777; font-size: 14px;">Registered by:</td>
                    <td style="padding: 6px 0; color: #1a1a1a; font-size: 14px; font-weight: 500;">${client_company_name}</td>
                  </tr>
                  <tr>
                    <td style="padding: 6px 0; color: #777; font-size: 14px;">Contact:</td>
                    <td style="padding: 6px 0; color: #1a1a1a; font-size: 14px; font-weight: 500;">${client_email}</td>
                  </tr>
                </table>
              </div>
              <p style="margin: 0 0 24px 0; color: #555; font-size: 15px; line-height: 1.6;">
                To activate your account, please set up your password by clicking the button below:
              </p>
              <!-- Button -->
              <table role="presentation" style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td align="center" style="padding: 16px 0;">
                    <a href="${setupUrl}" style="display: inline-block; padding: 12px 24px; background-color: #0b6e4f; color: #ffffff; text-decoration: none; font-size: 15px; font-weight: 600; border-radius: 6px;">
                      Set Your Password
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin: 24px 0 0 0; color: #555; font-size: 14px; line-height: 1.6;">
                This link will expire in <strong style="color: #1a1a1a;">48 hours</strong>. After setting your password, you can log in to access your account.
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
      to: [staff_email],
      subject: `Welcome to JewlX - ${client_company_name} has added you as a staff member`,
      html: emailHtml,
      reply_to: REPLY_TO,
    });

    console.log("Staff welcome email sent:", emailResponse);

    // Log the email
    await supabase.from("email_logs").insert({
      recipient_email: staff_email,
      email_type: "staff_welcome",
      subject: `Welcome to JewlX - ${client_company_name} has added you as a staff member`,
      status: "sent",
      resend_id: emailResponse.data?.id,
      metadata: { 
        user_id, 
        staff_name, 
        client_company_name,
        client_email
      },
    });

    return new Response(
      JSON.stringify({ success: true, message: "Staff welcome email sent" }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: any) {
    console.error("Error in send-staff-welcome-email:", error);
    return new Response(
      JSON.stringify({ error: "Failed to send staff welcome email" }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);