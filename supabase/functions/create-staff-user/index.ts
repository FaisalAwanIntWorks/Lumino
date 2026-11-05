import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.81.1";
import { validatePassword } from "../_shared/password-validation.ts";

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

interface CreateStaffRequest {
  email: string;
  password: string;
  name: string;
  phone?: string;
  clientId: string;
  permissions: {
    catalog_access: boolean;
  };
}

serve(async (req: Request) => {
  // Handle CORS
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
    // Create admin client
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // ===== JWT AUTHENTICATION =====
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized - Authentication required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized - Invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    // ===== END JWT AUTHENTICATION =====

    const { email, password, name, phone, clientId, permissions }: CreateStaffRequest = await req.json();

    // Validate input
    if (!email || !password || !name || !clientId) {
      return new Response(
        JSON.stringify({ error: "Email, password, name, and client ID are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate password strength with name/phone check
    const passwordValidation = validatePassword(password, { name, phone });
    if (!passwordValidation.valid) {
      return new Response(
        JSON.stringify({ error: passwordValidation.error }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ===== AUTHORIZATION: Verify user owns this client =====
    const { data: client, error: clientAuthError } = await supabaseAdmin
      .from('clients')
      .select('user_id, company_name, email')
      .eq('id', clientId)
      .single();

    if (clientAuthError || !client) {
      return new Response(
        JSON.stringify({ error: 'Client not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if user is the client owner OR an agency_admin
    const { data: adminRole } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'agency_admin')
      .single();

    if (client.user_id !== user.id && !adminRole) {
      return new Response(
        JSON.stringify({ error: 'Forbidden - Not authorized to manage staff for this client' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    // ===== END AUTHORIZATION =====

    const clientData = { company_name: client.company_name, email: client.email };

    // 1. Create the auth user (or handle existing user)
    let userId: string;
    
    const { data: authData, error: createAuthError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // Auto-confirm the email
    });

    if (createAuthError) {
      // Check if user already exists
      if (createAuthError.message.includes("already been registered")) {
        console.log("User already exists, checking if staff setup is complete...");
        
        // Get existing user by email
        const { data: existingUsers, error: listError } = await supabaseAdmin.auth.admin.listUsers();
        
        if (listError) {
          console.error("Error listing users:", listError);
          return new Response(
            JSON.stringify({ error: "Failed to check existing user" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        
        const existingUser = existingUsers.users.find(u => u.email?.toLowerCase() === email.toLowerCase());
        
        if (!existingUser) {
          return new Response(
            JSON.stringify({ error: "User exists but could not be found" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        
        userId = existingUser.id;
        
        // Check if already a staff member for this client
        const { data: existingStaff } = await supabaseAdmin
          .from("staff_members")
          .select("id")
          .eq("user_id", userId)
          .eq("client_id", clientId)
          .single();
        
        if (existingStaff) {
          return new Response(
            JSON.stringify({ error: "This user is already a staff member for this client" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        
        // Check if user has staff role, if not add it
        const { data: existingRole } = await supabaseAdmin
          .from("user_roles")
          .select("id")
          .eq("user_id", userId)
          .eq("role", "staff")
          .single();
        
        if (!existingRole) {
          const { error: roleError } = await supabaseAdmin
            .from("user_roles")
            .insert({ user_id: userId, role: "staff" });
          
          if (roleError) {
            console.error("Error assigning role to existing user:", roleError);
            return new Response(
              JSON.stringify({ error: roleError.message }),
              { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
        }
      } else {
        console.error("Error creating auth user:", createAuthError);
        return new Response(
          JSON.stringify({ error: createAuthError.message }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    } else {
      userId = authData.user.id;
      
      // Assign staff role for new users
      const { error: roleError } = await supabaseAdmin
        .from("user_roles")
        .insert({ user_id: userId, role: "staff" });
      
      if (roleError) {
        console.error("Error assigning role:", roleError);
        // Clean up auth user
        await supabaseAdmin.auth.admin.deleteUser(userId);
        return new Response(
          JSON.stringify({ error: roleError.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // 2. Create staff_members record with user_id (password is NOT stored - shown one-time only)
    const { error: staffError } = await supabaseAdmin
      .from("staff_members")
      .insert({
        client_id: clientId,
        user_id: userId,
        name,
        email,
        phone: phone || null,
        status: "active",
        permissions,
      });

    if (staffError) {
      console.error("Error creating staff member:", staffError);
      return new Response(
        JSON.stringify({ error: staffError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Log the activity
    await supabaseAdmin.from('client_activity_logs').insert({
      client_id: clientId,
      user_id: userId, // The new staff user
      user_email: email,
      user_name: name,
      user_type: 'staff',
      action_type: 'staff_create',
      action_category: 'staff_management',
      description: `Staff member "${name}" was created`,
      metadata: { 
        staff_email: email,
        staff_name: name,
        permissions,
        created_by_user_id: user.id,
        created_by_email: user.email
      },
    });

    // 4. Send welcome email with password setup link
    try {
      // Generate token and expiry (48 hours for new staff setup)
      const token = generateToken();
      const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000); // 48 hours

      // Delete any existing tokens for this email
      await supabaseAdmin
        .from("password_reset_tokens")
        .delete()
        .eq("email", email.toLowerCase());

      // Store the token in password_reset_tokens table
      const { error: tokenInsertError } = await supabaseAdmin
        .from("password_reset_tokens")
        .insert({
          user_id: userId,
          email: email.toLowerCase(),
          token,
          expires_at: expiresAt.toISOString(),
        });

      if (tokenInsertError) {
        console.error("Error storing setup token:", tokenInsertError);
        // Don't fail the whole operation, just log
      } else {
        // Build setup URL - use vault for staff (client portal)
        const baseUrl = "https://studio.aurezotech.com";
        const setupUrl = `${baseUrl}/reset-password?token=${token}`;

        // Send welcome email with setup link
        const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Welcome to Aurezo</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f5f5f5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" style="width: 100%; max-width: 560px; border-collapse: collapse; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.08);">
          <tr>
            <td style="padding: 32px 40px 24px; text-align: center; background-color: #000000;">
              <img src="https://studio.aurezotech.com/images/aurezo-email-logo.png" alt="Aurezo" style="height: 56px;" />
            </td>
          </tr>
          <tr>
            <td style="padding: 40px;">
              <h2 style="margin: 0 0 12px; color: #1a1a1a; font-size: 22px; font-weight: 600;">Welcome, ${name}</h2>
              <p style="margin: 0 0 24px; color: #555; font-size: 15px; line-height: 1.6;">
                You have been added as a staff member by <strong style="color: #1a1a1a;">${clientData.company_name}</strong>
              </p>
              <div style="padding: 16px; background-color: #f9f9f9; border-radius: 6px; border: 1px solid #eee; margin-bottom: 24px;">
                <table style="width: 100%; border-collapse: collapse;">
                  <tr>
                    <td style="padding: 6px 0; color: #777; font-size: 14px; width: 100px;">Email:</td>
                    <td style="padding: 6px 0; color: #1a1a1a; font-size: 14px; font-weight: 500;">${email}</td>
                  </tr>
                  <tr>
                    <td style="padding: 6px 0; color: #777; font-size: 14px;">Company:</td>
                    <td style="padding: 6px 0; color: #1a1a1a; font-size: 14px; font-weight: 500;">${clientData.company_name}</td>
                  </tr>
                </table>
              </div>
              <p style="margin: 0 0 24px; color: #555; font-size: 15px; line-height: 1.6;">
                Set up your password to activate your account.
              </p>
              <table role="presentation" style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td align="center" style="padding: 8px 0 24px;">
                    <a href="${setupUrl}" style="display: inline-block; padding: 14px 32px; background-color: #0b6e4f; color: #ffffff; text-decoration: none; font-size: 15px; font-weight: 600; border-radius: 6px;">
                      Set Up Your Password
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin: 0 0 20px; color: #777; font-size: 14px; line-height: 1.6;">
                This link will expire in <strong style="color: #1a1a1a;">48 hours</strong>.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding: 20px 40px; background-color: #fafafa; border-top: 1px solid #eee;">
              <p style="margin: 0; color: #999; font-size: 12px; text-align: center;">
                &copy; ${new Date().getFullYear()} Aurezo. All rights reserved.<br>
                <a href="https://aurezotech.com" style="color: #0b6e4f; text-decoration: none;">aurezotech.com</a>
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
          subject: `Welcome to Aurezo - ${clientData.company_name} has added you as a staff member`,
          html: emailHtml,
          reply_to: REPLY_TO,
        });

        console.log("Staff welcome email sent:", emailResponse);

        // Log the email
        await supabaseAdmin.from("email_logs").insert({
          recipient_email: email,
          email_type: "staff_welcome",
          subject: `Welcome to Aurezo - ${clientData.company_name} has added you as a staff member`,
          status: "sent",
          resend_id: emailResponse.data?.id,
          metadata: { 
            user_id: userId, 
            staff_name: name, 
            client_company_name: clientData.company_name,
            client_email: clientData.email
          },
        });
      }
    } catch (emailError: any) {
      console.error("Error sending welcome email:", emailError);
      // Don't fail the whole operation if email fails
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Staff member ${name} created successfully. A welcome email has been sent.`,
        userId,
        email,
        // Return password one-time for display - it is NOT stored in the database
        temporaryPassword: password
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    console.error("Unexpected error:", error);
    return new Response(
      JSON.stringify({ error: "An unexpected error occurred" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
