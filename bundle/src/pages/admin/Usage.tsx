import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { supabase } from '@/integrations/supabase/client';
import { ClientUsageTable } from '@/components/admin/usage/ClientUsageTable';
import { AtRiskClientsWidget } from '@/components/admin/usage/AtRiskClientsWidget';
import { Database, HardDrive, Zap, AlertCircle, RefreshCw, Download } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';

const FREE_TIER_LIMITS = {
  database: 500,
  storage: 1000,
  functions: 500000,
};

export default function Usage() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [stats, setStats] = useState({
    totalClients: 0,
    totalDbUsage: 0,
    totalStorageUsage: 0,
    totalFunctionInvocations: 0,
    warningClients: 0,
    criticalClients: 0,
  });
  const [clientUsageData, setClientUsageData] = useState<any[]>([]);
  const [atRiskClients, setAtRiskClients] = useState<any[]>([]);

  const loadUsageData = async () => {
    try {
      // Fetch all clients
      const { data: clients, error: clientsError } = await supabase
        .from('clients')
        .select('id, company_name, status')
        .eq('status', 'active');

      if (clientsError) throw clientsError;

      if (!clients || clients.length === 0) {
        setLoading(false);
        return;
      }

      // Get latest usage snapshot for each client
      const clientUsage = await Promise.all(
        clients.map(async (client) => {
          const { data: snapshot } = await supabase
            .from('usage_snapshots')
            .select('*')
            .eq('client_id', client.id)
            .order('snapshot_date', { ascending: false })
            .limit(1)
            .maybeSingle();

          const dbUsage = snapshot?.database_size_mb || 0;
          const storageUsage = snapshot?.storage_size_mb || 0;
          const functionInvocations = snapshot?.function_invocations || 0;

          const dbPercentage = (dbUsage / FREE_TIER_LIMITS.database) * 100;
          const storagePercentage = (storageUsage / FREE_TIER_LIMITS.storage) * 100;
          const functionPercentage = (functionInvocations / FREE_TIER_LIMITS.functions) * 100;

          const maxPercentage = Math.max(dbPercentage, storagePercentage, functionPercentage);
          
          let status = 'safe';
          if (maxPercentage >= 90) status = 'critical';
          else if (maxPercentage >= 75) status = 'warning';

          // Estimate days to limit based on highest usage
          const daysToLimit = maxPercentage >= 100 ? 0 : Math.floor(((100 - maxPercentage) / maxPercentage) * 30);

          return {
            client_id: client.id,
            client_name: client.company_name,
            db_usage_mb: Math.round(dbUsage),
            db_percentage: dbPercentage,
            storage_usage_mb: Math.round(storageUsage),
            storage_percentage: storagePercentage,
            function_invocations: functionInvocations,
            function_percentage: functionPercentage,
            status,
            days_to_limit: daysToLimit,
            max_percentage: maxPercentage,
          };
        })
      );

      // Calculate aggregate stats
      const totalDbUsage = clientUsage.reduce((sum, c) => sum + c.db_usage_mb, 0);
      const totalStorageUsage = clientUsage.reduce((sum, c) => sum + c.storage_usage_mb, 0);
      const totalFunctionInvocations = clientUsage.reduce((sum, c) => sum + c.function_invocations, 0);
      const warningClients = clientUsage.filter((c) => c.status === 'warning').length;
      const criticalClients = clientUsage.filter((c) => c.status === 'critical').length;

      setStats({
        totalClients: clients.length,
        totalDbUsage,
        totalStorageUsage,
        totalFunctionInvocations,
        warningClients,
        criticalClients,
      });

      setClientUsageData(clientUsage);

      // Filter at-risk clients (75%+ on any resource)
      const atRisk = clientUsage
        .filter((c) => c.max_percentage >= 75)
        .map((c) => {
          const highestType =
            c.db_percentage >= c.storage_percentage && c.db_percentage >= c.function_percentage
              ? 'Database'
              : c.storage_percentage >= c.function_percentage
              ? 'Storage'
              : 'Functions';
          
          return {
            client_id: c.client_id,
            client_name: c.client_name,
            highest_usage_type: highestType,
            highest_usage_percentage: c.max_percentage,
            days_to_limit: c.days_to_limit,
          };
        })
        .sort((a, b) => b.highest_usage_percentage - a.highest_usage_percentage);

      setAtRiskClients(atRisk);
    } catch (error) {
      console.error('Error loading usage data:', error);
      toast.error('Failed to load usage data');
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      // Trigger snapshot for all clients
      const { error } = await supabase.functions.invoke('usage-snapshot');
      if (error) throw error;
      
      toast.success('Usage snapshots triggered');
      await new Promise(resolve => setTimeout(resolve, 2000));
      await loadUsageData();
    } catch (error) {
      console.error('Error refreshing usage:', error);
      toast.error('Failed to refresh usage data');
    } finally {
      setRefreshing(false);
    }
  };

  const handleExport = () => {
    const csv = [
      ['Client Name', 'DB Usage (MB)', 'DB %', 'Storage (MB)', 'Storage %', 'Functions', 'Function %', 'Status', 'Days to Limit'],
      ...clientUsageData.map(c => [
        c.client_name,
        c.db_usage_mb,
        c.db_percentage.toFixed(1),
        c.storage_usage_mb,
        c.storage_percentage.toFixed(1),
        c.function_invocations,
        c.function_percentage.toFixed(1),
        c.status,
        c.days_to_limit,
      ])
    ].map(row => row.join(',')).join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `client-usage-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    toast.success('Usage report exported');
  };

  useEffect(() => {
    loadUsageData();
  }, []);

  if (loading) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 space-y-4 sm:space-y-6">
        <Skeleton className="h-8 sm:h-10 w-48 sm:w-64" />
        <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          <Skeleton className="h-28 sm:h-32" />
          <Skeleton className="h-28 sm:h-32" />
          <Skeleton className="h-28 sm:h-32" />
        </div>
        <Skeleton className="h-64 sm:h-96" />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">Usage Monitoring</h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            Monitor resource usage across all client accounts
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download className="w-4 h-4 sm:mr-2" />
            <span className="hidden sm:inline">Export CSV</span>
          </Button>
          <Button size="sm" onClick={handleRefresh} disabled={refreshing}>
            <RefreshCw className={`w-4 h-4 sm:mr-2 ${refreshing ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Refresh All</span>
          </Button>
        </div>
      </div>

      {stats.criticalClients > 0 && (
        <Alert variant="destructive" className="text-sm">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            <strong>{stats.criticalClients}</strong> client{stats.criticalClients > 1 ? 's are' : ' is'} at critical usage levels (90%+)
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs sm:text-sm font-medium">Total Database Usage</CardTitle>
            <Database className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-xl sm:text-2xl font-bold">{stats.totalDbUsage}MB</div>
            <p className="text-xs text-muted-foreground">
              Across {stats.totalClients} active clients
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs sm:text-sm font-medium">Total Storage Usage</CardTitle>
            <HardDrive className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-xl sm:text-2xl font-bold">{stats.totalStorageUsage}MB</div>
            <p className="text-xs text-muted-foreground">
              File storage across all clients
            </p>
          </CardContent>
        </Card>

        <Card className="sm:col-span-2 lg:col-span-1">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs sm:text-sm font-medium">Function Invocations</CardTitle>
            <Zap className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-xl sm:text-2xl font-bold">
              {stats.totalFunctionInvocations.toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground">
              {stats.warningClients + stats.criticalClients > 0 && (
                <span className="text-amber-600">
                  {stats.warningClients + stats.criticalClients} client{stats.warningClients + stats.criticalClients > 1 ? 's' : ''} at risk
                </span>
              )}
              {stats.warningClients + stats.criticalClients === 0 && 'All clients healthy'}
            </p>
          </CardContent>
        </Card>
      </div>

      <AtRiskClientsWidget clients={atRiskClients} />

      <Card>
        <CardHeader className="p-4 sm:p-6">
          <CardTitle className="text-base sm:text-lg">Client Usage Overview</CardTitle>
          <CardDescription className="text-xs sm:text-sm">
            Detailed usage metrics for each active client
          </CardDescription>
        </CardHeader>
        <CardContent className="p-4 sm:p-6 pt-0 sm:pt-0">
          {clientUsageData.length > 0 ? (
            <div className="overflow-x-auto -mx-4 sm:mx-0">
              <div className="min-w-[600px] sm:min-w-0 px-4 sm:px-0">
                <ClientUsageTable clients={clientUsageData} />
              </div>
            </div>
          ) : (
            <div className="text-center py-6 sm:py-8 text-sm text-muted-foreground">
              No usage data available
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
