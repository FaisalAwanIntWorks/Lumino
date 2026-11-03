import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.81.1";
import { denyReadOnlyAdmin } from "../_shared/admin-access.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface DeleteAuthUserRequest {
  userId?: string;
  email?: string;
}

const normalizeEmail = (email: string) => email.trim().toLowerCase();

// Retry helper with exponential backoff
async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelayMs: number = 500
): Promise<T> {
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      // Don't retry on 4xx errors (client errors)
      if (lastError.message.includes('400') || 
          lastError.message.includes('401') || 
          lastError.message.includes('403') || 
          lastError.message.includes('404')) {
        throw lastError;
      }
      
      if (attempt < maxRetries - 1) {
        const delay = baseDelayMs * Math.pow(2, attempt);
        console.log(`Retry attempt ${attempt + 1}/${maxRetries} after ${delay}ms`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  throw lastError;
}

// Log error to system_errors table
async function logError(
  supabaseAdmin: any,
  error: Error | string,
  context: {
    targetUserId?: string;
    targetEmail?: string;
    operation: string;
  }
): Promise<void> {
  try {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    
    await supabaseAdmin.from('system_errors').insert({
      error_source: 'edge_function',
      function_name: 'delete-auth-user',
      error_type: errorMessage.includes('timeout') ? 'timeout' : 
                  errorMessage.includes('network') ? 'network' : 'unknown',
      error_message: errorMessage,
      error_stack: errorStack,
      severity: 'high',
      endpoint: '/delete-auth-user',
      request_metadata: {
        operation: context.operation,
        target_user_id: context.targetUserId,
        target_email: context.targetEmail ? '[REDACTED]' : undefined,
      }
    });
  } catch (logError) {
    // Don't fail the main operation if logging fails
    console.error('Failed to log error:', logError);
  }
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Read-only admin staff must not perform any write operation.
  const readOnlyDenied = await denyReadOnlyAdmin(req, corsHeaders);
  if (readOnlyDenied) return readOnlyDenied;

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";

    // Validate caller is an admin (agency_admin OR admin_staff)
    const supabase = createClient(supabaseUrl, anonKey, {
      global: {
        headers: { Authorization: authHeader },
      },
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if user is agency_admin OR admin_staff
    const { data: isAgencyAdmin } = await supabase.rpc("has_role", {
      _user_id: userData.user.id,
      _role: "agency_admin",
    });

    const { data: isAdminStaff } = await supabase.rpc("has_role", {
      _user_id: userData.user.id,
      _role: "admin_staff",
    });

    if (!isAgencyAdmin && !isAdminStaff) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body: DeleteAuthUserRequest = await req.json();

    let targetUserId = body.userId?.trim() || "";
    const targetEmail = body.email ? normalizeEmail(body.email) : "";

    // Allow deletion by email to clean up orphaned auth accounts
    if (!targetUserId) {
      if (!targetEmail) {
        return new Response(JSON.stringify({ error: "userId or email is required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Find user by email with retry logic
      try {
        targetUserId = await withRetry(async () => {
          const perPage = 1000;
          for (let page = 1; page <= 10; page++) {
            const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage });
            
            if (error) {
              throw new Error(`Failed to list users: ${error.message}`);
            }

            const match = data?.users?.find((u) => (u.email ?? "").toLowerCase() === targetEmail);
            if (match?.id) {
              return match.id;
            }

            // If we've reached the end, stop
            if (!data?.users || data.users.length < perPage) break;
          }
          
          throw new Error("User not found");
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "User lookup failed";
        
        if (errorMessage === "User not found") {
          return new Response(JSON.stringify({ error: "User not found" }), {
            status: 404,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        
        await logError(supabaseAdmin, error instanceof Error ? error : new Error(errorMessage), {
          targetEmail,
          operation: 'user_lookup',
        });
        
        return new Response(JSON.stringify({ error: errorMessage }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Best-effort cleanup in public schema with retries
    const cleanupTables = [
      { table: "user_roles", field: "user_id" },
      { table: "clients", field: "user_id" },
      { table: "email_verification_tokens", field: "user_id" },
      { table: "password_reset_tokens", field: "user_id" },
    ];

    for (const { table, field } of cleanupTables) {
      try {
        await withRetry(async () => {
          const { error } = await supabaseAdmin.from(table).delete().eq(field, targetUserId);
          if (error && !error.message.includes('no rows')) {
            throw error;
          }
        }, 2, 200);
      } catch (error) {
        console.warn(`Warning: Failed to cleanup ${table}:`, error);
        // Continue with other cleanups
      }
    }

    // Additional email-based cleanup
    if (targetEmail) {
      const emailCleanupTables = [
        { table: "email_verification_tokens", field: "email" },
        { table: "failed_login_attempts", field: "email" },
      ];
      
      for (const { table, field } of emailCleanupTables) {
        try {
          await supabaseAdmin.from(table).delete().eq(field, targetEmail);
        } catch {
          // Ignore cleanup errors
        }
      }
    }

    // Delete the auth user with retry
    try {
      await withRetry(async () => {
        const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(targetUserId);
        if (deleteError) {
          throw new Error(deleteError.message);
        }
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Failed to delete user";
      
      await logError(supabaseAdmin, error instanceof Error ? error : new Error(errorMessage), {
        targetUserId,
        targetEmail,
        operation: 'delete_user',
      });
      
      return new Response(JSON.stringify({ error: errorMessage }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Successfully deleted user: ${targetUserId}`);

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    
    await logError(supabaseAdmin, error instanceof Error ? error : new Error(message), {
      operation: 'unknown',
    });
    
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
