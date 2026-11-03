import { stickyHeaderTableClass } from "@/components/ui/table";
import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import { Database, FileText, Shield, Clock, CheckCircle, XCircle, Download, Trash2, AlertCircle, Eye, ExternalLink, Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

export default function DataGovernance() {
  const [loading, setLoading] = useState(true);
  const [retentionPolicies, setRetentionPolicies] = useState<any[]>([]);
  const [cleanupLogs, setCleanupLogs] = useState<any[]>([]);
  const [gdprRequests, setGdprRequests] = useState<any[]>([]);
  const [backupLogs, setBackupLogs] = useState<any[]>([]);
  const [customerEmail, setCustomerEmail] = useState('');
  const [processing, setProcessing] = useState(false);
  const [viewingBackup, setViewingBackup] = useState<any>(null);
  const [backupViewLoading, setBackupViewLoading] = useState(false);
  const [downloadingBackup, setDownloadingBackup] = useState<string | null>(null);

  const loadData = async () => {
    try {
      // Load retention policies
      const { data: policies, error: policiesError } = await supabase
        .from('retention_policies')
        .select(`
          *,
          clients:client_id (company_name)
        `)
        .order('created_at', { ascending: false });

      if (policiesError) throw policiesError;

      const formattedPolicies = (policies || []).map((policy: any) => ({
        ...policy,
        client_name: policy.clients?.company_name || 'All Clients',
      }));
      setRetentionPolicies(formattedPolicies);

      // Load cleanup logs
      const { data: logs, error: logsError } = await supabase
        .from('data_cleanup_logs')
        .select(`
          *,
          clients:client_id (company_name)
        `)
        .order('executed_at', { ascending: false })
        .limit(50);

      if (logsError) throw logsError;

      const formattedLogs = (logs || []).map((log: any) => ({
        ...log,
        client_name: log.clients?.company_name || 'All Clients',
      }));
      setCleanupLogs(formattedLogs);

      // gdpr_requests table removed - use empty array
      setGdprRequests([]);

      // Load backup logs
      const { data: backups, error: backupsError } = await supabase
        .from('backup_logs' as any)
        .select('*')
        .order('backup_date', { ascending: false })
        .limit(20);

      if (backupsError) throw backupsError;
      setBackupLogs(backups || []);
    } catch (error) {
      console.error('Error loading data governance info:', error);
      toast.error('Failed to load data governance information');
    } finally {
      setLoading(false);
    }
  };

  const handleRunBackup = async () => {
    setProcessing(true);
    try {
      const { data, error } = await supabase.functions.invoke('database-backup', {
        body: { backupType: 'manual' },
      });

      if (error) throw error;

      toast.success(`Backup completed: ${data.totalRecords} records backed up`);
      loadData();
    } catch (error: any) {
      console.error('Backup failed:', error);
      toast.error(`Backup failed: ${error.message}`);
    } finally {
      setProcessing(false);
    }
  };

  const handleGdprDelete = async () => {
    if (!customerEmail.trim()) {
      toast.error('Please enter a customer email');
      return;
    }

    setProcessing(true);
    try {
      const { data, error } = await supabase.functions.invoke('gdpr-delete-user', {
        body: { customerEmail: customerEmail.trim() },
      });

      if (error) throw error;

      toast.success(`GDPR deletion completed: ${data.totalRecordsDeleted} records deleted`);
      setCustomerEmail('');
      loadData();
    } catch (error: any) {
      console.error('GDPR deletion failed:', error);
      toast.error(`Deletion failed: ${error.message}`);
    } finally {
      setProcessing(false);
    }
  };

  const handleGdprExport = async () => {
    if (!customerEmail.trim()) {
      toast.error('Please enter a customer email');
      return;
    }

    setProcessing(true);
    try {
      const { data, error } = await supabase.functions.invoke('gdpr-export-user', {
        body: { customerEmail: customerEmail.trim() },
      });

      if (error) throw error;

      // Download the export
      const link = document.createElement('a');
      link.href = data.downloadUrl;
      link.download = `gdpr_export_${customerEmail}_${Date.now()}.json`;
      link.click();

      toast.success(`GDPR export completed: ${data.dataExported.length} categories exported`);
      setCustomerEmail('');
    } catch (error: any) {
      console.error('GDPR export failed:', error);
      toast.error(`Export failed: ${error.message}`);
    } finally {
      setProcessing(false);
    }
  };

  const handleCompleteGdprRequest = async (_requestId: string) => {
    toast.info('GDPR requests system is being upgraded');
  };

  const handleViewBackup = async (filePath: string) => {
    setBackupViewLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('backup-download', {
        body: { filePath, action: 'view' },
      });
      if (error) throw error;
      setViewingBackup(data);
    } catch (error: any) {
      console.error('Failed to view backup:', error);
      toast.error(`Failed to view backup: ${error.message}`);
    } finally {
      setBackupViewLoading(false);
    }
  };

  const handleDownloadBackup = async (filePath: string) => {
    setDownloadingBackup(filePath);
    try {
      const { data, error } = await supabase.functions.invoke('backup-download', {
        body: { filePath, action: 'view' },
      });
      if (error) throw error;

      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filePath.split('/').pop()?.replace('.gz', '') || 'backup.json';
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Backup downloaded successfully');
    } catch (error: any) {
      console.error('Failed to download backup:', error);
      toast.error(`Failed to download: ${error.message}`);
    } finally {
      setDownloadingBackup(null);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  if (loading) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 space-y-4 sm:space-y-6">
        <Skeleton className="h-8 sm:h-10 w-48 sm:w-64" />
        <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
          <Skeleton className="h-28 sm:h-32" />
          <Skeleton className="h-28 sm:h-32" />
          <Skeleton className="h-28 sm:h-32" />
          <Skeleton className="h-28 sm:h-32" />
        </div>
        <Skeleton className="h-72 sm:h-96" />
      </div>
    );
  }

  const pendingGdprCount = gdprRequests.filter((r) => r.status === 'pending').length;
  const totalRecordsDeleted = cleanupLogs.reduce((sum, log) => sum + log.records_deleted, 0);
  const latestBackup = backupLogs[0];

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-4 sm:space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
          <Shield className="w-6 h-6 sm:w-8 sm:h-8" />
          Data Governance
        </h1>
        <p className="text-sm sm:text-base text-muted-foreground">
          Manage data retention, cleanup, and compliance requests
        </p>
      </div>

      <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs sm:text-sm font-medium">Retention Policies</CardTitle>
            <Database className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-xl sm:text-2xl font-bold">{retentionPolicies.length}</div>
            <p className="text-xs text-muted-foreground">Active cleanup rules</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs sm:text-sm font-medium">Records Cleaned</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-xl sm:text-2xl font-bold">{totalRecordsDeleted.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">Total records deleted</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs sm:text-sm font-medium">GDPR Requests</CardTitle>
            <Shield className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-xl sm:text-2xl font-bold">{gdprRequests.length}</div>
            <p className="text-xs text-muted-foreground">
              {pendingGdprCount > 0 ? (
                <span className="text-amber-600">{pendingGdprCount} pending</span>
              ) : (
                'All completed'
              )}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs sm:text-sm font-medium">Last Backup</CardTitle>
            <Database className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-xl sm:text-2xl font-bold truncate">
              {latestBackup ? formatDistanceToNow(new Date(latestBackup.backup_date), { addSuffix: true }) : 'Never'}
            </div>
            <p className="text-xs text-muted-foreground">
              {latestBackup?.status === 'success' ? (
                <span className="text-emerald-600">Completed successfully</span>
              ) : (
                <span className="text-amber-600">No recent backups</span>
              )}
            </p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="policies" className="space-y-4">
        <div className="overflow-x-auto -mx-4 sm:mx-0 px-4 sm:px-0 pb-px">
          <TabsList className="inline-flex h-auto w-max gap-0 rounded-none border-b border-border bg-transparent p-0">
            <TabsTrigger value="policies" className="relative rounded-none border-b-2 border-transparent bg-transparent px-4 py-2.5 text-xs sm:text-sm font-medium text-muted-foreground shadow-none transition-none data-[state=active]:border-primary data-[state=active]:text-foreground data-[state=active]:shadow-none whitespace-nowrap">Policies</TabsTrigger>
            <TabsTrigger value="logs" className="relative rounded-none border-b-2 border-transparent bg-transparent px-4 py-2.5 text-xs sm:text-sm font-medium text-muted-foreground shadow-none transition-none data-[state=active]:border-primary data-[state=active]:text-foreground data-[state=active]:shadow-none whitespace-nowrap">Logs</TabsTrigger>
            <TabsTrigger value="gdpr" className="relative rounded-none border-b-2 border-transparent bg-transparent px-4 py-2.5 text-xs sm:text-sm font-medium text-muted-foreground shadow-none transition-none data-[state=active]:border-primary data-[state=active]:text-foreground data-[state=active]:shadow-none whitespace-nowrap">GDPR</TabsTrigger>
            <TabsTrigger value="backups" className="relative rounded-none border-b-2 border-transparent bg-transparent px-4 py-2.5 text-xs sm:text-sm font-medium text-muted-foreground shadow-none transition-none data-[state=active]:border-primary data-[state=active]:text-foreground data-[state=active]:shadow-none whitespace-nowrap">Backups</TabsTrigger>
            <TabsTrigger value="actions" className="relative rounded-none border-b-2 border-transparent bg-transparent px-4 py-2.5 text-xs sm:text-sm font-medium text-muted-foreground shadow-none transition-none data-[state=active]:border-primary data-[state=active]:text-foreground data-[state=active]:shadow-none whitespace-nowrap">Actions</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="policies">
          <Card>
            <CardHeader className="px-4 sm:px-6">
              <CardTitle className="text-base sm:text-lg">Retention Policies</CardTitle>
              <CardDescription className="text-xs sm:text-sm">
                Data cleanup rules configured across clients
              </CardDescription>
            </CardHeader>
            <CardContent className="px-0 sm:px-6">
              {retentionPolicies.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground px-4">
                  No retention policies configured
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <div className="border rounded-lg mx-4 sm:mx-0 min-w-[600px] sm:min-w-0">
                    <Table containerClassName={stickyHeaderTableClass}>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs sm:text-sm">Client</TableHead>
                          <TableHead className="text-xs sm:text-sm">Table</TableHead>
                          <TableHead className="text-xs sm:text-sm">Retention</TableHead>
                          <TableHead className="text-xs sm:text-sm">Auto Cleanup</TableHead>
                          <TableHead className="text-xs sm:text-sm">Last Cleanup</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {retentionPolicies.map((policy) => (
                          <TableRow key={policy.id}>
                            <TableCell className="font-medium text-xs sm:text-sm">{policy.client_name}</TableCell>
                            <TableCell className="text-xs sm:text-sm">{policy.table_name}</TableCell>
                            <TableCell className="text-xs sm:text-sm">{policy.retention_days}d</TableCell>
                            <TableCell>
                              {policy.auto_cleanup ? (
                                <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20 text-xs">
                                  <CheckCircle className="w-3 h-3 mr-1" />
                                  <span className="hidden sm:inline">Enabled</span>
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="text-xs">
                                  <span className="hidden sm:inline">Disabled</span>
                                  <span className="sm:hidden">Off</span>
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell className="text-xs sm:text-sm">
                              {policy.last_cleanup_at
                                ? formatDistanceToNow(new Date(policy.last_cleanup_at), {
                                    addSuffix: true,
                                  })
                                : 'Never'}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="logs">
          <Card>
            <CardHeader className="px-4 sm:px-6">
              <CardTitle className="text-base sm:text-lg">Cleanup Execution Log</CardTitle>
              <CardDescription className="text-xs sm:text-sm">
                History of automated data cleanup operations (last 50)
              </CardDescription>
            </CardHeader>
            <CardContent className="px-0 sm:px-6">
              {cleanupLogs.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground px-4">
                  No cleanup operations executed yet
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <div className="border rounded-lg mx-4 sm:mx-0 min-w-[700px] sm:min-w-0">
                    <Table containerClassName={stickyHeaderTableClass}>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs sm:text-sm">Executed</TableHead>
                          <TableHead className="text-xs sm:text-sm">Client</TableHead>
                          <TableHead className="text-xs sm:text-sm">Table</TableHead>
                          <TableHead className="text-xs sm:text-sm">Deleted</TableHead>
                          <TableHead className="text-xs sm:text-sm">Retention</TableHead>
                          <TableHead className="text-xs sm:text-sm">Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {cleanupLogs.map((log) => (
                          <TableRow key={log.id}>
                            <TableCell className="text-xs sm:text-sm">
                              {formatDistanceToNow(new Date(log.executed_at), {
                                addSuffix: true,
                              })}
                            </TableCell>
                            <TableCell className="font-medium text-xs sm:text-sm">{log.client_name}</TableCell>
                            <TableCell className="text-xs sm:text-sm">{log.table_name}</TableCell>
                            <TableCell className="text-xs sm:text-sm">{log.records_deleted.toLocaleString()}</TableCell>
                            <TableCell className="text-xs sm:text-sm">{log.retention_days}d</TableCell>
                            <TableCell>
                              {log.status === 'completed' ? (
                                <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20 text-xs">
                                  <CheckCircle className="w-3 h-3 mr-1" />
                                  <span className="hidden sm:inline">Success</span>
                                </Badge>
                              ) : (
                                <Badge variant="destructive" className="text-xs">
                                  <XCircle className="w-3 h-3 mr-1" />
                                  <span className="hidden sm:inline">Failed</span>
                                </Badge>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="gdpr">
          <Card>
            <CardHeader className="px-4 sm:px-6">
              <CardTitle className="text-base sm:text-lg">GDPR & Compliance Requests</CardTitle>
              <CardDescription className="text-xs sm:text-sm">
                Data deletion and export requests from customers
              </CardDescription>
            </CardHeader>
            <CardContent className="px-0 sm:px-6">
              {gdprRequests.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground px-4">
                  No GDPR requests submitted
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <div className="border rounded-lg mx-4 sm:mx-0 min-w-[700px] sm:min-w-0">
                    <Table containerClassName={stickyHeaderTableClass}>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs sm:text-sm">Requested</TableHead>
                          <TableHead className="text-xs sm:text-sm">Client</TableHead>
                          <TableHead className="text-xs sm:text-sm">Email</TableHead>
                          <TableHead className="text-xs sm:text-sm">Type</TableHead>
                          <TableHead className="text-xs sm:text-sm">Status</TableHead>
                          <TableHead className="text-right text-xs sm:text-sm">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {gdprRequests.map((request) => (
                          <TableRow key={request.id}>
                            <TableCell className="text-xs sm:text-sm">
                              {formatDistanceToNow(new Date(request.requested_at), {
                                addSuffix: true,
                              })}
                            </TableCell>
                            <TableCell className="font-medium text-xs sm:text-sm">{request.client_name}</TableCell>
                            <TableCell className="text-xs sm:text-sm max-w-[120px] truncate">{request.customer_email}</TableCell>
                            <TableCell className="capitalize text-xs sm:text-sm">
                              {request.request_type.replace(/_/g, ' ')}
                            </TableCell>
                            <TableCell>
                              {request.status === 'completed' ? (
                                <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20 text-xs">
                                  <CheckCircle className="w-3 h-3 mr-1" />
                                  <span className="hidden sm:inline">Completed</span>
                                </Badge>
                              ) : (
                                <Badge variant="secondary" className="bg-amber-500/10 text-amber-600 border-amber-500/20 text-xs">
                                  <Clock className="w-3 h-3 mr-1" />
                                  <span className="hidden sm:inline">Pending</span>
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell className="text-right">
                              {request.status === 'pending' && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleCompleteGdprRequest(request.id)}
                                  className="text-xs"
                                >
                                  <span className="hidden sm:inline">Mark Complete</span>
                                  <span className="sm:hidden">Complete</span>
                                </Button>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="backups">
          <Card>
            <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 px-4 sm:px-6">
              <div>
                <CardTitle className="text-base sm:text-lg">Database Backups</CardTitle>
                <CardDescription className="text-xs sm:text-sm">Automated and manual database backup history</CardDescription>
              </div>
              <Button onClick={handleRunBackup} disabled={processing} size="sm" className="w-full sm:w-auto">
                <Database className="w-4 h-4 mr-2 sm:hidden" />
                {processing ? 'Running...' : 'Run Manual Backup'}
              </Button>
            </CardHeader>
            <CardContent className="px-0 sm:px-6">
              {backupLogs.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground px-4">
                  No backups have been performed yet
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <div className="border rounded-lg mx-4 sm:mx-0 min-w-[600px] sm:min-w-0">
                    <Table containerClassName={stickyHeaderTableClass}>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs sm:text-sm">Date</TableHead>
                          <TableHead className="text-xs sm:text-sm">Type</TableHead>
                          <TableHead className="text-xs sm:text-sm">Tables</TableHead>
                          <TableHead className="text-xs sm:text-sm">Size</TableHead>
                          <TableHead className="text-xs sm:text-sm">Status</TableHead>
                          <TableHead className="text-right text-xs sm:text-sm">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {backupLogs.map((backup) => (
                          <TableRow key={backup.id}>
                            <TableCell className="text-xs sm:text-sm">
                              {formatDistanceToNow(new Date(backup.backup_date), { addSuffix: true })}
                            </TableCell>
                            <TableCell className="capitalize text-xs sm:text-sm">{backup.backup_type}</TableCell>
                            <TableCell className="text-xs sm:text-sm">
                              {backup.tables_backed_up?.length || 0} <span className="hidden sm:inline">tables</span>
                            </TableCell>
                            <TableCell className="text-xs sm:text-sm">
                              {backup.file_size_mb ? `${backup.file_size_mb.toFixed(2)} MB` : 'N/A'}
                            </TableCell>
                            <TableCell>
                              {backup.status === 'success' ? (
                                <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20 text-xs">
                                  <CheckCircle className="w-3 h-3 mr-1" />
                                  <span className="hidden sm:inline">Success</span>
                                </Badge>
                              ) : backup.status === 'in_progress' ? (
                                <Badge variant="secondary" className="text-xs">
                                  <span className="hidden sm:inline">In Progress</span>
                                  <span className="sm:hidden">...</span>
                                </Badge>
                              ) : (
                                <Badge variant="destructive" className="text-xs">
                                  <XCircle className="w-3 h-3 mr-1" />
                                  <span className="hidden sm:inline">Failed</span>
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell className="text-right">
                              {backup.status === 'success' && backup.file_path && (
                                <div className="flex items-center justify-end gap-1">
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => handleViewBackup(backup.file_path)}
                                    disabled={backupViewLoading}
                                    title="View backup data"
                                    className="h-7 w-7 p-0"
                                  >
                                    {backupViewLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Eye className="w-3.5 h-3.5" />}
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => handleDownloadBackup(backup.file_path)}
                                    disabled={downloadingBackup === backup.file_path}
                                    title="Download backup as JSON"
                                    className="h-7 w-7 p-0"
                                  >
                                    {downloadingBackup === backup.file_path ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                                  </Button>
                                </div>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="actions">
          <div className="grid gap-4 sm:gap-6 grid-cols-1 md:grid-cols-2">
            <Card>
              <CardHeader className="px-4 sm:px-6">
                <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                  <Trash2 className="w-4 h-4 sm:w-5 sm:h-5 text-destructive" />
                  Right to be Forgotten
                </CardTitle>
                <CardDescription className="text-xs sm:text-sm">
                  Permanently delete all customer data (GDPR compliant)
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 px-4 sm:px-6">
                <div className="space-y-2">
                  <Label htmlFor="delete-email" className="text-xs sm:text-sm">Customer Email</Label>
                  <Input
                    id="delete-email"
                    type="email"
                    placeholder="customer@example.com"
                    value={customerEmail}
                    onChange={(e) => setCustomerEmail(e.target.value)}
                    className="text-sm"
                  />
                </div>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="destructive"
                      className="w-full"
                      size="sm"
                      disabled={!customerEmail.trim() || processing}
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      Delete Customer Data
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent className="mx-4 sm:mx-0 max-w-[calc(100vw-2rem)] sm:max-w-lg">
                    <AlertDialogHeader>
                      <AlertDialogTitle className="flex items-center gap-2 text-base sm:text-lg">
                        <AlertCircle className="w-4 h-4 sm:w-5 sm:h-5 text-destructive" />
                        Confirm Data Deletion
                      </AlertDialogTitle>
                      <AlertDialogDescription className="text-xs sm:text-sm">
                        This will permanently delete all data for <strong>{customerEmail}</strong> including:
                        <ul className="list-disc pl-4 sm:pl-6 mt-2 space-y-1">
                          <li>Saved jewelry designs</li>
                          <li>Order history (anonymized)</li>
                          <li>AI chat conversations</li>
                          <li>Analytics data</li>
                        </ul>
                        <p className="mt-2 font-semibold">This action cannot be undone.</p>
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter className="flex-col sm:flex-row gap-2">
                      <AlertDialogCancel className="w-full sm:w-auto">Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={handleGdprDelete} className="w-full sm:w-auto bg-destructive text-destructive-foreground hover:bg-destructive/90">
                        Confirm Deletion
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="px-4 sm:px-6">
                <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                  <Download className="w-4 h-4 sm:w-5 sm:h-5 text-primary" />
                  Data Export
                </CardTitle>
                <CardDescription className="text-xs sm:text-sm">
                  Export all customer data for download (GDPR compliant)
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 px-4 sm:px-6">
                <div className="space-y-2">
                  <Label htmlFor="export-email" className="text-xs sm:text-sm">Customer Email</Label>
                  <Input
                    id="export-email"
                    type="email"
                    placeholder="customer@example.com"
                    value={customerEmail}
                    onChange={(e) => setCustomerEmail(e.target.value)}
                    className="text-sm"
                  />
                </div>
                <Button
                  onClick={handleGdprExport}
                  className="w-full"
                  size="sm"
                  disabled={!customerEmail.trim() || processing}
                >
                  <Download className="w-4 h-4 mr-2" />
                  {processing ? 'Exporting...' : 'Export Customer Data'}
                </Button>
                <p className="text-xs text-muted-foreground">
                  This will generate a JSON file containing all customer data including designs,
                  orders, and chat history.
                </p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* Backup Viewer Dialog */}
      <Dialog open={!!viewingBackup} onOpenChange={(open) => !open && setViewingBackup(null)}>
        <DialogContent className="max-w-4xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="w-5 h-5" />
              Backup Data Viewer
            </DialogTitle>
            <DialogDescription>
              {viewingBackup?.metadata && (
                <span>
                  Backup from {new Date(viewingBackup.metadata.timestamp).toLocaleString()} — {viewingBackup.metadata.totalRecords} total records across {viewingBackup.metadata.tables?.length || 0} tables
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="h-[60vh]">
            {viewingBackup?.data && (
              <div className="space-y-4 pr-4">
                {Object.entries(viewingBackup.data).map(([tableName, records]: [string, any]) => (
                  <div key={tableName} className="border rounded-lg p-3">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="font-semibold text-sm">{tableName}</h4>
                      <Badge variant="secondary" className="text-xs">
                        {Array.isArray(records) ? records.length : 0} records
                      </Badge>
                    </div>
                    {Array.isArray(records) && records.length > 0 ? (
                      <div className="overflow-x-auto">
                        <pre className="text-xs bg-muted p-2 rounded max-h-48 overflow-y-auto">
                          {JSON.stringify(records.slice(0, 5), null, 2)}
                          {records.length > 5 && `\n\n... and ${records.length - 5} more records`}
                        </pre>
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">No records</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
}
