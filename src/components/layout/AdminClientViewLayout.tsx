import { useState, useMemo } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useAdminImpersonation } from '@/contexts/AdminImpersonationContext';
import { ImpersonationBanner } from '@/components/admin/ImpersonationBanner';
import { Sidebar } from './Sidebar';
import { GlassmorphismProvider } from './GlassmorphismProvider';
import { TopBar } from './TopBar';

import { Button } from '@/components/ui/button';
import { Menu } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
import { useClientFeatures } from '@/hooks/useClientFeatures';
import { getClientNavItems } from '@/lib/client-nav-config';

export function AdminClientViewLayout() {
  const { user, role, loading } = useAuth();
  const { isImpersonating } = useAdminImpersonation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const isMobile = useIsMobile();
  const { features, clientId } = useClientFeatures();

  // Admins have full access — no staff restrictions
  const navItems = useMemo(() => {
    return getClientNavItems({
      routePrefix: '/admin/view-as',
      role: null,
      hasCatalogAccess: true,
      hasCustomXAccess: true,
      hasLeadsAccess: true,
      hasStaffViewAccess: true,
      hasMetalIQAccess: true,
      features,
      clientId,
    });
  }, [features, clientId]);

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

  if (!user || role !== 'agency_admin') {
    return <Navigate to="/login" replace />;
  }

  if (!isImpersonating) {
    return <Navigate to="/admin/clients" replace />;
  }

  // Glass UI experiment retired — hardcoded off platform-wide.
  const isGlassEnabled = false;

  return (
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
        <main className={`flex-1 min-h-0 overflow-y-auto animate-fade-in${isGlassEnabled ? ' glass-main-bg' : ' bg-background'}`}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
