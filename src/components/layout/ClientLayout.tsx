import { useState, useMemo } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useAdminImpersonation } from '@/contexts/AdminImpersonationContext';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { ImpersonationBanner } from '@/components/admin/ImpersonationBanner';
import { GlassmorphismProvider } from './GlassmorphismProvider';

import { Button } from '@/components/ui/button';
import { Menu } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
import { useClientFeatures } from '@/hooks/useClientFeatures';
import { getClientNavItems } from '@/lib/client-nav-config';
import { SyncProvider } from '@/contexts/SyncContext';
import { canView, staffCanSeeLeads } from '@/lib/staff-permissions';

export function ClientLayout() {
  const { user, role, staffInfo, loading } = useAuth();
  const { isImpersonating } = useAdminImpersonation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const isMobile = useIsMobile();
  const { features, clientId } = useClientFeatures();

  const hasCatalogAccess = useMemo(() => {
    if (role !== 'staff') return true;
    return canView(staffInfo?.permissions?.catalog_access);
  }, [role, staffInfo]);

  const hasLeadsAccess = useMemo(() => {
    if (role !== 'staff') return true;
    return staffInfo?.permissions?.leads_access ?? false;
  }, [role, staffInfo]);

  const hasStaffViewAccess = useMemo(() => {
    if (role !== 'staff') return true;
    return canView(staffInfo?.permissions?.catalog_access) || canView(staffInfo?.permissions?.custom_x_access) || !!staffInfo?.permissions?.leads_access;
  }, [role, staffInfo]);

  const hasCustomXAccess = useMemo(() => {
    if (role !== 'staff') return true;
    return canView(staffInfo?.permissions?.custom_x_access);
  }, [role, staffInfo]);

  const hasMetalIQAccess = useMemo(() => {
    if (role !== 'staff') return true;
    return canView(staffInfo?.permissions?.metal_buying_access);
  }, [role, staffInfo]);

  const hideLeads = role === 'staff' && !staffCanSeeLeads(staffInfo?.permissions);

  const navItems = useMemo(() => {
    return getClientNavItems({
      routePrefix: '/dashboard',
      role,
      hasCatalogAccess,
      hasCustomXAccess,
      hasLeadsAccess,
      hasStaffViewAccess,
      hasMetalIQAccess,
      features,
      clientId,
      hideLeads,
    });
  }, [role, hasCatalogAccess, hasCustomXAccess, hasLeadsAccess, hasStaffViewAccess, hasMetalIQAccess, features, clientId, hideLeads]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  const hasAccess = role === 'client' || role === 'staff' || isImpersonating;
  
  if (!user || !hasAccess) {
    return <Navigate to="/login" replace />;
  }

  // Glass UI experiment retired — hardcoded off platform-wide.
  // The DB flag (clients.enabled_features.experimental_ui) is also forced false.
  const isGlassEnabled = false;

  return (
    <SyncProvider>
      <div className={`flex h-screen w-full overflow-hidden${isGlassEnabled ? ' glass-ui' : ''}`}>
        {isGlassEnabled && <GlassmorphismProvider />}
        <Sidebar 
          items={navItems} 
          mobileOpen={mobileMenuOpen}
          onMobileClose={() => setMobileMenuOpen(false)}
        />
        <div className="flex-1 flex flex-col overflow-hidden">
          <ImpersonationBanner />
          {isMobile && (
            <div className="h-14 flex items-center px-4 border-b border-border bg-card md:hidden">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setMobileMenuOpen(true)}
                className="mr-2"
              >
                <Menu className="h-5 w-5" />
              </Button>
              <span className="text-sm font-semibold">Menu</span>
            </div>
          )}
          <TopBar />
          <main className={`flex-1 overflow-y-auto animate-fade-in${isGlassEnabled ? ' glass-main-bg' : ' bg-background'}`}>
            <Outlet />
          </main>
        </div>
      </div>
    </SyncProvider>
  );
}
