import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { Resend } from "npm:resend@2.0.0";
import { denyReadOnlyAdmin } from "../_shared/admin-access.ts";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const FROM_EMAIL = "Aurezo <onboarding@resend.dev>";
const REPLY_TO = Deno.env.get("SUPPORT_EMAIL") || undefined;
const OTP_EXPIRY_MINUTES = 10;

function generateOtp(): string {
  const array = new Uint8Array(4);
  crypto.getRandomValues(array);
  const num = new DataView(array.buffer).getUint32(0) % 1000000;
  return num.toString().padStart(6, "0");
}

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

  // Read-only admin staff must not perform any write operation.
  const readOnlyDenied = await denyReadOnlyAdmin(req, corsHeaders);
  if (readOnlyDenied) return readOnlyDenied;

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

    // Identify caller from JWT
    const authClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await authClient.auth.getUser();
    if (userErr || !userData?.user?.email) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const admin = createClient(supabaseUrl, serviceKey);

    // Verify caller is an agency_admin
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

    const { action_type, target_id, target_label } = await req.json();
    if (!action_type || typeof action_type !== "string") {
      return new Response(JSON.stringify({ error: "action_type is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const adminEmail = userData.user.email.toLowerCase();
    const otp = generateOtp();
    const otpHash = await hashOtp(otp);
    const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

    const { error: insertError } = await admin.from("admin_action_otp_tokens").insert({
      email: adminEmail,
      action_type,
      target_id: target_id ? String(target_id) : null,
      otp_hash: otpHash,
      expires_at: expiresAt.toISOString(),
    });
    if (insertError) {
      console.error("Error storing OTP:", insertError);
      throw new Error("Failed to create OTP");
    }

    const actionLabel =
      action_type === "delete_client" ? "Delete Client Account" : action_type;
    const safeTarget = target_label ? String(target_label).slice(0, 200) : "";

    const emailHtml = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="color-scheme" content="light only"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">
<table role="presentation" style="width:100%;border-collapse:collapse;"><tr><td align="center" style="padding:40px 20px;">
<table role="presentation" style="width:100%;max-width:560px;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
<tr><td style="padding:32px 40px 24px;text-align:center;background:#000;">
<img src="https://studio.aurezotech.com/images/aurezo-email-logo.png" alt="Aurezo" style="height:56px;" />
</td></tr>
<tr><td style="padding:40px;">
<h2 style="margin:0 0 8px;color:#1a1a1a;font-size:22px;font-weight:600;">Confirm Sensitive Action</h2>
<p style="margin:0 0 24px;color:#555;font-size:15px;line-height:1.6;">
You requested to <strong>${actionLabel}</strong>${safeTarget ? ` for <strong>${safeTarget}</strong>` : ""}.
Use the verification code below to confirm. This code expires in <strong>${OTP_EXPIRY_MINUTES} minutes</strong>.
</p>
<table role="presentation" style="width:100%;border-collapse:collapse;"><tr><td align="center" style="padding:8px 0 24px;">
<div style="display:inline-block;background:#f8f8f8;border:2px solid #0b6e4f;border-radius:12px;padding:20px 40px;">
<span style="font-size:40px;font-weight:700;letter-spacing:10px;color:#0b6e4f;font-family:'Courier New',Courier,monospace;">${otp}</span>
</div>
</td></tr></table>
<p style="margin:0;color:#888;font-size:13px;line-height:1.6;text-align:center;">
If you did not request this, ignore this email and consider changing your password.<br>Never share this code with anyone.
</p>
</td></tr>
<tr><td style="padding:20px 40px;background:#fafafa;border-top:1px solid #eee;text-align:center;">
<p style="margin:0;color:#999;font-size:12px;">&copy; ${new Date().getFullYear()} Aurezo Admin Security</p>
</td></tr>
</table></td></tr></table></body></html>`;

    const emailResponse = await resend.emails.send({
      from: FROM_EMAIL,
      to: [adminEmail],
      subject: `Confirm: ${actionLabel}`,
      html: emailHtml,
      reply_to: REPLY_TO,
    });

    await admin.from("email_logs").insert({
      recipient_email: adminEmail,
      email_type: "admin_action_otp",
      subject: `Confirm: ${actionLabel}`,
      status: "sent",
      resend_id: emailResponse.data?.id,
      metadata: { action_type, target_id },
    });

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    console.error("send-admin-action-otp error:", error);
    return new Response(JSON.stringify({ error: "Failed to send verification code" }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
});
