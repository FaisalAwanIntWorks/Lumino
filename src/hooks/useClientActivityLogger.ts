import { useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { logClientActivity, ACTION_TYPES, ACTION_CATEGORIES } from '@/lib/activity-logger';
import type { Json } from '@/integrations/supabase/types';

/**
 * Hook for logging client-side activities.
 * Automatically captures user context (client owner or staff).
 */
export function useClientActivityLogger() {
  const { user, role, staffInfo } = useAuth();

  const logActivity = useCallback(async (
    actionType: string,
    actionCategory: string,
    description: string,
    metadata?: Json
  ) => {
    if (!user) {
      console.warn('Cannot log activity: No user in context');
      return;
    }

    // Determine client ID and user type
    let clientId: string | null = null;
    let userEmail = user.email || '';
    let userName: string | undefined;
    let userType: 'owner' | 'staff' = 'owner';

    if (role === 'client') {
      // Client owner - need to fetch client ID
      const { data: clientData } = await supabase
        .from('clients')
        .select('id, company_name')
        .eq('user_id', user.id)
        .maybeSingle();

      if (clientData) {
        clientId = clientData.id;
        userName = clientData.company_name;
        userType = 'owner';
      }
    } else if (role === 'staff' && staffInfo) {
      // Staff member - fetch staff details
      clientId = staffInfo.clientId;
      userType = 'staff';
      
      // Get staff member details
      const { data: staffData } = await supabase
        .from('staff_members')
        .select('email, name')
        .eq('id', staffInfo.id)
        .maybeSingle();
      
      if (staffData) {
        userEmail = staffData.email;
        userName = staffData.name;
      }
    }

    if (!clientId) {
      console.warn('Cannot log activity: No client ID found');
      return;
    }

    try {
      await logClientActivity({
        client_id: clientId,
        user_id: user.id,
        user_email: userEmail,
        user_name: userName,
        user_type: userType,
        action_type: actionType,
        action_category: actionCategory,
        description,
        metadata,
        user_agent: navigator.userAgent,
      });
    } catch (error) {
      console.error('Failed to log activity:', error);
    }
  }, [user, role, staffInfo]);

  // =========== AI Configuration Activities ===========
  const logAiConfigUpdate = useCallback((configDetails?: { model?: string; temperature?: number }) => {
    return logActivity(
      ACTION_TYPES.AI_CONFIG_UPDATE,
      ACTION_CATEGORIES.AI,
      'Updated AI configuration settings',
      configDetails as Json
    );
  }, [logActivity]);

  const logAiTrainingAdd = useCallback((question: string) => {
    return logActivity(
      ACTION_TYPES.AI_TRAINING_ADD,
      ACTION_CATEGORIES.AI,
      `Added AI training example: "${question.substring(0, 50)}${question.length > 50 ? '...' : ''}"`,
      { questionPreview: question.substring(0, 100) }
    );
  }, [logActivity]);

  const logAiTrainingUpdate = useCallback((question: string) => {
    return logActivity(
      'ai_training_update',
      ACTION_CATEGORIES.AI,
      `Updated AI training example: "${question.substring(0, 50)}${question.length > 50 ? '...' : ''}"`,
      { questionPreview: question.substring(0, 100) }
    );
  }, [logActivity]);

  const logAiTrainingDelete = useCallback((exampleId: string, question?: string) => {
    return logActivity(
      ACTION_TYPES.AI_TRAINING_DELETE,
      ACTION_CATEGORIES.AI,
      question 
        ? `Deleted AI training example: "${question.substring(0, 50)}${question.length > 50 ? '...' : ''}"`
        : 'Deleted AI training example',
      { exampleId, questionPreview: question?.substring(0, 100) }
    );
  }, [logActivity]);

  const logDocumentUpload = useCallback((filename: string, fileSize: number) => {
    return logActivity(
      ACTION_TYPES.DOCUMENT_UPLOAD,
      ACTION_CATEGORIES.DOCUMENT,
      `Uploaded document: "${filename}"`,
      { filename, fileSize, fileSizeFormatted: `${(fileSize / 1024 / 1024).toFixed(2)} MB` }
    );
  }, [logActivity]);

  const logDocumentDelete = useCallback((filename: string, documentId: string) => {
    return logActivity(
      ACTION_TYPES.DOCUMENT_DELETE,
      ACTION_CATEGORIES.DOCUMENT,
      `Deleted document: "${filename}"`,
      { documentId, filename }
    );
  }, [logActivity]);

  // =========== Catalog Activities ===========
  const logCatalogGenerate = useCallback((preferences?: { styles?: string[]; metals?: string[]; shapes?: string[] }) => {
    return logActivity(
      ACTION_TYPES.CATALOG_GENERATE,
      ACTION_CATEGORIES.CATALOG,
      'Generated catalog',
      preferences as Json
    );
  }, [logActivity]);

  const logCatalogReset = useCallback(() => {
    return logActivity(
      ACTION_TYPES.CATALOG_RESET,
      ACTION_CATEGORIES.CATALOG,
      'Reset catalog'
    );
  }, [logActivity]);

  const logCatalogItemEnable = useCallback((itemName: string, itemId: string) => {
    return logActivity(
      ACTION_TYPES.CATALOG_ITEM_ENABLE,
      ACTION_CATEGORIES.CATALOG,
      `Enabled catalog item: "${itemName}"`,
      { itemId, itemName }
    );
  }, [logActivity]);

  const logCatalogItemDisable = useCallback((itemName: string, itemId: string) => {
    return logActivity(
      ACTION_TYPES.CATALOG_ITEM_DISABLE,
      ACTION_CATEGORIES.CATALOG,
      `Disabled catalog item: "${itemName}"`,
      { itemId, itemName }
    );
  }, [logActivity]);

  const logCatalogPriceUpdate = useCallback((itemName: string, oldPrice: number, newPrice: number) => {
    return logActivity(
      ACTION_TYPES.CATALOG_PRICE_UPDATE,
      ACTION_CATEGORIES.CATALOG,
      `Updated price for "${itemName}": $${oldPrice} → $${newPrice}`,
      { itemName, oldPrice, newPrice }
    );
  }, [logActivity]);

  // =========== Staff Activities ===========
  const logStaffCreate = useCallback((staffEmail: string, staffName: string) => {
    return logActivity(
      ACTION_TYPES.STAFF_CREATE,
      ACTION_CATEGORIES.STAFF,
      `Created staff member: "${staffName}" (${staffEmail})`,
      { staffEmail, staffName }
    );
  }, [logActivity]);

  const logStaffUpdate = useCallback((staffEmail: string, staffName: string, changes?: Record<string, unknown>) => {
    return logActivity(
      ACTION_TYPES.STAFF_UPDATE,
      ACTION_CATEGORIES.STAFF,
      `Updated staff member: "${staffName}" (${staffEmail})`,
      { staffEmail, staffName, changes: changes ? JSON.stringify(changes) : undefined }
    );
  }, [logActivity]);

  const logStaffDelete = useCallback((staffEmail: string, staffName: string) => {
    return logActivity(
      ACTION_TYPES.STAFF_DELETE,
      ACTION_CATEGORIES.STAFF,
      `Deleted staff member: "${staffName}" (${staffEmail})`,
      { staffEmail, staffName }
    );
  }, [logActivity]);

  const logStaffPermissionUpdate = useCallback((staffEmail: string, staffName: string, permissions: Record<string, unknown>) => {
    return logActivity(
      ACTION_TYPES.STAFF_PERMISSION_UPDATE,
      ACTION_CATEGORIES.STAFF,
      `Updated permissions for staff member: "${staffName}" (${staffEmail})`,
      { staffEmail, staffName, permissions: JSON.stringify(permissions) }
    );
  }, [logActivity]);

  // =========== Settings Activities ===========
  const logSettingsUpdate = useCallback((settingName: string, details?: Record<string, unknown>) => {
    return logActivity(
      ACTION_TYPES.SETTINGS_UPDATE,
      ACTION_CATEGORIES.SETTINGS,
      `Updated settings: ${settingName}`,
      details as Json
    );
  }, [logActivity]);

  const logBrandingUpdate = useCallback((changes?: { logoUpdated?: boolean; colorsUpdated?: boolean }) => {
    return logActivity(
      ACTION_TYPES.BRANDING_UPDATE,
      ACTION_CATEGORIES.SETTINGS,
      'Updated branding settings',
      changes as Json
    );
  }, [logActivity]);

  const logEmbedUpdate = useCallback((changes?: { domains?: string[] }) => {
    return logActivity(
      ACTION_TYPES.EMBED_UPDATE,
      ACTION_CATEGORIES.SETTINGS,
      'Updated embed configuration',
      changes as Json
    );
  }, [logActivity]);

  const logProfileUpdate = useCallback((changes?: Record<string, unknown>) => {
    return logActivity(
      ACTION_TYPES.PROFILE_UPDATE,
      ACTION_CATEGORIES.SETTINGS,
      'Updated profile information',
      changes as Json
    );
  }, [logActivity]);

  // =========== Order Activities ===========
  const logOrderStatusChange = useCallback((orderId: string, oldStatus: string, newStatus: string) => {
    return logActivity(
      ACTION_TYPES.ORDER_STATUS_CHANGE,
      ACTION_CATEGORIES.ORDER,
      `Changed order status: ${oldStatus} → ${newStatus}`,
      { orderId, oldStatus, newStatus }
    );
  }, [logActivity]);

  // =========== Design Activities ===========
  const logDesignSave = useCallback((designName: string, designId?: string) => {
    return logActivity(
      ACTION_TYPES.DESIGN_SAVE,
      ACTION_CATEGORIES.DESIGN,
      `Saved design: "${designName}"`,
      { designId, designName }
    );
  }, [logActivity]);

  const logDesignDelete = useCallback((designName: string, designId: string) => {
    return logActivity(
      ACTION_TYPES.DESIGN_DELETE,
      ACTION_CATEGORIES.DESIGN,
      `Deleted design: "${designName}"`,
      { designId, designName }
    );
  }, [logActivity]);

  const logDesignRequestCreate = useCallback((requestDetails?: Record<string, unknown>) => {
    return logActivity(
      ACTION_TYPES.DESIGN_REQUEST_CREATE,
      ACTION_CATEGORIES.DESIGN,
      'Created design request',
      requestDetails as Json
    );
  }, [logActivity]);

  const logDesignRequestUpdate = useCallback((requestId: string, status: string) => {
    return logActivity(
      ACTION_TYPES.DESIGN_REQUEST_UPDATE,
      ACTION_CATEGORIES.DESIGN,
      `Updated design request status: ${status}`,
      { requestId, status }
    );
  }, [logActivity]);

  // =========== Shopify Activities ===========
  const logShopifyConnect = useCallback((storeUrl: string) => {
    return logActivity(
      ACTION_TYPES.SHOPIFY_CONNECT,
      ACTION_CATEGORIES.SHOPIFY,
      `Connected Shopify store: ${storeUrl}`,
      { storeUrl }
    );
  }, [logActivity]);

  const logShopifyDisconnect = useCallback(() => {
    return logActivity(
      ACTION_TYPES.SHOPIFY_DISCONNECT,
      ACTION_CATEGORIES.SHOPIFY,
      'Disconnected Shopify store'
    );
  }, [logActivity]);

  const logShopifySync = useCallback((itemCount: number) => {
    return logActivity(
      ACTION_TYPES.SHOPIFY_SYNC,
      ACTION_CATEGORIES.SHOPIFY,
      `Synced ${itemCount} items to Shopify`,
      { itemCount }
    );
  }, [logActivity]);

  const logShopifyPush = useCallback((productCount: number) => {
    return logActivity(
      ACTION_TYPES.SHOPIFY_PUSH,
      ACTION_CATEGORIES.SHOPIFY,
      `Pushed ${productCount} products to Shopify`,
      { productCount }
    );
  }, [logActivity]);

  // =========== General Activities ===========
  const logPageView = useCallback((pageName: string) => {
    return logActivity(
      ACTION_TYPES.VIEW_PAGE,
      ACTION_CATEGORIES.GENERAL,
      `Viewed page: ${pageName}`,
      { pageName }
    );
  }, [logActivity]);

  const logExportData = useCallback((exportType: string, recordCount?: number) => {
    return logActivity(
      ACTION_TYPES.EXPORT_DATA,
      ACTION_CATEGORIES.GENERAL,
      `Exported data: ${exportType}`,
      { exportType, recordCount }
    );
  }, [logActivity]);

  const logCustomActivity = useCallback((actionType: string, category: string, description: string, metadata?: Json) => {
    return logActivity(actionType, category, description, metadata);
  }, [logActivity]);

  return {
    // AI Configuration
    logAiConfigUpdate,
    logAiTrainingAdd,
    logAiTrainingUpdate,
    logAiTrainingDelete,
    logDocumentUpload,
    logDocumentDelete,

    // Catalog
    logCatalogGenerate,
    logCatalogReset,
    logCatalogItemEnable,
    logCatalogItemDisable,
    logCatalogPriceUpdate,

    // Staff
    logStaffCreate,
    logStaffUpdate,
    logStaffDelete,
    logStaffPermissionUpdate,

    // Settings
    logSettingsUpdate,
    logBrandingUpdate,
    logEmbedUpdate,
    logProfileUpdate,

    // Orders
    logOrderStatusChange,

    // Designs
    logDesignSave,
    logDesignDelete,
    logDesignRequestCreate,
    logDesignRequestUpdate,

    // Shopify
    logShopifyConnect,
    logShopifyDisconnect,
    logShopifySync,
    logShopifyPush,

    // General
    logPageView,
    logExportData,
    logCustomActivity,
  };
}
