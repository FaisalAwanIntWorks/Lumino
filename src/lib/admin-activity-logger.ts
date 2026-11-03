import { supabase } from '@/integrations/supabase/client';

export interface AdminActivityLogEntry {
  adminUserId: string;
  adminEmail: string;
  adminName?: string;
  adminType?: 'primary_admin' | 'admin_staff';
  actionType: string;
  actionCategory: string;
  description: string;
  metadata?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
}

export const ADMIN_ACTION_CATEGORIES = {
  authentication: 'authentication',
  client_management: 'client_management',
  admin_staff: 'admin_staff',
  products: 'products',
  orders: 'orders',
  manufacturing: 'manufacturing',
  design_requests: 'design_requests',
  settings: 'settings',
  security: 'security',
  data_governance: 'data_governance',
  impersonation: 'impersonation',
} as const;

export const ADMIN_ACTION_TYPES = {
  // Authentication
  login: 'login',
  logout: 'logout',
  password_change: 'password_change',
  
  // Client Management
  client_create: 'client_create',
  client_update: 'client_update',
  client_delete: 'client_delete',
  client_status_change: 'client_status_change',
  
  // Admin Staff
  staff_create: 'staff_create',
  staff_update: 'staff_update',
  staff_delete: 'staff_delete',
  staff_permission_update: 'staff_permission_update',
  
  // Products
  product_add: 'product_add',
  product_update: 'product_update',
  product_delete: 'product_delete',
  master_db_import: 'master_db_import',
  
  // Orders
  order_status_change: 'order_status_change',
  order_update: 'order_update',
  
  // Manufacturing
  manufacturing_status_update: 'manufacturing_status_update',
  manufacturing_assignment: 'manufacturing_assignment',
  
  // Design Requests
  design_request_status_update: 'design_request_status_update',
  design_request_assignment: 'design_request_assignment',
  
  // Settings
  settings_update: 'settings_update',
  alert_thresholds_update: 'alert_thresholds_update',
  
  // Security
  security_event_resolution: 'security_event_resolution',
  security_alert: 'security_alert',
  
  // Data Governance
  data_export: 'data_export',
  gdpr_request_processing: 'gdpr_request_processing',
  
  // Impersonation
  impersonation_start: 'impersonation_start',
  impersonation_end: 'impersonation_end',
} as const;

export async function logAdminActivity(entry: AdminActivityLogEntry, retryCount = 0): Promise<void> {
  const maxRetries = 2;
  
  try {
    const { error } = await supabase
      .from('admin_activity_logs')
      .insert({
        admin_user_id: entry.adminUserId,
        admin_email: entry.adminEmail,
        admin_name: entry.adminName || null,
        admin_type: entry.adminType || 'admin_staff',
        action_type: entry.actionType,
        action_category: entry.actionCategory,
        description: entry.description,
        metadata: entry.metadata || {},
        ip_address: entry.ipAddress || null,
        user_agent: entry.userAgent || navigator.userAgent,
      });

    if (error) {
      // If RLS violation and we haven't exceeded retries, wait and try again
      // This handles the case where the session isn't fully established yet
      if (error.code === '42501' && retryCount < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, 500 * (retryCount + 1)));
        return logAdminActivity(entry, retryCount + 1);
      }
      console.error('Failed to log admin activity:', error);
    }
  } catch (err) {
    console.error('Error logging admin activity:', err);
  }
}

export async function getAdminInfoForLogging(userId: string): Promise<{
  adminEmail: string | null;
  adminName: string | null;
  adminType: 'primary_admin' | 'admin_staff';
} | null> {
  try {
    // Check admin_staff_members table
    const { data: adminStaff, error: staffError } = await supabase
      .from('admin_staff_members')
      .select('email, name')
      .eq('user_id', userId)
      .maybeSingle();

    if (!staffError && adminStaff) {
      return {
        adminEmail: adminStaff.email,
        adminName: adminStaff.name,
        adminType: 'admin_staff',
      };
    }

    // Fallback: get email from auth user
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      return {
        adminEmail: user.email || null,
        adminName: null,
        adminType: 'primary_admin',
      };
    }

    return null;
  } catch (err) {
    console.error('Error getting admin info for logging:', err);
    return null;
  }
}

export async function logAdminLoginActivity(userId: string, userEmail: string): Promise<void> {
  const adminInfo = await getAdminInfoForLogging(userId);
  
  await logAdminActivity({
    adminUserId: userId,
    adminEmail: adminInfo?.adminEmail || userEmail,
    adminName: adminInfo?.adminName || undefined,
    adminType: adminInfo?.adminType || 'admin_staff',
    actionType: ADMIN_ACTION_TYPES.login,
    actionCategory: ADMIN_ACTION_CATEGORIES.authentication,
    description: `Admin user ${adminInfo?.adminName || userEmail} logged in`,
    metadata: {
      loginTime: new Date().toISOString(),
    },
  });
}

export async function logAdminLogoutActivity(userId: string, userEmail: string): Promise<void> {
  const adminInfo = await getAdminInfoForLogging(userId);
  
  await logAdminActivity({
    adminUserId: userId,
    adminEmail: adminInfo?.adminEmail || userEmail,
    adminName: adminInfo?.adminName || undefined,
    adminType: adminInfo?.adminType || 'admin_staff',
    actionType: ADMIN_ACTION_TYPES.logout,
    actionCategory: ADMIN_ACTION_CATEGORIES.authentication,
    description: `Admin user ${adminInfo?.adminName || userEmail} logged out`,
    metadata: {
      logoutTime: new Date().toISOString(),
    },
  });
}

export async function logAdminImpersonationStart(
  userId: string, 
  userEmail: string, 
  clientId: string, 
  clientName: string
): Promise<void> {
  const adminInfo = await getAdminInfoForLogging(userId);
  
  await logAdminActivity({
    adminUserId: userId,
    adminEmail: adminInfo?.adminEmail || userEmail,
    adminName: adminInfo?.adminName || undefined,
    adminType: adminInfo?.adminType || 'admin_staff',
    actionType: ADMIN_ACTION_TYPES.impersonation_start,
    actionCategory: ADMIN_ACTION_CATEGORIES.impersonation,
    description: `Admin ${adminInfo?.adminName || userEmail} started impersonating client: ${clientName}`,
    metadata: {
      clientId,
      clientName,
      startTime: new Date().toISOString(),
    },
  });
}

export async function logAdminImpersonationEnd(
  userId: string, 
  userEmail: string, 
  clientId: string, 
  clientName: string
): Promise<void> {
  const adminInfo = await getAdminInfoForLogging(userId);
  
  await logAdminActivity({
    adminUserId: userId,
    adminEmail: adminInfo?.adminEmail || userEmail,
    adminName: adminInfo?.adminName || undefined,
    adminType: adminInfo?.adminType || 'admin_staff',
    actionType: ADMIN_ACTION_TYPES.impersonation_end,
    actionCategory: ADMIN_ACTION_CATEGORIES.impersonation,
    description: `Admin ${adminInfo?.adminName || userEmail} stopped impersonating client: ${clientName}`,
    metadata: {
      clientId,
      clientName,
      endTime: new Date().toISOString(),
    },
  });
}
