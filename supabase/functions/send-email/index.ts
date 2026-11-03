import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { 
  getRequiredSecret, 
  getOptionalSecret,
  sanitizeErrorForClient,
  corsHeaders 
} from '../_shared/secrets-validation.ts';

const Resend = (await import("https://esm.sh/resend@2.0.0")).Resend;

// SECURITY: Initialize Resend with validated secret
let resend: any;
try {
  const resendApiKey = getRequiredSecret("RESEND_API_KEY");
  resend = new Resend(resendApiKey);
} catch {
  console.error("RESEND_API_KEY not configured - email sending disabled");
}

const FROM_EMAIL = "JewlX <onboarding@resend.dev>";
const REPLY_TO = Deno.env.get("SUPPORT_EMAIL") || undefined;

interface EmailRequest {
  to: string;
  subject: string;
  html: string;
  email_type: string;
  metadata?: Record<string, any>;
}

interface EmailRequest {
  to: string;
  subject: string;
  html: string;
  email_type: string;
  metadata?: Record<string, any>;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // SECURITY: Validate required secrets
    if (!resend) {
      return new Response(
        JSON.stringify({ error: "Email service not configured" }),
        { status: 503, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // SECURITY: Use validated secret getters
    const supabaseUrl = getRequiredSecret("SUPABASE_URL");
    const supabaseServiceKey = getRequiredSecret("SUPABASE_SERVICE_ROLE_KEY");
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // SECURITY: Require authentication for email sending
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Authentication required" }),
        { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Invalid authentication" }),
        { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Invalid authentication" }),
        { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // SECURITY: Check if user has permission (agency_admin, client owner, or staff)
    const { data: adminRole } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .in('role', ['agency_admin', 'client', 'staff'])
      .single();

    if (!adminRole) {
      return new Response(
        JSON.stringify({ error: "Access denied" }),
        { status: 403, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const { to, subject, html, email_type, metadata }: EmailRequest = await req.json();

    // SECURITY: Validate inputs
    if (!to || !subject || !html || !email_type) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // SECURITY: Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(to) || to.length > 320) {
      return new Response(
        JSON.stringify({ error: "Invalid email format" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // SECURITY: Limit subject and html length
    if (subject.length > 200 || html.length > 100000) {
      return new Response(
        JSON.stringify({ error: "Content exceeds maximum length" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Log email attempt
    const { data: logEntry } = await supabase
      .from("email_logs")
      .insert({
        recipient_email: to,
        email_type,
        subject,
        status: "pending",
        metadata,
      })
      .select()
      .single();

    // Send email via Resend
    const emailResponse = await resend.emails.send({
      from: FROM_EMAIL,
      to: [to],
      subject,
      html,
      reply_to: REPLY_TO,
    });

    // SECURITY: Don't log email content, only metadata
    console.log("Email sent successfully:", { recipient: to.substring(0, 3) + "***", type: email_type });

    // Update log with success
    if (logEntry?.id) {
      await supabase
        .from("email_logs")
        .update({
          status: "sent",
          resend_id: emailResponse.data?.id,
        })
        .eq("id", logEntry.id);
    }

    return new Response(
      JSON.stringify({ success: true, id: emailResponse.data?.id }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: unknown) {
    // SECURITY: Never expose internal errors to client
    const safeMessage = sanitizeErrorForClient(error, "Failed to send email");
    console.error("Email function error - safe message returned");

    return new Response(
      JSON.stringify({ error: safeMessage }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
