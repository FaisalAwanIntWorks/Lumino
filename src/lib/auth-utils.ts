import { supabase } from '@/integrations/supabase/client';
import { getPortalType } from '@/lib/domain-config';

export type UserRole = 'agency_admin' | 'client' | 'staff';

/**
 * Fetches all roles assigned to a user and resolves the most appropriate one
 * for the current portal context. A single auth user can hold multiple roles
 * (e.g. a client owner who is also a staff member at another shop), so we
 * cannot use `.maybeSingle()` here — it would 406 and the caller would
 * silently fall back to "no role" and bounce the user to /login.
 */
export async function getUserRole(userId: string): Promise<UserRole | null> {
  const { data, error } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', userId);

  if (error) {
    console.error('Error fetching user role:', error);
    return null;
  }

  if (!data || data.length === 0) return null;

  const roles = data.map((r) => r.role as UserRole);
  return resolveRoleForPortal(roles);
}

/**
 * Picks the best-fit role for the portal the user is signing in to.
 *  - Admin portal: prefer agency_admin
 *  - Client portal: prefer client over staff (so dual-role users land on
 *    their own dashboard instead of the staff-restricted view)
 *  - Otherwise: fall back to the first role found
 */
export function resolveRoleForPortal(roles: UserRole[]): UserRole | null {
  if (roles.length === 0) return null;
  if (roles.length === 1) return roles[0];

  const portal = typeof window !== 'undefined' ? getPortalType(window.location.hostname) : 'client';
  const priority: UserRole[] =
    portal === 'admin'
      ? ['agency_admin', 'client', 'staff']
      : ['client', 'staff', 'agency_admin'];

  for (const candidate of priority) {
    if (roles.includes(candidate)) return candidate;
  }
  return roles[0];
}

// Select only non-sensitive columns to prevent exposure of encrypted tokens
const CLIENT_SAFE_COLUMNS = `
  id, agency_id, user_id, company_name, email, logo_url, status, plan_id,
  shopify_store_url, created_at, subscription_ends_at, branding_config,
  allowed_domains, widget_theme, address_line1,
  address_line2, city, state, postal_code, country
`;

export async function getClientProfile(userId: string) {
  const { data, error } = await supabase
    .from('clients')
    .select(CLIENT_SAFE_COLUMNS)
    .eq('user_id', userId)
    .maybeSingle();

  if (error && error.code !== 'PGRST116') {
    console.error('Error fetching client profile:', error);
    return null;
  }

  return data;
}

export async function getStaffClientId(userId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('staff_members')
    .select('client_id')
    .eq('user_id', userId)
    .maybeSingle();

  // agency_admin users won't have a staff_members row; avoid 406 (PGRST116)
  if (error && (error as any).code !== 'PGRST116') {
    console.error('Error fetching staff client id:', error);
    return null;
  }

  if (!data) return null;

  return data.client_id;
}

export function isAdmin(role: UserRole | null): boolean {
  return role === 'agency_admin';
}

export function isClient(role: UserRole | null): boolean {
  return role === 'client';
}

export function isStaff(role: UserRole | null): boolean {
  return role === 'staff';
}
