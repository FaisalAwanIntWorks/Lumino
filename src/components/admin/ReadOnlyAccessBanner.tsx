import { Eye } from 'lucide-react';
import { useAdminAccess } from '@/hooks/useAdminAccess';

/**
 * Persistent strip shown to admin staff who only have view access, so it is
 * never a surprise when a save is refused.
 */
export function ReadOnlyAccessBanner() {
  const { readOnly } = useAdminAccess();

  if (!readOnly) return null;

  return (
    <div className="flex items-center justify-center gap-2 border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-center text-xs sm:text-sm text-amber-600 dark:text-amber-400">
      <Eye className="h-4 w-4 shrink-0" />
      <span>
        <span className="font-semibold">View-only access.</span>{' '}
        You can browse every screen, but creating, editing and deleting are
        reserved for Super Admins.
      </span>
    </div>
  );
}
