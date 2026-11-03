import { SupabaseClient } from 'npm:@supabase/supabase-js@2';

export interface ActivityLogEntry {
  client_id: string;
  user_id: string;
  user_email: string;
  user_name?: string;
  user_type: 'owner' | 'staff';
  action_type: string;
  action_category: string;
  description: string;
  metadata?: Record<string, unknown>;
  ip_address?: string;
  user_agent?: string;
}

export const ACTION_CATEGORIES = {
  AUTH: 'authentication',
  CATALOG: 'catalog',
  STAFF: 'staff_management',
  SETTINGS: 'settings',
  ORDER: 'orders',
  DESIGN: 'design',
  SHOPIFY: 'shopify',
  AI: 'ai_configuration',
  DOCUMENT: 'documents',
  GENERAL: 'general',
} as const;

export const ACTION_TYPES = {
  // Authentication
  LOGIN: 'login',
  LOGOUT: 'logout',
  PASSWORD_CHANGE: 'password_change',
  
  // Catalog
  CATALOG_GENERATE: 'catalog_generate',
  CATALOG_RESET: 'catalog_reset',
  CATALOG_UPDATE: 'catalog_update',
  CATALOG_ITEM_ENABLE: 'catalog_item_enable',
  CATALOG_ITEM_DISABLE: 'catalog_item_disable',
  CATALOG_PRICE_UPDATE: 'catalog_price_update',
  
  // Staff
  STAFF_CREATE: 'staff_create',
  STAFF_UPDATE: 'staff_update',
  STAFF_DELETE: 'staff_delete',
  STAFF_PERMISSION_UPDATE: 'staff_permission_update',
  
  // Settings
  SETTINGS_UPDATE: 'settings_update',
  BRANDING_UPDATE: 'branding_update',
  EMBED_UPDATE: 'embed_update',
  PROFILE_UPDATE: 'profile_update',
  
  // Orders
  ORDER_CREATE: 'order_create',
  ORDER_UPDATE: 'order_update',
  ORDER_STATUS_CHANGE: 'order_status_change',
  
  // Designs
  DESIGN_SAVE: 'design_save',
  DESIGN_DELETE: 'design_delete',
  DESIGN_REQUEST_CREATE: 'design_request_create',
  DESIGN_REQUEST_UPDATE: 'design_request_update',
  
  // Shopify
  SHOPIFY_CONNECT: 'shopify_connect',
  SHOPIFY_DISCONNECT: 'shopify_disconnect',
  SHOPIFY_SYNC: 'shopify_sync',
  SHOPIFY_PUSH: 'shopify_push',
  
  // AI
  AI_CONFIG_UPDATE: 'ai_config_update',
  AI_TRAINING_ADD: 'ai_training_add',
  AI_TRAINING_DELETE: 'ai_training_delete',
  
  // Documents
  DOCUMENT_UPLOAD: 'document_upload',
  DOCUMENT_DELETE: 'document_delete',
  
  // General
  VIEW_PAGE: 'view_page',
  EXPORT_DATA: 'export_data',
} as const;

export async function logClientActivity(
  supabase: SupabaseClient,
  entry: ActivityLogEntry
): Promise<void> {
  try {
    const { error } = await supabase
      .from('client_activity_logs')
      .insert({
        client_id: entry.client_id,
        user_id: entry.user_id,
        user_email: entry.user_email,
        user_name: entry.user_name || null,
        user_type: entry.user_type,
        action_type: entry.action_type,
        action_category: entry.action_category,
        description: entry.description,
        metadata: entry.metadata || {},
        ip_address: entry.ip_address || null,
        user_agent: entry.user_agent || null,
      });

    if (error) {
      console.error('Error logging activity:', error);
    }
  } catch (err) {
    console.error('Failed to log activity:', err);
  }
}

// Helper to get user info for logging
export async function getUserInfoForLogging(
  supabase: SupabaseClient,
  userId: string
): Promise<{ 
  clientId: string | null; 
  userEmail: string | null; 
  userName: string | null;
  userType: 'owner' | 'staff';
} | null> {
  // First check if user is a client owner
  const { data: clientData, error: clientError } = await supabase
    .from('clients')
    .select('id, email, company_name')
    .eq('user_id', userId)
    .maybeSingle();

  if (clientError && clientError.code !== 'PGRST116') {
    console.error('Error fetching client for logging:', clientError);
  }

  if (clientData) {
    return {
      clientId: clientData.id,
      userEmail: clientData.email,
      userName: clientData.company_name,
      userType: 'owner',
    };
  }

  // Check if user is a staff member
  const { data: staffData, error: staffError } = await supabase
    .from('staff_members')
    .select('client_id, email, name')
    .eq('user_id', userId)
    .maybeSingle();

  if (staffError && staffError.code !== 'PGRST116') {
    console.error('Error fetching staff for logging:', staffError);
  }

  if (staffData) {
    return {
      clientId: staffData.client_id,
      userEmail: staffData.email,
      userName: staffData.name,
      userType: 'staff',
    };
  }

  return null;
}
