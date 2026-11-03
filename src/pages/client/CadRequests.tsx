import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useAdminImpersonation } from "@/contexts/AdminImpersonationContext";
import { resolveOwnClientId } from "@/lib/page-cache";
import { CadRequestsTab } from "@/components/cad-requests/CadRequestsTab";

const CadRequests = () => {
  const { user, role, staffInfo } = useAuth();
  const { impersonatedClientId, isImpersonating } = useAdminImpersonation();
  const [clientId, setClientId] = useState<string | null>(null);

  useEffect(() => {
    if (isImpersonating && !impersonatedClientId) return;

    const resolve = async () => {
      if (isImpersonating && impersonatedClientId) {
        setClientId(impersonatedClientId);
      } else if (role === 'staff' && staffInfo?.clientId) {
        setClientId(staffInfo.clientId);
      } else {
        // Cached per session, so revisiting the tab skips this lookup.
        setClientId(await resolveOwnClientId(user?.id).catch(() => null));
      }
    };

    resolve();
  }, [user, role, staffInfo, isImpersonating, impersonatedClientId]);

  if (!clientId) {
    return (
      <div className="p-4 sm:p-6 lg:p-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-48 bg-muted rounded" />
          <div className="h-64 bg-muted rounded" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <CadRequestsTab clientId={clientId} />
    </div>
  );
};

export default CadRequests;
