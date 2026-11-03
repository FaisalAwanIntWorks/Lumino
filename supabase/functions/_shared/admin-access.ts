/**
 * Super admin vs. read-only admin staff.
 *
 * Only the platform owners (admin_staff_members.is_super_admin) may perform
 * write operations. Every other agency_admin is view-only, everywhere.
 *
 * Edge functions run with the service role key, which bypasses RLS entirely,
 * so any function that mutates data has to check this explicitly.
 *
 * Usage inside a function that already authenticated the caller:
 *
 *   const denied = await denyReadOnlyAdmin(req, corsHeaders);
 *   if (denied) return denied;
 */
import { createClient } from "npm:@supabase/supabase-js@2.116.0";

export interface AdminAccess {
  userId: string | null;
  isAgencyAdmin: boolean;
  isSuperAdmin: boolean;
  /** agency_admin without super admin rights -> may read, must not write. */
  isReadOnlyAdmin: boolean;
}

const ANONYMOUS: AdminAccess = {
  userId: null,
  isAgencyAdmin: false,
  isSuperAdmin: false,
  isReadOnlyAdmin: false,
};

function serviceClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

/** Resolve the caller's admin standing from the request's bearer token. */
export async function getAdminAccess(req: Request): Promise<AdminAccess> {
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return ANONYMOUS;

  const token = authHeader.slice("Bearer ".length);
  const admin = serviceClient();

  const { data: { user }, error } = await admin.auth.getUser(token);
  if (error || !user) return ANONYMOUS;

  const { data: roles } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id);

  const isAgencyAdmin = (roles ?? []).some((r: { role: string }) => r.role === "agency_admin");
  if (!isAgencyAdmin) {
    return { userId: user.id, isAgencyAdmin: false, isSuperAdmin: false, isReadOnlyAdmin: false };
  }

  const { data: staffRow } = await admin
    .from("admin_staff_members")
    .select("is_super_admin, status")
    .eq("user_id", user.id)
    .maybeSingle();

  const isSuperAdmin = staffRow?.is_super_admin === true && staffRow?.status === "active";

  return {
    userId: user.id,
    isAgencyAdmin: true,
    isSuperAdmin,
    isReadOnlyAdmin: !isSuperAdmin,
  };
}

/**
 * Returns a 403 Response when the caller is read-only admin staff, otherwise
 * null. Callers that are not agency admins are left alone - this guard is only
 * about separating admin staff from super admins.
 */
export async function denyReadOnlyAdmin(
  req: Request,
  corsHeaders: Record<string, string> = {},
): Promise<Response | null> {
  const access = await getAdminAccess(req);
  if (!access.isReadOnlyAdmin) return null;

  return new Response(
    JSON.stringify({
      error: "Read-only access. Only a super admin can perform this action.",
      code: "READ_ONLY_ADMIN",
    }),
    { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
}

/**
 * Stricter variant: the caller must be a super admin. Use for owner-only
 * operations (creating/deleting admin staff, backups, key management).
 */
export async function requireSuperAdmin(
  req: Request,
  corsHeaders: Record<string, string> = {},
): Promise<Response | null> {
  const access = await getAdminAccess(req);
  if (access.isSuperAdmin) return null;

  const readOnly = access.isReadOnlyAdmin;
  return new Response(
    JSON.stringify({
      error: readOnly
        ? "Read-only access. Only a super admin can perform this action."
        : "Forbidden - super admin required.",
      code: readOnly ? "READ_ONLY_ADMIN" : "SUPER_ADMIN_REQUIRED",
    }),
    { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
}
