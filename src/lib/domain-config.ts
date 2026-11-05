// Domain configuration for Aurezo multi-subdomain architecture
// Note: Root domain (aurezotech.com) is now handled by a separate marketing website project

export const PRODUCTION_DOMAINS = {
  admin: 'studioadmin.aurezotech.com',
  client: 'studio.aurezotech.com',
  builder: 'widget.aurezotech.com',
} as const;

export type PortalType = 'admin' | 'client' | 'builder' | 'development';

/**
 * Extract subdomain from hostname
 */
export function getSubdomain(hostname: string): string | null {
  // Handle localhost and development
  if (hostname === 'localhost') {
    return null; // Development mode
  }

  // Handle production domains
  const parts = hostname.split('.');
  if (parts.length >= 3) {
    return parts[0]; // Return subdomain (e.g., 'studioadmin' from 'studioadmin.aurezotech.com')
  }

  return null; // Root domain
}

/**
 * Determine portal type based on hostname
 */
export function getPortalType(hostname: string): PortalType {
  // Check for EXACT production domains FIRST (most reliable)
  if (hostname === PRODUCTION_DOMAINS.admin) return 'admin';
  if (hostname === PRODUCTION_DOMAINS.client) return 'client';
  if (hostname === PRODUCTION_DOMAINS.builder) return 'builder';
  
  // Then check subdomain extraction as fallback for flexibility
  const subdomain = getSubdomain(hostname);
  if (subdomain === 'studioadmin' || subdomain === 'admin') return 'admin';
  if (subdomain === 'studio') return 'client';
  if (subdomain === 'widget') return 'builder';
  
  // Development environments - allow all routes
  if (hostname === 'localhost') {
    return 'development';
  }

  // Unknown subdomain or root domain - default to client portal
  return 'client';
}

/**
 * Check if current hostname is a production domain
 */
export function isProductionDomain(hostname: string): boolean {
  return (
    hostname === PRODUCTION_DOMAINS.admin ||
    hostname === PRODUCTION_DOMAINS.client ||
    hostname === PRODUCTION_DOMAINS.builder ||
    hostname.endsWith('.aurezotech.com') // Include all aurezotech.com subdomains
  );
}

/**
 * Get the correct login redirect URL based on portal type
 */
export function getLoginUrl(portalType: PortalType): string {
  switch (portalType) {
    case 'admin':
      return `https://${PRODUCTION_DOMAINS.admin}/login`;
    case 'client':
      return `https://${PRODUCTION_DOMAINS.client}/login`;
    default:
      return '/login';
  }
}

/**
 * Get the correct dashboard URL based on user role
 */
export function getDashboardUrl(role: 'agency_admin' | 'client' | 'staff' | null): string {
  if (role === 'agency_admin') {
    return '/admin/dashboard';
  }
  return '/dashboard';
}

/**
 * Generate the builder embed URL for production
 */
export function getBuilderUrl(clientId: string): string {
  const hostname = typeof window !== 'undefined' ? window.location.hostname : '';
  
  if (isProductionDomain(hostname)) {
    return `https://${PRODUCTION_DOMAINS.builder}/${clientId}`;
  }
  
  // Development fallback
  return `${typeof window !== 'undefined' ? window.location.origin : ''}/embed/${clientId}`;
}

/**
 * Role-based session timeout configuration (in milliseconds)
 */
export const SESSION_TIMEOUTS = {
  agency_admin: 24 * 60 * 60 * 1000, // 24 hours
  client: 24 * 60 * 60 * 1000,       // 24 hours
  staff: 45 * 60 * 1000,        // 45 minutes
  default: 45 * 60 * 1000,      // 45 minutes fallback
  remember_me: 7 * 24 * 60 * 60 * 1000, // 7 days
} as const;

/**
 * Warning time before session expires (in milliseconds)
 */
export const SESSION_WARNING_TIME = 2 * 60 * 1000; // 2 minutes before expiry
