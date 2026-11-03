import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { ActivityFeed } from '@/components/admin/security/ActivityFeed';
import { SecurityEventsTable } from '@/components/admin/security/SecurityEventsTable';
import { ImpersonationHistory } from '@/components/admin/security/ImpersonationHistory';
import { Shield, Download, RefreshCw, AlertCircle } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';

export default function Security() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [securityEvents] = useState<any[]>([]);
  const [impersonationSessions, setImpersonationSessions] = useState<any[]>([]);

  const loadSecurityData = async () => {
    try {
      const { data: logs, error: logsError } = await supabase
        .from('audit_logs')
        .select('*')
        .order('timestamp', { ascending: false })
        .limit(100);

      if (logsError) throw logsError;
      setAuditLogs(logs || []);

      // security_events table removed - using empty array

      const { data: sessions, error: sessionsError } = await supabase
        .from('impersonation_sessions')
        .select(`*, clients:client_id (company_name)`)
        .order('started_at', { ascending: false })
        .limit(50);

      if (sessionsError) throw sessionsError;

      const formattedSessions = (sessions || []).map((session: any) => ({
        ...session,
        client_name: session.clients?.company_name || 'Unknown Client',
      }));
      setImpersonationSessions(formattedSessions);
    } catch (error) {
      console.error('Error loading security data:', error);
      toast.error('Failed to load security data');
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadSecurityData();
    setRefreshing(false);
    toast.success('Security data refreshed');
  };

  const handleExportAuditLogs = () => {
    const csv = [
      ['Timestamp', 'User', 'Action', 'Resource Type', 'Resource ID', 'Severity'],
      ...auditLogs.map((log) => [
        new Date(log.timestamp).toISOString(), log.user_email, log.action_type,
        log.resource_type || '', log.resource_id || '', log.severity,
      ]),
    ].map((row) => row.join(',')).join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit-logs-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    toast.success('Audit logs exported');
  };

  useEffect(() => { loadSecurityData(); }, []);

  if (loading) {
    return (
      <div className="container mx-auto p-4 sm:p-6 lg:p-8 space-y-4 sm:space-y-6">
        <Skeleton className="h-10 w-48 sm:w-64" />
        <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          <Skeleton className="h-28 sm:h-32" /><Skeleton className="h-28 sm:h-32" /><Skeleton className="h-28 sm:h-32" />
        </div>
        <Skeleton className="h-72 sm:h-96" />
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 sm:p-6 lg:p-8 space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2"><Shield className="w-6 h-6 sm:w-8 sm:h-8" />Security & Audit</h1>
          <p className="text-sm sm:text-base text-muted-foreground">Monitor system security events and audit logs</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleExportAuditLogs} size="sm"><Download className="w-4 h-4 sm:mr-2" /><span className="hidden sm:inline">Export Logs</span></Button>
          <Button onClick={handleRefresh} disabled={refreshing} size="sm"><RefreshCw className={`w-4 h-4 sm:mr-2 ${refreshing ? 'animate-spin' : ''}`} /><span className="hidden sm:inline">Refresh</span></Button>
        </div>
      </div>

      <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium">Total Audit Logs</CardTitle><Shield className="h-4 w-4 text-muted-foreground" /></CardHeader>
          <CardContent><div className="text-xl sm:text-2xl font-bold">{auditLogs.length}</div><p className="text-xs text-muted-foreground">Last 100 events</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium">Security Events</CardTitle><AlertCircle className="h-4 w-4 text-muted-foreground" /></CardHeader>
          <CardContent><div className="text-xl sm:text-2xl font-bold">{securityEvents.length}</div><p className="text-xs text-muted-foreground">All resolved</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium">Impersonation Sessions</CardTitle><Shield className="h-4 w-4 text-muted-foreground" /></CardHeader>
          <CardContent><div className="text-xl sm:text-2xl font-bold">{impersonationSessions.length}</div><p className="text-xs text-muted-foreground">Last 50 sessions</p></CardContent>
        </Card>
      </div>

      <Tabs defaultValue="activity" className="space-y-4">
        <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 pb-px">
          <TabsList className="inline-flex h-auto w-max gap-0 rounded-none border-b border-border bg-transparent p-0">
            <TabsTrigger value="activity" className="relative rounded-none border-b-2 border-transparent bg-transparent px-4 py-2.5 text-xs sm:text-sm font-medium text-muted-foreground shadow-none transition-none data-[state=active]:border-primary data-[state=active]:text-foreground data-[state=active]:shadow-none whitespace-nowrap">Activity Feed</TabsTrigger>
            <TabsTrigger value="events" className="relative rounded-none border-b-2 border-transparent bg-transparent px-4 py-2.5 text-xs sm:text-sm font-medium text-muted-foreground shadow-none transition-none data-[state=active]:border-primary data-[state=active]:text-foreground data-[state=active]:shadow-none whitespace-nowrap">Security Events</TabsTrigger>
            <TabsTrigger value="impersonation" className="relative rounded-none border-b-2 border-transparent bg-transparent px-4 py-2.5 text-xs sm:text-sm font-medium text-muted-foreground shadow-none transition-none data-[state=active]:border-primary data-[state=active]:text-foreground data-[state=active]:shadow-none whitespace-nowrap">Impersonation History</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="activity">
          <div className="overflow-x-auto -mx-4 sm:mx-0">
            <div className="min-w-[600px] sm:min-w-0 px-4 sm:px-0"><ActivityFeed logs={auditLogs} /></div>
          </div>
        </TabsContent>

        <TabsContent value="events">
          <Card>
            <CardHeader className="p-4 sm:p-6">
              <CardTitle className="text-base sm:text-lg">Security Events</CardTitle>
              <CardDescription className="text-xs sm:text-sm">Failed logins, suspicious activity, and security incidents</CardDescription>
            </CardHeader>
            <CardContent className="p-0 sm:p-6 sm:pt-0">
              <div className="overflow-x-auto">
                <div className="min-w-[600px] sm:min-w-0 p-4 sm:p-0">
                  <SecurityEventsTable events={securityEvents} onResolve={loadSecurityData} />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="impersonation">
          <div className="overflow-x-auto -mx-4 sm:mx-0">
            <div className="min-w-[600px] sm:min-w-0 px-4 sm:px-0"><ImpersonationHistory sessions={impersonationSessions} /></div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
