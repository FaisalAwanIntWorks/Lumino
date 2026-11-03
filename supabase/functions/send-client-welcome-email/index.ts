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

interface ClientWelcomeRequest {
  user_id: string;
  client_email: string;
  company_name: string;
  redirect_url?: string;
  plan_name?: string | null;
  recovery_link?: string | null;
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
      client_email,
      company_name,
      redirect_url,
      plan_name,
      recovery_link,
    }: ClientWelcomeRequest = await req.json();

    if (!user_id || !client_email || !company_name) {
      return new Response(
        JSON.stringify({ error: "user_id, client_email, and company_name are required" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const baseUrl = redirect_url || "https://vault.jewlx.ai";
    let setupUrl = recovery_link || "";

    // If caller didn't pre-generate a recovery link, fall back to legacy custom token
    if (!setupUrl) {
      const token = generateToken();
      const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);

      await supabase
        .from("password_reset_tokens")
        .delete()
        .eq("email", client_email.toLowerCase());

      const { error: insertError } = await supabase
        .from("password_reset_tokens")
        .insert({
          user_id,
          email: client_email.toLowerCase(),
          token,
          expires_at: expiresAt.toISOString(),
        });

      if (insertError) {
        console.error("Error storing setup token:", insertError);
        throw new Error("Failed to create setup token");
      }

      setupUrl = `${baseUrl}/reset-password?token=${token}`;
    }

    const planLine = plan_name
      ? `<p style="margin: 0 0 24px 0; color: #555; font-size: 15px; line-height: 1.6;">You're now subscribed to the <strong style="color: #1a1a1a;">${plan_name}</strong> plan.</p>`
      : "";

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
              <h2 style="margin: 0 0 16px 0; color: #1a1a1a; font-size: 22px; font-weight: 600;">Welcome to JewlX</h2>
              <p style="margin: 0 0 16px 0; color: #555; font-size: 15px; line-height: 1.6;">
                Congratulations! Your company <strong style="color: #1a1a1a;">${company_name}</strong> has been registered on the JewlX platform.
              </p>
              ${planLine}
              <!-- Account Details -->
              <div style="background-color: #f9f9f9; border: 1px solid #eee; border-radius: 6px; padding: 20px; margin-bottom: 24px;">
                <p style="margin: 0 0 12px 0; color: #1a1a1a; font-size: 13px; font-weight: 600; text-transform: uppercase;">Your Account Details</p>
                <table style="width: 100%; border-collapse: collapse;">
                  <tr>
                    <td style="padding: 6px 0; color: #777; font-size: 14px; width: 100px;">Company:</td>
                    <td style="padding: 6px 0; color: #1a1a1a; font-size: 14px; font-weight: 500;">${company_name}</td>
                  </tr>
                  <tr>
                    <td style="padding: 6px 0; color: #777; font-size: 14px;">Email:</td>
                    <td style="padding: 6px 0; color: #1a1a1a; font-size: 14px; font-weight: 500;">${client_email}</td>
                  </tr>
                  <tr>
                    <td style="padding: 6px 0; color: #777; font-size: 14px;">Portal:</td>
                    <td style="padding: 6px 0; color: #1a1a1a; font-size: 14px; font-weight: 500;">vault.jewlx.ai</td>
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
                      Set Up Your Password
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin: 24px 0 0 0; color: #555; font-size: 14px; line-height: 1.6;">
                This link will expire in <strong style="color: #1a1a1a;">48 hours</strong>. After setting your password, you can log in to access your dashboard.
              </p>
              <!-- What's Next -->
              <div style="margin-top: 24px; padding: 20px; background-color: #f9f9f9; border: 1px solid #eee; border-radius: 6px;">
                <p style="margin: 0 0 12px 0; color: #1a1a1a; font-size: 13px; font-weight: 600;">What you can do with JewlX:</p>
                <ul style="margin: 0; padding-left: 20px; color: #555; font-size: 14px; line-height: 1.8;">
                  <li>Access your personalized jewelry catalog</li>
                  <li>Customize ring designs for your customers</li>
                  <li>Manage leads and saved designs</li>
                  <li>Integrate with your Shopify store</li>
                  <li>Add staff members to help manage your account</li>
                </ul>
              </div>
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
      to: [client_email],
      subject: `Welcome to JewlX - Your account for ${company_name} is ready`,
      html: emailHtml,
      reply_to: REPLY_TO,
    });

    console.log("Client welcome email sent:", emailResponse);

    // Log the email
    await supabase.from("email_logs").insert({
      recipient_email: client_email,
      email_type: "client_welcome",
      subject: `Welcome to JewlX - Your account for ${company_name} is ready`,
      status: "sent",
      resend_id: emailResponse.data?.id,
      metadata: { 
        user_id, 
        company_name,
      },
    });

    return new Response(
      JSON.stringify({ success: true, message: "Client welcome email sent" }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: any) {
    console.error("Error in send-client-welcome-email:", error);
    return new Response(
      JSON.stringify({ error: "Failed to send client welcome email" }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);