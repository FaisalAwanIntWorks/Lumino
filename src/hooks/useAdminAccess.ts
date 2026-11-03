import { useAuth } from '@/contexts/AuthContext';
import { READ_ONLY_MESSAGE } from '@/lib/admin-write-guard';

/**
 * Convenience wrapper around the super admin / read-only admin split.
 *
 *   const { canWrite, readOnly, readOnlyMessage } = useAdminAccess();
 *   <Button disabled={!canWrite} title={readOnly ? readOnlyMessage : undefined}>
 */
export function useAdminAccess() {
  const { role, isSuperAdmin, isReadOnlyAdmin } = useAuth();

  return {
    isAgencyAdmin: role === 'agency_admin',
    isSuperAdmin: isSuperAdmin === true,
    /** true only once we know the user is admin staff without write rights */
    readOnly: isReadOnlyAdmin,
    /** false for read-only admin staff, true for everyone else */
    canWrite: !isReadOnlyAdmin,
    readOnlyMessage: READ_ONLY_MESSAGE,
  };
}
