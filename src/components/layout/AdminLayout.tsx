import { useState } from 'react';
import { Navigate, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useAdminImpersonation } from '@/contexts/AdminImpersonationContext';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { ImpersonationBanner } from '@/components/admin/ImpersonationBanner';
import { ReadOnlyAccessBanner } from '@/components/admin/ReadOnlyAccessBanner';
import { Button } from '@/components/ui/button';
import { useIsMobile } from '@/hooks/use-mobile';

import {
  LayoutDashboard, 
  Users, 
  Package, 
  Settings,
  Menu,
  Ruler,
  Wallet,
  Activity,
  Database,
  BarChart3,
  FlaskConical,
  Bug,
  TrendingUp,
  LifeBuoy,
  Gem,
  Sparkles,
  Mail,
} from 'lucide-react';

const SANDBOX_CLIENT_ID = 'dcd952fc-783b-4a92-be7f-62751265c650';
const SANDBOX_CLIENT_NAME = 'JewlX';

const adminNavItems = [
  {
    section: 'Main',
    items: [
      { label: 'Dashboard', icon: LayoutDashboard, href: '/admin/dashboard' },
      { label: 'SaaS Dashboard', icon: BarChart3, href: '/admin/saas-dashboard' },
      { label: 'Clients', icon: Users, href: '/admin/clients' },
    ]
  },
  {
    section: 'Management',
    items: [
      { label: 'CAD Requests', icon: Ruler, href: '/admin/cad-requests' },
      { label: 'Client Queries', icon: LifeBuoy, href: '/admin/client-queries' },
      { label: 'AI Wallet', icon: Wallet, href: '/admin/ai-cost-calculator' },
      { label: 'Revenue & Usage', icon: TrendingUp, href: '/admin/revenue-usage' },
      { label: 'RingOS Catalog', icon: Package, href: '/admin/products' },
      { label: 'Diamond Pool', icon: Gem, href: '/admin/diamond-pool' },
      { label: 'Gemstone Pool', icon: Sparkles, href: '/admin/gemstone-pool' },
      { label: 'Quote Estimator Previews', icon: Sparkles, href: '/admin/quote-estimator-previews' },
      { label: 'Email Campaigns', icon: Mail, href: '/admin/email-campaigns' },
      { label: 'AI Intelligence Center', icon: Database, href: '/admin/ai-data-center' },
      { label: 'System Errors', icon: Bug, href: '/admin/system-errors' },
      { label: 'Platform Health', icon: Activity, href: '/admin/platform-health' },
    ]
  },
  {
    section: 'Settings',
    items: [
      { label: 'Settings', icon: Settings, href: '/admin/settings' },
      { label: 'Sandbox', icon: FlaskConical, href: '#sandbox' },
    ]
  }
];

export function AdminLayout() {
  const { user, role, loading } = useAuth();
  const { startImpersonation } = useAdminImpersonation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const isMobile = useIsMobile();
  const navigate = useNavigate();

  const handleNavClick = (href: string) => {
    if (href === '#sandbox') {
      startImpersonation(SANDBOX_CLIENT_ID, SANDBOX_CLIENT_NAME);
      navigate('/admin/view-as/dashboard');
      return true; // handled
    }
    return false; // default navigation
  };

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

  return (
    <div className="flex h-screen w-full overflow-hidden">
      <Sidebar 
        items={adminNavItems} 
        mobileOpen={mobileMenuOpen}
        onMobileClose={() => setMobileMenuOpen(false)}
        onNavClick={handleNavClick}
      />
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <ImpersonationBanner />
        <ReadOnlyAccessBanner />
        {isMobile && (
          <div className="h-14 border-b border-border bg-card flex items-center px-4 gap-3 md:hidden">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setMobileMenuOpen(true)}
              className="shrink-0"
            >
              <Menu className="h-5 w-5" />
            </Button>
            <span className="font-semibold text-lg truncate">JewlX Admin</span>
          </div>
        )}
        <TopBar />
        <main className="flex-1 min-h-0 overflow-y-auto bg-background animate-fade-in">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
