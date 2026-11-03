import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type {
  AlertRow, HealthCheckRow, IncidentRow, MonitorRunResult, MonthlyReport,
  OverviewRow, QuotaRow, SettingRow, TrendRow,
} from './types';

// The new tables/RPCs are not in the generated Supabase types yet, so the
// client is cast the same way other admin pages do for fresh tables.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export const healthKeys = {
  latest: ['platform-health', 'latest'] as const,
  overview: (days: number) => ['platform-health', 'overview', days] as const,
  trend: (days: number) => ['platform-health', 'trend', days] as const,
  incidents: ['platform-health', 'incidents'] as const,
  quotas: ['platform-health', 'quotas'] as const,
  quotaHistory: (service: string, metric: string, days: number) => ['platform-health', 'quota-history', service, metric, days] as const,
  alerts: ['platform-health', 'alerts'] as const,
  settings: ['platform-health', 'settings'] as const,
  reports: ['platform-health', 'reports'] as const,
  reportPreview: (month: string) => ['platform-health', 'report-preview', month] as const,
};

async function rpc<T>(name: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await db.rpc(name, args ?? {});
  if (error) throw error;
  return data as T;
}

export function useLatestChecks() {
  return useQuery({
    queryKey: healthKeys.latest,
    queryFn: () => rpc<HealthCheckRow[]>('get_platform_health_latest'),
    refetchInterval: false,
  });
}

export function useOverview(days: number) {
  return useQuery({
    queryKey: healthKeys.overview(days),
    queryFn: () => rpc<OverviewRow[]>('get_platform_health_overview', { p_days: days }),
  });
}

export function useTrend(days: number) {
  return useQuery({
    queryKey: healthKeys.trend(days),
    queryFn: () => rpc<TrendRow[]>('get_platform_health_trend', { p_days: days }),
  });
}

export function useIncidents(limit = 100) {
  return useQuery({
    queryKey: healthKeys.incidents,
    queryFn: async () => {
      const { data, error } = await db
        .from('platform_health_incidents')
        .select('*')
        .order('started_at', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []) as IncidentRow[];
    },
  });
}

export function useQuotas() {
  return useQuery({
    queryKey: healthKeys.quotas,
    queryFn: () => rpc<QuotaRow[]>('get_platform_quota_latest'),
    refetchInterval: false,
  });
}

export function useQuotaHistory(service: string | null, metric: string | null, days: number) {
  return useQuery({
    queryKey: healthKeys.quotaHistory(service ?? '', metric ?? '', days),
    enabled: !!service && !!metric,
    queryFn: async () => {
      const since = new Date(Date.now() - days * 86_400_000).toISOString();
      const { data, error } = await db
        .from('platform_quota_snapshots')
        .select('captured_at, used, quota_limit, pct, level')
        .eq('service', service)
        .eq('metric', metric)
        .gte('captured_at', since)
        .order('captured_at', { ascending: true })
        .limit(2000);
      if (error) throw error;
      return (data ?? []) as Array<Pick<QuotaRow, 'captured_at' | 'used' | 'quota_limit' | 'pct' | 'level'>>;
    },
  });
}

export function useAlerts(limit = 200) {
  return useQuery({
    queryKey: healthKeys.alerts,
    queryFn: async () => {
      const { data, error } = await db
        .from('platform_health_alerts')
        .select('*')
        .neq('alert_type', 'monthly_report')
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []) as AlertRow[];
    },
  });
}

export function useReports() {
  return useQuery({
    queryKey: healthKeys.reports,
    queryFn: async () => {
      const { data, error } = await db
        .from('platform_health_alerts')
        .select('*')
        .eq('alert_type', 'monthly_report')
        .order('created_at', { ascending: false })
        .limit(36);
      if (error) throw error;
      return (data ?? []) as AlertRow[];
    },
  });
}

export function useReportPreview(month: string) {
  return useQuery({
    queryKey: healthKeys.reportPreview(month),
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('platform-health-monitor', {
        body: { mode: 'preview_report', month },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data.report as MonthlyReport;
    },
  });
}

export function useSettings() {
  return useQuery({
    queryKey: healthKeys.settings,
    queryFn: async () => {
      const { data, error } = await db
        .from('platform_health_settings')
        .select('key, value, description, updated_at')
        .order('key');
      if (error) throw error;
      return (data ?? []) as SettingRow[];
    },
  });
}

export function useSaveSetting() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ key, value }: { key: string; value: unknown }) => {
      const { data: userData } = await supabase.auth.getUser();
      const { error } = await db
        .from('platform_health_settings')
        .update({ value, updated_at: new Date().toISOString(), updated_by: userData?.user?.id ?? null })
        .eq('key', key);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: healthKeys.settings }),
  });
}

/** Trigger a full monitor run (probes + persistence + alerting) and refresh every view. */
export function useRunMonitor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('platform-health-monitor', {
        body: { mode: 'run', source: 'manual' },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data as MonitorRunResult;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['platform-health'] }),
  });
}

export function useSendTestAlert() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('platform-health-monitor', { body: { mode: 'test_alert' } });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data as { sent: boolean; error?: string; recipients: string[] };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: healthKeys.alerts }),
  });
}

export function useSendMonthlyReport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (month: string) => {
      const { data, error } = await supabase.functions.invoke('platform-health-monitor', {
        body: { mode: 'report', period: 'monthly', month },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data as { report: MonthlyReport; email_sent: boolean; email_error?: string };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: healthKeys.reports }),
  });
}
