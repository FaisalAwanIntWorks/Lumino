import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useAdminImpersonation } from '@/contexts/AdminImpersonationContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Key, Activity, ShieldAlert, TrendingUp, BarChart3 } from 'lucide-react';

interface KeyVerification {
  time: number;
  success: number;
  rateLimited: number;
  usageExceeded: number;
}

interface KeyAnalytics {
  keyId: string;
  name: string;
  start: string;
  enabled: boolean;
  createdAt: number;
  expires?: number;
  remaining?: number;
  verifications: KeyVerification[];
  totalSuccess: number;
  totalRateLimited: number;
  totalUsageExceeded: number;
}

interface ApiUsageData {
  clientId: string;
  totalKeys: number;
  activeKeys: number;
  totals: {
    totalRequests: number;
    successfulRequests: number;
    rateLimited: number;
    usageExceeded: number;
  };
  keys: KeyAnalytics[];
}

export function ApiUsageAnalytics() {
  const { user } = useAuth();
  const { isImpersonating, impersonatedClientId } = useAdminImpersonation();

  const { data: clientData } = useQuery({
    queryKey: ['client-for-api-usage', user?.id, impersonatedClientId],
    queryFn: async () => {
      if (isImpersonating && impersonatedClientId) return { id: impersonatedClientId };
      const { data, error } = await supabase
        .from('clients')
        .select('id')
        .eq('user_id', user!.id)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!user || isImpersonating,
  });

  const { data: analytics, isLoading } = useQuery({
    queryKey: ['api-usage-analytics', clientData?.id],
    queryFn: async () => {
      const session = (await supabase.auth.getSession()).data.session;
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/unkey-usage-analytics${clientData?.id ? `?clientId=${clientData.id}` : ''}`,
        {
          headers: {
            'Authorization': `Bearer ${session?.access_token}`,
            'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
        }
      );
      if (!response.ok) throw new Error('Failed to fetch API analytics');
      return await response.json() as ApiUsageData;
    },
    enabled: !!clientData?.id,
    refetchInterval: 5 * 60 * 1000, // Refresh every 5 min
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-64 mt-1" />
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-3">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-24" />)}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!analytics || analytics.totalKeys === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Key className="h-5 w-5" />
            API Usage
          </CardTitle>
          <CardDescription>No API keys configured yet</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Once API keys are assigned, usage analytics will appear here.
          </p>
        </CardContent>
      </Card>
    );
  }

  const { totals, keys: keyAnalytics } = analytics;
  const successRate = totals.totalRequests > 0
    ? ((totals.successfulRequests / totals.totalRequests) * 100).toFixed(1)
    : '100';

  return (
    <div className="space-y-6">
      {/* Overview Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            API Usage Analytics
          </CardTitle>
          <CardDescription>
            Tracking {analytics.totalKeys} key{analytics.totalKeys !== 1 ? 's' : ''} ({analytics.activeKeys} active)
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* Summary Stats */}
          <div className="grid gap-4 sm:grid-cols-4">
            <div className="rounded-lg border p-4 space-y-1">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Activity className="h-3.5 w-3.5" />
                Total Requests
              </div>
              <p className="text-2xl font-bold">{totals.totalRequests.toLocaleString()}</p>
            </div>
            <div className="rounded-lg border p-4 space-y-1">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <TrendingUp className="h-3.5 w-3.5" />
                Successful
              </div>
              <p className="text-2xl font-bold text-green-500">{totals.successfulRequests.toLocaleString()}</p>
            </div>
            <div className="rounded-lg border p-4 space-y-1">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <ShieldAlert className="h-3.5 w-3.5" />
                Rate Limited
              </div>
              <p className="text-2xl font-bold text-orange-500">{totals.rateLimited.toLocaleString()}</p>
            </div>
            <div className="rounded-lg border p-4 space-y-1">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Key className="h-3.5 w-3.5" />
                Success Rate
              </div>
              <p className="text-2xl font-bold">{successRate}%</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Per-Key Breakdown */}
      {keyAnalytics.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Per-Key Breakdown</CardTitle>
            <CardDescription>Usage statistics for each API key</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {keyAnalytics.map((key) => {
                const keyTotal = key.totalSuccess + key.totalRateLimited + key.totalUsageExceeded;
                const keySuccessRate = keyTotal > 0 ? ((key.totalSuccess / keyTotal) * 100).toFixed(1) : '100';

                // Mini sparkline from last 7 days of verifications
                const last7 = key.verifications.slice(-7);
                const maxVal = Math.max(...last7.map(v => v.success + v.rateLimited + v.usageExceeded), 1);

                return (
                  <div
                    key={key.keyId}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-lg border bg-muted/10"
                  >
                    <div className="space-y-1.5 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm">{key.name}</span>
                        <Badge variant={key.enabled ? 'default' : 'secondary'} className="text-[10px]">
                          {key.enabled ? 'Active' : 'Disabled'}
                        </Badge>
                        <span className="font-mono text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                          {key.start}...
                        </span>
                      </div>
                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <span>{keyTotal.toLocaleString()} requests</span>
                        <span className="text-green-500">{key.totalSuccess.toLocaleString()} ok</span>
                        {key.totalRateLimited > 0 && (
                          <span className="text-orange-500">{key.totalRateLimited} rate-limited</span>
                        )}
                        <span>{keySuccessRate}% success</span>
                      </div>
                    </div>

                    {/* Mini bar chart (last 7 days) */}
                    <div className="flex items-end gap-0.5 h-8 shrink-0">
                      {last7.map((v, i) => {
                        const total = v.success + v.rateLimited + v.usageExceeded;
                        const height = Math.max((total / maxVal) * 100, 4);
                        const hasErrors = v.rateLimited > 0 || v.usageExceeded > 0;
                        return (
                          <div
                            key={i}
                            className={`w-2 rounded-sm ${hasErrors ? 'bg-orange-400' : 'bg-primary/60'}`}
                            style={{ height: `${height}%` }}
                            title={`${total} requests`}
                          />
                        );
                      })}
                      {last7.length === 0 && (
                        <span className="text-[10px] text-muted-foreground">No data</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
