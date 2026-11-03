import { createClient } from "npm:@supabase/supabase-js@2";

let _sb: any = null;

function getServiceClient() {
  if (!_sb) {
    _sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
  }
  return _sb;
}

/**
 * Log an edge function error to the system_errors table so it surfaces
 * in the admin System Errors page. Fire-and-forget — never throws.
 */
export async function logEdgeFunctionError(
  functionName: string,
  error: unknown,
  metadata?: Record<string, unknown>
): Promise<void> {
  try {
    const sb = getServiceClient();
    const msg = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;

    await sb.from("system_errors").insert({
      error_type: "runtime",
      error_source: "edge_function",
      function_name: functionName,
      error_message: msg.substring(0, 2000),
      error_stack: stack?.substring(0, 4000) || null,
      request_metadata: metadata ?? null,
      severity: "error",
    });
  } catch (e) {
    console.error("Failed to log to system_errors:", e);
  }
}
