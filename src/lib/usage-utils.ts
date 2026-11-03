import { supabase } from '@/integrations/supabase/client';

export interface UsageMetrics {
  database: { sizeMb: number; rows: number; percentUsed: number; limit: number };
  storage: { sizeMb: number; filesCount: number; percentUsed: number; limit: number };
  functions: { invocations: number; percentUsed: number; limit: number };
  bandwidth: { mb: number; percentUsed: number; limit: number };
  analyticsEvents: { count: number; todayCount: number };
}

export interface UsageSnapshot {
  id: string;
  client_id: string;
  snapshot_date: string;
  database_size_mb: number;
  database_rows: number;
  storage_size_mb: number;
  storage_files_count: number;
  function_invocations: number;
  bandwidth_mb: number;
  analytics_events_count: number;
  ai_tokens_used: number;
  created_at: string;
}

export interface UsageAlert {
  id: string;
  client_id: string;
  alert_type: 'database' | 'storage' | 'functions' | 'bandwidth' | 'ai';
  threshold_percentage: 50 | 75 | 90;
  current_usage: number;
  limit_value: number;
  message: string;
  severity: 'info' | 'warning' | 'critical';
  triggered_at: string;
  acknowledged: boolean;
  acknowledged_at?: string;
}

export const FREE_TIER_LIMITS = {
  database: 500,
  storage: 1024,
  functions: 500000,
  bandwidth: 2048,
};

export const getCurrentUsageMetrics = async (clientId: string): Promise<UsageMetrics> => {
  const { data: snapshot } = await supabase
    .from('usage_snapshots')
    .select('*')
    .eq('client_id', clientId)
    .order('snapshot_date', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!snapshot) {
    return {
      database: { sizeMb: 0, rows: 0, percentUsed: 0, limit: FREE_TIER_LIMITS.database },
      storage: { sizeMb: 0, filesCount: 0, percentUsed: 0, limit: FREE_TIER_LIMITS.storage },
      functions: { invocations: 0, percentUsed: 0, limit: FREE_TIER_LIMITS.functions },
      bandwidth: { mb: 0, percentUsed: 0, limit: FREE_TIER_LIMITS.bandwidth },
      analyticsEvents: { count: 0, todayCount: 0 },
    };
  }

  return {
    database: {
      sizeMb: snapshot.database_size_mb || 0,
      rows: snapshot.database_rows || 0,
      percentUsed: ((snapshot.database_size_mb || 0) / FREE_TIER_LIMITS.database) * 100,
      limit: FREE_TIER_LIMITS.database,
    },
    storage: {
      sizeMb: snapshot.storage_size_mb || 0,
      filesCount: snapshot.storage_files_count || 0,
      percentUsed: ((snapshot.storage_size_mb || 0) / FREE_TIER_LIMITS.storage) * 100,
      limit: FREE_TIER_LIMITS.storage,
    },
    functions: {
      invocations: snapshot.function_invocations || 0,
      percentUsed: ((snapshot.function_invocations || 0) / FREE_TIER_LIMITS.functions) * 100,
      limit: FREE_TIER_LIMITS.functions,
    },
    bandwidth: {
      mb: snapshot.bandwidth_mb || 0,
      percentUsed: ((snapshot.bandwidth_mb || 0) / FREE_TIER_LIMITS.bandwidth) * 100,
      limit: FREE_TIER_LIMITS.bandwidth,
    },
    analyticsEvents: {
      count: snapshot.analytics_events_count || 0,
      todayCount: 0,
    },
  };
};

export const getUsageHistory = async (clientId: string, days: number = 30): Promise<UsageSnapshot[]> => {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const { data, error } = await supabase
    .from('usage_snapshots')
    .select('*')
    .eq('client_id', clientId)
    .gte('snapshot_date', startDate.toISOString().split('T')[0])
    .order('snapshot_date', { ascending: true });

  if (error) throw error;
  return data || [];
};

// Usage alerts table was removed - return empty array
export const getActiveAlerts = async (_clientId: string): Promise<UsageAlert[]> => {
  return [];
};

// No-op since usage_alerts table was removed
export const acknowledgeAlert = async (_alertId: string): Promise<void> => {
  console.warn('Usage alerts table no longer exists');
};

export const triggerUsageSnapshot = async (): Promise<void> => {
  const { error } = await supabase.functions.invoke('usage-snapshot');
  if (error) throw error;
};

export const getSeverityColor = (severity: string): string => {
  switch (severity) {
    case 'critical': return 'text-destructive';
    case 'warning': return 'text-orange-500';
    default: return 'text-blue-500';
  }
};

export const getSeverityBadgeVariant = (severity: string): 'destructive' | 'secondary' | 'default' => {
  switch (severity) {
    case 'critical': return 'destructive';
    case 'warning': return 'secondary';
    default: return 'default';
  }
};
