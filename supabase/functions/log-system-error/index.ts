import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.81.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SystemErrorLog {
  error_source: 'edge_function' | 'frontend' | 'database' | 'external_api';
  function_name: string;
  error_type: 'network' | 'auth' | 'database' | 'validation' | 'timeout' | 'permission' | 'unknown';
  error_message: string;
  error_stack?: string;
  severity?: 'low' | 'medium' | 'high' | 'critical';
  client_id?: string;
  user_id?: string;
  endpoint?: string;
  request_metadata?: Record<string, unknown>;
}

// Auto-detect severity based on error type and message
function detectSeverity(errorType: string, errorMessage: string): string {
  const criticalPatterns = [
    /database.*down/i,
    /connection.*refused/i,
    /service.*unavailable/i,
    /auth.*failed/i,
    /permission.*denied/i,
    /fatal/i,
  ];
  
  const highPatterns = [
    /timeout/i,
    /500/i,
    /internal.*error/i,
    /failed.*to.*delete/i,
    /failed.*to.*create/i,
  ];

  if (errorType === 'auth' || errorType === 'permission') {
    return 'high';
  }

  for (const pattern of criticalPatterns) {
    if (pattern.test(errorMessage)) {
      return 'critical';
    }
  }

  for (const pattern of highPatterns) {
    if (pattern.test(errorMessage)) {
      return 'high';
    }
  }

  if (errorType === 'timeout' || errorType === 'database') {
    return 'high';
  }

  if (errorType === 'validation') {
    return 'low';
  }

  return 'medium';
}

// Sanitize error data to remove sensitive information
function sanitizeErrorData(data: SystemErrorLog): SystemErrorLog {
  const sanitized = { ...data };
  
  // Remove sensitive patterns from error message and stack
  const sensitivePatterns = [
    /password[=:]\s*\S+/gi,
    /token[=:]\s*\S+/gi,
    /api[_-]?key[=:]\s*\S+/gi,
    /secret[=:]\s*\S+/gi,
    /bearer\s+\S+/gi,
  ];

  if (sanitized.error_message) {
    for (const pattern of sensitivePatterns) {
      sanitized.error_message = sanitized.error_message.replace(pattern, '[REDACTED]');
    }
  }

  if (sanitized.error_stack) {
    for (const pattern of sensitivePatterns) {
      sanitized.error_stack = sanitized.error_stack.replace(pattern, '[REDACTED]');
    }
  }

  // Remove sensitive fields from request_metadata
  if (sanitized.request_metadata) {
    const safeMetadata = { ...sanitized.request_metadata };
    const sensitiveKeys = ['authorization', 'cookie', 'password', 'token', 'secret', 'apikey'];
    
    for (const key of Object.keys(safeMetadata)) {
      if (sensitiveKeys.some(sk => key.toLowerCase().includes(sk))) {
        safeMetadata[key] = '[REDACTED]';
      }
    }
    
    sanitized.request_metadata = safeMetadata;
  }

  return sanitized;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const errorData: SystemErrorLog = await req.json();

    // Validate required fields
    if (!errorData.error_source || !errorData.function_name || !errorData.error_message) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: error_source, function_name, error_message" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Sanitize the error data
    const sanitizedData = sanitizeErrorData(errorData);

    // Auto-detect severity if not provided
    const severity = sanitizedData.severity || detectSeverity(
      sanitizedData.error_type || 'unknown',
      sanitizedData.error_message
    );

    // Insert error into system_errors table
    const { data, error: insertError } = await supabaseAdmin
      .from("system_errors")
      .insert({
        error_source: sanitizedData.error_source,
        function_name: sanitizedData.function_name,
        error_type: sanitizedData.error_type || 'unknown',
        error_message: sanitizedData.error_message,
        error_stack: sanitizedData.error_stack,
        severity,
        client_id: sanitizedData.client_id || null,
        user_id: sanitizedData.user_id || null,
        endpoint: sanitizedData.endpoint,
        request_metadata: sanitizedData.request_metadata || {},
      })
      .select()
      .single();

    if (insertError) {
      console.error("Failed to log system error:", insertError);
      return new Response(
        JSON.stringify({ error: "Failed to log error" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create admin notifications for high/critical severity errors
    if (severity === 'critical' || severity === 'high') {
      try {
        const { data: adminUsers } = await supabaseAdmin
          .from("user_roles")
          .select("user_id")
          .eq("role", "agency_admin");

        if (adminUsers && adminUsers.length > 0) {
          const notifications = adminUsers.map((admin: { user_id: string }) => ({
            user_id: admin.user_id,
            category: 'system',
            title: `${severity === 'critical' ? '🔴 Critical' : '🟠 High'} System Error`,
            message: `[${sanitizedData.function_name}] ${sanitizedData.error_message.substring(0, 200)}`,
            metadata: {
              error_id: data.id,
              severity,
              error_source: sanitizedData.error_source,
              function_name: sanitizedData.function_name,
            },
          }));

          await supabaseAdmin.from("admin_notifications").insert(notifications);
        }
      } catch (notifError) {
        console.error("Failed to create admin notification for system error:", notifError);
      }
    }

    console.log(`System error logged: ${severity} - ${sanitizedData.function_name} - ${sanitizedData.error_message.substring(0, 100)}`);

    return new Response(
      JSON.stringify({ success: true, error_id: data.id }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error("Error in log-system-error:", errorMessage);
    return new Response(
      JSON.stringify({ error: "Failed to process error log" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
