import { useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { 
  logAdminActivity, 
  getAdminInfoForLogging, 
  ADMIN_ACTION_CATEGORIES, 
  ADMIN_ACTION_TYPES 
} from '@/lib/admin-activity-logger';

/**
 * Hook for logging admin activities with automatic user context
 * Use this in admin pages to log all CRUD operations
 */
export function useAdminActivityLogger() {
  const { user } = useAuth();

  const logActivity = useCallback(async (
    actionType: string,
    actionCategory: string,
    description: string,
    metadata?: Record<string, any>
  ) => {
    if (!user) {
      console.warn('Cannot log activity: No authenticated user');
      return;
    }

    try {
      const adminInfo = await getAdminInfoForLogging(user.id);
      
      await logAdminActivity({
        adminUserId: user.id,
        adminEmail: adminInfo?.adminEmail || user.email || 'unknown',
        adminName: adminInfo?.adminName || undefined,
        adminType: adminInfo?.adminType || 'primary_admin',
        actionType,
        actionCategory,
        description,
        metadata: {
          ...metadata,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      console.error('Failed to log admin activity:', error);
    }
  }, [user]);

  // Client Management
  const logClientCreate = useCallback((clientName: string, clientId: string, metadata?: Record<string, any>) => {
    return logActivity(
      ADMIN_ACTION_TYPES.client_create,
      ADMIN_ACTION_CATEGORIES.client_management,
      `Created new client: ${clientName}`,
      { clientId, clientName, ...metadata }
    );
  }, [logActivity]);

  const logClientUpdate = useCallback((clientName: string, clientId: string, changes: Record<string, any>) => {
    return logActivity(
      ADMIN_ACTION_TYPES.client_update,
      ADMIN_ACTION_CATEGORIES.client_management,
      `Updated client: ${clientName}`,
      { clientId, clientName, changes }
    );
  }, [logActivity]);

  const logClientDelete = useCallback((clientName: string, clientId: string) => {
    return logActivity(
      ADMIN_ACTION_TYPES.client_delete,
      ADMIN_ACTION_CATEGORIES.client_management,
      `Deleted client: ${clientName}`,
      { clientId, clientName }
    );
  }, [logActivity]);

  const logClientStatusChange = useCallback((clientName: string, clientId: string, oldStatus: string, newStatus: string) => {
    return logActivity(
      ADMIN_ACTION_TYPES.client_status_change,
      ADMIN_ACTION_CATEGORIES.client_management,
      `Changed client status: ${clientName} from ${oldStatus} to ${newStatus}`,
      { clientId, clientName, oldStatus, newStatus }
    );
  }, [logActivity]);

  // Admin Staff Management
  const logStaffCreate = useCallback((staffName: string, staffEmail: string, staffId?: string) => {
    return logActivity(
      ADMIN_ACTION_TYPES.staff_create,
      ADMIN_ACTION_CATEGORIES.admin_staff,
      `Added admin staff member: ${staffName} (${staffEmail})`,
      { staffId, staffName, staffEmail }
    );
  }, [logActivity]);

  const logStaffUpdate = useCallback((staffName: string, staffId: string, changes: Record<string, any>) => {
    return logActivity(
      ADMIN_ACTION_TYPES.staff_update,
      ADMIN_ACTION_CATEGORIES.admin_staff,
      `Updated admin staff member: ${staffName}`,
      { staffId, staffName, changes }
    );
  }, [logActivity]);

  const logStaffStatusChange = useCallback((staffName: string, staffId: string, newStatus: string) => {
    return logActivity(
      ADMIN_ACTION_TYPES.staff_update,
      ADMIN_ACTION_CATEGORIES.admin_staff,
      `Changed admin staff status: ${staffName} to ${newStatus}`,
      { staffId, staffName, newStatus }
    );
  }, [logActivity]);

  const logStaffPermissionUpdate = useCallback((staffName: string, staffId: string, clientAccess: string[]) => {
    return logActivity(
      ADMIN_ACTION_TYPES.staff_permission_update,
      ADMIN_ACTION_CATEGORIES.admin_staff,
      `Updated client access for: ${staffName}`,
      { staffId, staffName, clientAccessCount: clientAccess.length, clientAccess }
    );
  }, [logActivity]);

  // Product Management
  const logProductAdd = useCallback((productName: string, productId: string) => {
    return logActivity(
      ADMIN_ACTION_TYPES.product_add,
      ADMIN_ACTION_CATEGORIES.products,
      `Added product: ${productName}`,
      { productId, productName }
    );
  }, [logActivity]);

  const logProductUpdate = useCallback((productName: string, productId: string, changes: Record<string, any>) => {
    return logActivity(
      ADMIN_ACTION_TYPES.product_update,
      ADMIN_ACTION_CATEGORIES.products,
      `Updated product: ${productName}`,
      { productId, productName, changes }
    );
  }, [logActivity]);

  const logProductDelete = useCallback((productName: string, productId: string) => {
    return logActivity(
      ADMIN_ACTION_TYPES.product_delete,
      ADMIN_ACTION_CATEGORIES.products,
      `Deleted product: ${productName}`,
      { productId, productName }
    );
  }, [logActivity]);

  const logMasterDbImport = useCallback((recordCount: number) => {
    return logActivity(
      ADMIN_ACTION_TYPES.master_db_import,
      ADMIN_ACTION_CATEGORIES.products,
      `Imported ${recordCount} records to master database`,
      { recordCount }
    );
  }, [logActivity]);

  // Order Management
  const logOrderStatusChange = useCallback((orderId: string, customerName: string, oldStatus: string, newStatus: string) => {
    return logActivity(
      ADMIN_ACTION_TYPES.order_status_change,
      ADMIN_ACTION_CATEGORIES.orders,
      `Changed order status for ${customerName}: ${oldStatus} → ${newStatus}`,
      { orderId, customerName, oldStatus, newStatus }
    );
  }, [logActivity]);

  const logOrderUpdate = useCallback((orderId: string, customerName: string, changes: Record<string, any>) => {
    return logActivity(
      ADMIN_ACTION_TYPES.order_update,
      ADMIN_ACTION_CATEGORIES.orders,
      `Updated order for ${customerName}`,
      { orderId, customerName, changes }
    );
  }, [logActivity]);

  // Manufacturing
  const logManufacturingStatusUpdate = useCallback((orderId: string, customerName: string, oldStatus: string, newStatus: string) => {
    return logActivity(
      ADMIN_ACTION_TYPES.manufacturing_status_update,
      ADMIN_ACTION_CATEGORIES.manufacturing,
      `Updated manufacturing status for ${customerName}: ${oldStatus} → ${newStatus}`,
      { orderId, customerName, oldStatus, newStatus }
    );
  }, [logActivity]);

  const logManufacturingNotesUpdate = useCallback((orderId: string, customerName: string) => {
    return logActivity(
      ADMIN_ACTION_TYPES.manufacturing_status_update,
      ADMIN_ACTION_CATEGORIES.manufacturing,
      `Updated manufacturing notes for order: ${customerName}`,
      { orderId, customerName }
    );
  }, [logActivity]);

  // Design Requests
  const logDesignRequestStatusUpdate = useCallback((requestId: string, clientName: string, oldStatus: string, newStatus: string) => {
    return logActivity(
      ADMIN_ACTION_TYPES.design_request_status_update,
      ADMIN_ACTION_CATEGORIES.design_requests,
      `Updated design request status for ${clientName}: ${oldStatus} → ${newStatus}`,
      { requestId, clientName, oldStatus, newStatus }
    );
  }, [logActivity]);

  const logDesignRequestNotesUpdate = useCallback((requestId: string, clientName: string) => {
    return logActivity(
      ADMIN_ACTION_TYPES.design_request_status_update,
      ADMIN_ACTION_CATEGORIES.design_requests,
      `Updated admin notes for design request: ${clientName}`,
      { requestId, clientName }
    );
  }, [logActivity]);

  // Settings
  const logSettingsUpdate = useCallback((settingType: string, changes: Record<string, any>) => {
    return logActivity(
      ADMIN_ACTION_TYPES.settings_update,
      ADMIN_ACTION_CATEGORIES.settings,
      `Updated ${settingType} settings`,
      { settingType, changes }
    );
  }, [logActivity]);

  const logAlertThresholdsUpdate = useCallback((thresholds: Record<string, any>) => {
    return logActivity(
      ADMIN_ACTION_TYPES.alert_thresholds_update,
      ADMIN_ACTION_CATEGORIES.settings,
      `Updated alert thresholds`,
      { thresholds }
    );
  }, [logActivity]);

  // Security
  const logSecurityEventResolution = useCallback((eventId: string, resolution: string) => {
    return logActivity(
      ADMIN_ACTION_TYPES.security_event_resolution,
      ADMIN_ACTION_CATEGORIES.security,
      `Resolved security event: ${resolution}`,
      { eventId, resolution }
    );
  }, [logActivity]);

  // Data Governance
  const logDataExport = useCallback((exportType: string, recordCount: number) => {
    return logActivity(
      ADMIN_ACTION_TYPES.data_export,
      ADMIN_ACTION_CATEGORIES.data_governance,
      `Exported ${recordCount} ${exportType} records`,
      { exportType, recordCount }
    );
  }, [logActivity]);

  const logGdprRequestProcessing = useCallback((requestId: string, requestType: string, userEmail: string) => {
    return logActivity(
      ADMIN_ACTION_TYPES.gdpr_request_processing,
      ADMIN_ACTION_CATEGORIES.data_governance,
      `Processed GDPR ${requestType} request for ${userEmail}`,
      { requestId, requestType, userEmail }
    );
  }, [logActivity]);

  // AI Configuration
  const logAiConfigUpdate = useCallback((configType: string, changes: Record<string, any>) => {
    return logActivity(
      'ai_config_update',
      'ai_configuration',
      `Updated AI configuration: ${configType}`,
      { configType, changes }
    );
  }, [logActivity]);

  const logAiTrainingAdd = useCallback((question: string) => {
    return logActivity(
      'ai_training_add',
      'ai_configuration',
      `Added AI training example`,
      { questionPreview: question.substring(0, 100) }
    );
  }, [logActivity]);

  const logAiTrainingDelete = useCallback((exampleId: string) => {
    return logActivity(
      'ai_training_delete',
      'ai_configuration',
      `Deleted AI training example`,
      { exampleId }
    );
  }, [logActivity]);

  // Generic activity logger for custom actions
  const logCustomActivity = useCallback((
    actionType: string,
    actionCategory: string,
    description: string,
    metadata?: Record<string, any>
  ) => {
    return logActivity(actionType, actionCategory, description, metadata);
  }, [logActivity]);

  return {
    // Client Management
    logClientCreate,
    logClientUpdate,
    logClientDelete,
    logClientStatusChange,
    
    // Admin Staff
    logStaffCreate,
    logStaffUpdate,
    logStaffStatusChange,
    logStaffPermissionUpdate,
    
    // Products
    logProductAdd,
    logProductUpdate,
    logProductDelete,
    logMasterDbImport,
    
    // Orders
    logOrderStatusChange,
    logOrderUpdate,
    
    // Manufacturing
    logManufacturingStatusUpdate,
    logManufacturingNotesUpdate,
    
    // Design Requests
    logDesignRequestStatusUpdate,
    logDesignRequestNotesUpdate,
    
    // Settings
    logSettingsUpdate,
    logAlertThresholdsUpdate,
    
    // Security
    logSecurityEventResolution,
    
    // Data Governance
    logDataExport,
    logGdprRequestProcessing,
    
    // AI Configuration
    logAiConfigUpdate,
    logAiTrainingAdd,
    logAiTrainingDelete,
    
    // Custom
    logCustomActivity,
  };
}
