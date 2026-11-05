import { ReactNode, useMemo } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { getPortalType, PortalType } from '@/lib/domain-config';

interface SubdomainRouterProps {
  children: ReactNode;
  adminRoutes: ReactNode;
  clientRoutes: ReactNode;
  builderRoutes: ReactNode;
  publicRoutes: ReactNode;
}

/**
 * Routes requests based on the current subdomain
 * - studioadmin.aurezotech.com -> Admin routes only
 * - studio.aurezotech.com -> Client routes only
 * - widget.aurezotech.com -> Embed routes only
 * - localhost/dev -> All routes (development mode)
 * 
 * Note: Root domain (aurezotech.com) is handled by a separate marketing website project
 */
export function SubdomainRouter({
  children,
  adminRoutes,
  clientRoutes,
  builderRoutes,
  publicRoutes,
}: SubdomainRouterProps) {
  const location = useLocation();
  
  const portalType = useMemo(() => {
    const hostname = window.location.hostname;
    return getPortalType(hostname);
  }, []);

  // Development mode - render all routes
  if (portalType === 'development') {
    return <>{children}</>;
  }

  // Production routing based on subdomain
  const currentPath = location.pathname;

  switch (portalType) {
    case 'admin':
      // Only allow /login, /forgot-password, /reset-password and /admin/* routes
      if (
        currentPath === '/login' ||
        currentPath === '/forgot-password' ||
        currentPath === '/reset-password' ||
        currentPath.startsWith('/admin')
      ) {
        return <>{adminRoutes}</>;
      }
      // Redirect other paths to admin dashboard
      return <Navigate to="/admin/dashboard" replace />;

    case 'client':
      // Only allow /login, /signup, /forgot-password, /reset-password, /plan-selection, /client/*, /dashboard/*, and /embed/* routes
      if (
        currentPath === '/login' ||
        currentPath === '/signup' ||
        currentPath === '/forgot-password' ||
        currentPath === '/reset-password' ||
        currentPath === '/plan-selection' ||
        currentPath === '/unsubscribe' ||
        currentPath.startsWith('/client') ||
        currentPath.startsWith('/dashboard') ||
        currentPath.startsWith('/embed')
      ) {
        return <>{clientRoutes}</>;
      }
      // Redirect other paths to client login
      return <Navigate to="/login" replace />;

    case 'builder':
      // Only allow embed routes - simplified to /:clientId
      return <>{builderRoutes}</>;

    default:
      // Unknown domain - redirect to client portal login
      return <Navigate to="/login" replace />;
  }
}

/**
 * Hook to get current portal type
 */
export function usePortalType(): PortalType {
  return useMemo(() => {
    const hostname = window.location.hostname;
    return getPortalType(hostname);
  }, []);
}
