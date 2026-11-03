// Shared authorization helpers for the DTT GHL edge functions.
//
// Mirrors the auth pattern already used by admin-update-client-email:
// resolve the caller's user id from their JWT, then confirm an agency_admin
// row in public.user_roles. Kept here so all GHL functions enforce the same
// rule without copy-paste drift.

import { createClient } from "npm:@supabase/supabase-js@2";

const DTT_CLIENT_ID = "aeec6491-bd1f-4787-97f9-6a47a2ddc8af";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function deny(status: number, error: string): Response {
  return new Response(JSON.stringify({ ok: false, error }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/**
 * Authorize an admin/manual GHL action (backfill, metadata fetch, connection
 * test). Returns `null` when the caller is allowed, otherwise a ready-to-return
 * 401/403 Response. Service-role callers (other edge functions) are allowed.
 */
export async function requireAgencyAdmin(req: Request): Promise<Response | null> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return deny(401, "Unauthorized");

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

  const token = authHeader.replace("Bearer ", "");

  // Internal service-role calls are always allowed.
  if (token === SERVICE_ROLE) return null;

  const callerClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: claims, error: claimsErr } = await callerClient.auth.getClaims(token);
  if (claimsErr || !claims?.claims?.sub) return deny(401, "Unauthorized");
  const callerUserId = claims.claims.sub as string;

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
  const { data: roleRow } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", callerUserId)
    .eq("role", "agency_admin")
    .maybeSingle();

  if (!roleRow) return deny(403, "Forbidden: admin only");
  return null;
}

/**
 * Authorize the internal, trigger-invoked sync function. Accepts either:
 *   - the SUPABASE_SERVICE_ROLE_KEY as a Bearer token, OR
 *   - a shared `x-trigger-secret` header that matches
 *     public.cron_config.dtt_ghl_trigger_secret (used by the DB trigger,
 *     since pg_net cannot read the service-role JWT).
 * Returns `null` when allowed, else a 401 Response.
 */
export async function requireServiceRole(req: Request): Promise<Response | null> {
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.replace("Bearer ", "") : "";
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (token && serviceRole && token === serviceRole) return null;

  const triggerSecret = req.headers.get("x-trigger-secret") ?? "";
  if (triggerSecret && serviceRole) {
    try {
      const admin = createClient(Deno.env.get("SUPABASE_URL")!, serviceRole);
      const { data } = await admin
        .from("cron_config")
        .select("value")
        .eq("key", "dtt_ghl_trigger_secret")
        .maybeSingle();
      if (data?.value && data.value === triggerSecret) return null;
    } catch (_e) {
      // fall through to deny
    }
  }

  return deny(401, "Unauthorized");
}

/**
 * Resolve the GHL Private Integration Token for a client.
 *
 * Order:
 *   1. public.client_ghl_credentials (written by save-ghl-credentials) — this
 *      is how every client other than DTT connects.
 *   2. For DTT only, the original DTT_GHL_PRIVATE_TOKEN edge secret. DTT has
 *      never had a credentials row and must keep working without one.
 *
 * Returns null when the client has no usable token.
 */
export async function getClientGhlToken(clientId: string): Promise<string | null> {
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (clientId && SUPABASE_URL && SERVICE_ROLE) {
    try {
      const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
      const { data } = await admin
        .from("client_ghl_credentials")
        .select("private_token")
        .eq("client_id", clientId)
        .maybeSingle();
      const stored = (data?.private_token as string | undefined)?.trim();
      if (stored) return stored;
    } catch (e) {
      // Never let a lookup failure take DTT down — fall through to the secret.
      console.error("getClientGhlToken lookup failed:", e);
    }
  }

  if (clientId === DTT_CLIENT_ID) {
    return Deno.env.get("DTT_GHL_PRIVATE_TOKEN") ?? null;
  }
  return null;
}
