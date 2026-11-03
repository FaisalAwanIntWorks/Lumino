import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AllClientAlertsTable } from '@/components/admin/alerts/AllClientAlertsTable';
import { Bell, RefreshCw, AlertCircle } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { Alert, AlertDescription } from '@/components/ui/alert';

export default function Alerts() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [allAlerts] = useState<any[]>([]);
  const [stats] = useState({ totalAlerts: 0, unacknowledged: 0, critical: 0, warning: 0 });

  useEffect(() => {
    // usage_alerts table removed - load completes immediately
    setLoading(false);
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    // No-op since usage_alerts table was removed
    setTimeout(() => {
      setRefreshing(false);
      toast.success('Alerts refreshed');
    }, 500);
  };

  if (loading) {
    return (
      <div className="container mx-auto p-6 space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid gap-4 md:grid-cols-3"><Skeleton className="h-32" /><Skeleton className="h-32" /><Skeleton className="h-32" /></div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2"><Bell className="w-8 h-8" />Alert Management</h1>
          <p className="text-muted-foreground">Monitor and manage usage alerts across all clients</p>
        </div>
        <Button onClick={handleRefresh} disabled={refreshing}>
          <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />Refresh
        </Button>
      </div>

      {stats.critical > 0 && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription><strong>{stats.critical}</strong> critical alert{stats.critical > 1 ? 's' : ''} require immediate attention</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium">Total Alerts</CardTitle><Bell className="h-4 w-4 text-muted-foreground" /></CardHeader>
          <CardContent><div className="text-2xl font-bold">{stats.totalAlerts}</div><p className="text-xs text-muted-foreground">{stats.unacknowledged} unacknowledged</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium">Critical Alerts</CardTitle><AlertCircle className="h-4 w-4 text-destructive" /></CardHeader>
          <CardContent><div className="text-2xl font-bold text-destructive">{stats.critical}</div><p className="text-xs text-muted-foreground">Require immediate action</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium">Warning Alerts</CardTitle><AlertCircle className="h-4 w-4 text-amber-600" /></CardHeader>
          <CardContent><div className="text-2xl font-bold text-amber-600">{stats.warning}</div><p className="text-xs text-muted-foreground">Monitor closely</p></CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>All Client Alerts</CardTitle><CardDescription>Comprehensive view of usage alerts across all client accounts</CardDescription></CardHeader>
        <CardContent><AllClientAlertsTable alerts={allAlerts} onRefresh={handleRefresh} /></CardContent>
      </Card>
    </div>
  );
}
