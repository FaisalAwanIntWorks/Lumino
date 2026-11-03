import { stickyHeaderTableClass } from "@/components/ui/table";
import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  AlertTriangle, 
  RefreshCw, 
  CheckCircle, 
  XCircle, 
  Clock, 
  Filter, 
  Download,
  Search,
  AlertCircle,
  Zap,
  Database,
  Globe,
  Shield,
  Bug,
  Eye
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { usePageSearchRegistration } from '@/hooks/usePageSearchRegistration';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { format, formatDistanceToNow, subDays } from 'date-fns';

interface SystemError {
  id: string;
  timestamp: string;
  error_source: string;
  function_name: string;
  error_type: string;
  error_message: string;
  error_stack: string | null;
  severity: string;
  client_id: string | null;
  user_id: string | null;
  endpoint: string | null;
  request_metadata: Record<string, unknown> | null;
  resolved: boolean;
  resolved_by: string | null;
  resolved_at: string | null;
  resolution_notes: string | null;
}

const severityColors: Record<string, string> = {
  critical: 'bg-red-500 text-white',
  high: 'bg-orange-500 text-white',
  medium: 'bg-yellow-500 text-black',
  low: 'bg-blue-500 text-white',
};

const sourceIcons: Record<string, typeof AlertTriangle> = {
  edge_function: Zap,
  frontend: Globe,
  database: Database,
  external_api: Shield,
};

const typeIcons: Record<string, typeof AlertTriangle> = {
  network: Globe,
  auth: Shield,
  database: Database,
  validation: AlertCircle,
  timeout: Clock,
  permission: Shield,
  unknown: Bug,
};

export default function SystemErrors() {
  const { user, role } = useAuth();
  const navigate = useNavigate();
  
  const [errors, setErrors] = useState<SystemError[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  
  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [severityFilter, setSeverityFilter] = useState<string>('all');
  const [sourceFilter, setSourceFilter] = useState<string>('all');
  const [resolvedFilter, setResolvedFilter] = useState<string>('unresolved');
  const [timeRange, setTimeRange] = useState<string>('24h');
  
  // Resolution dialog
  const [selectedError, setSelectedError] = useState<SystemError | null>(null);
  const [resolutionNotes, setResolutionNotes] = useState('');
  const [resolving, setResolving] = useState(false);

  // Register page search items
  const searchItems = useMemo(() =>
    errors.slice(0, 50).map(e => ({
      id: e.id,
      label: e.function_name,
      description: e.error_message.slice(0, 80),
      icon: Bug,
      category: e.severity,
      action: () => { setSearchQuery(e.function_name); setSelectedError(e); },
    })),
    [errors]
  );
  usePageSearchRegistration('System Errors', searchItems);

  useEffect(() => {
    if (role !== 'agency_admin') {
      navigate('/admin/dashboard');
      return;
    }
    fetchErrors();
  }, [role, navigate]);

  const fetchErrors = async () => {
    setRefreshing(true);
    try {
      const timeFilter = getTimeFilter();
      
      let query = supabase
        .from('system_errors')
        .select('*')
        .gte('timestamp', timeFilter.toISOString())
        .order('timestamp', { ascending: false })
        .limit(500);

      if (resolvedFilter === 'resolved') {
        query = query.eq('resolved', true);
      } else if (resolvedFilter === 'unresolved') {
        query = query.eq('resolved', false);
      }

      if (severityFilter !== 'all') {
        query = query.eq('severity', severityFilter);
      }

      if (sourceFilter !== 'all') {
        query = query.eq('error_source', sourceFilter);
      }

      const { data, error } = await query;

      if (error) throw error;
      setErrors((data as SystemError[]) || []);
    } catch (error) {
      console.error('Failed to fetch errors:', error);
      toast.error('Failed to load system errors');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const getTimeFilter = () => {
    const now = new Date();
    switch (timeRange) {
      case '1h': return new Date(now.getTime() - 60 * 60 * 1000);
      case '24h': return subDays(now, 1);
      case '7d': return subDays(now, 7);
      case '30d': return subDays(now, 30);
      default: return subDays(now, 1);
    }
  };

  const filteredErrors = useMemo(() => {
    return errors.filter(error => {
      if (!searchQuery) return true;
      const searchLower = searchQuery.toLowerCase();
      return (
        error.function_name.toLowerCase().includes(searchLower) ||
        error.error_message.toLowerCase().includes(searchLower) ||
        error.error_type.toLowerCase().includes(searchLower) ||
        error.endpoint?.toLowerCase().includes(searchLower)
      );
    });
  }, [errors, searchQuery]);

  const stats = useMemo(() => {
    const critical = errors.filter(e => e.severity === 'critical' && !e.resolved).length;
    const high = errors.filter(e => e.severity === 'high' && !e.resolved).length;
    const total = errors.length;
    const resolved = errors.filter(e => e.resolved).length;
    return { critical, high, total, resolved };
  }, [errors]);

  const handleResolve = async () => {
    if (!selectedError) return;
    
    setResolving(true);
    try {
      const { error } = await supabase
        .from('system_errors')
        .update({
          resolved: true,
          resolved_by: user?.id,
          resolved_at: new Date().toISOString(),
          resolution_notes: resolutionNotes || null,
        })
        .eq('id', selectedError.id);

      if (error) throw error;

      toast.success('Error marked as resolved');
      setSelectedError(null);
      setResolutionNotes('');
      fetchErrors();
    } catch (error) {
      console.error('Failed to resolve error:', error);
      toast.error('Failed to resolve error');
    } finally {
      setResolving(false);
    }
  };

  const handleExport = () => {
    const csvContent = [
      ['Timestamp', 'Severity', 'Source', 'Function', 'Type', 'Message', 'Endpoint', 'Resolved'].join(','),
      ...filteredErrors.map(e => [
        format(new Date(e.timestamp), 'yyyy-MM-dd HH:mm:ss'),
        e.severity,
        e.error_source,
        e.function_name,
        e.error_type,
        `"${e.error_message.replace(/"/g, '""')}"`,
        e.endpoint || '',
        e.resolved ? 'Yes' : 'No',
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `system-errors-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  useEffect(() => {
    fetchErrors();
  }, [severityFilter, sourceFilter, resolvedFilter, timeRange]);

  if (loading) {
    return (
      <div className="space-y-4 sm:space-y-6 p-4 sm:p-6 lg:p-8">
        <Skeleton className="h-8 sm:h-10 w-36 sm:w-48" />
        <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-20 sm:h-24" />)}
        </div>
        <Skeleton className="h-64 sm:h-96" />
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6 p-4 sm:p-6 lg:p-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">System Errors</h1>
          <p className="text-sm sm:text-base text-muted-foreground">Monitor and resolve errors across the platform</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="sm:size-default" onClick={handleExport}>
            <Download className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">Export</span>
          </Button>
          <Button size="sm" className="sm:size-default" onClick={fetchErrors} disabled={refreshing}>
            <RefreshCw className={`h-4 w-4 sm:mr-2 ${refreshing ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Refresh</span>
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <Card className={stats.critical > 0 ? 'border-red-500 bg-red-500/10' : ''}>
          <CardHeader className="p-3 sm:p-4 pb-2">
            <CardDescription className="text-xs sm:text-sm">Critical Unresolved</CardDescription>
            <CardTitle className={`text-2xl sm:text-3xl ${stats.critical > 0 ? 'text-red-500' : ''}`}>
              {stats.critical}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card className={stats.high > 0 ? 'border-orange-500 bg-orange-500/10' : ''}>
          <CardHeader className="p-3 sm:p-4 pb-2">
            <CardDescription className="text-xs sm:text-sm">High Unresolved</CardDescription>
            <CardTitle className={`text-2xl sm:text-3xl ${stats.high > 0 ? 'text-orange-500' : ''}`}>
              {stats.high}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="p-3 sm:p-4 pb-2">
            <CardDescription className="text-xs sm:text-sm">Total Errors</CardDescription>
            <CardTitle className="text-2xl sm:text-3xl">{stats.total}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="p-3 sm:p-4 pb-2">
            <CardDescription className="text-xs sm:text-sm">Resolved</CardDescription>
            <CardTitle className="text-2xl sm:text-3xl text-green-500">{stats.resolved}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Critical Alert Banner */}
      {stats.critical > 0 && (
        <Card className="border-red-500 bg-red-500/10">
          <CardContent className="flex items-center gap-3 py-4">
            <AlertTriangle className="h-6 w-6 text-red-500" />
            <div>
              <p className="font-semibold text-red-500">
                {stats.critical} Critical Error{stats.critical > 1 ? 's' : ''} Require Immediate Attention
              </p>
              <p className="text-sm text-muted-foreground">
                These errors may be affecting client operations
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <Card>
        <CardContent className="p-3 sm:p-4 sm:pt-6">
          <div className="space-y-3 sm:space-y-0 sm:flex sm:flex-wrap sm:gap-4">
            <div className="w-full sm:flex-1 sm:min-w-[200px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search errors..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            
            <div className="grid grid-cols-2 sm:flex gap-2 sm:gap-4">
              <Select value={timeRange} onValueChange={setTimeRange}>
                <SelectTrigger className="w-full sm:w-[130px]">
                  <Clock className="h-4 w-4 mr-2" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1h">Last Hour</SelectItem>
                  <SelectItem value="24h">Last 24h</SelectItem>
                  <SelectItem value="7d">Last 7 Days</SelectItem>
                  <SelectItem value="30d">Last 30 Days</SelectItem>
                </SelectContent>
              </Select>

              <Select value={severityFilter} onValueChange={setSeverityFilter}>
                <SelectTrigger className="w-full sm:w-[140px]">
                  <Filter className="h-4 w-4 mr-2" />
                  <SelectValue placeholder="Severity" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Severities</SelectItem>
                  <SelectItem value="critical">Critical</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                </SelectContent>
              </Select>

              <Select value={sourceFilter} onValueChange={setSourceFilter}>
                <SelectTrigger className="w-full sm:w-[150px]">
                  <SelectValue placeholder="Source" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Sources</SelectItem>
                  <SelectItem value="edge_function">Edge Functions</SelectItem>
                  <SelectItem value="frontend">Frontend</SelectItem>
                  <SelectItem value="database">Database</SelectItem>
                  <SelectItem value="external_api">External API</SelectItem>
                </SelectContent>
              </Select>

              <Select value={resolvedFilter} onValueChange={setResolvedFilter}>
                <SelectTrigger className="w-full sm:w-[140px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="unresolved">Unresolved</SelectItem>
                  <SelectItem value="resolved">Resolved</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Error Table */}
      <div className="-mx-4 sm:mx-0">
        <Card className="rounded-none sm:rounded-lg border-x-0 sm:border-x">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table className="min-w-[700px]" containerClassName={stickyHeaderTableClass}>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[80px] sm:w-[100px]">Severity</TableHead>
                    <TableHead className="min-w-[120px]">Function</TableHead>
                    <TableHead className="min-w-[150px]">Error</TableHead>
                    <TableHead className="w-[100px] sm:w-[120px] hidden sm:table-cell">Source</TableHead>
                    <TableHead className="w-[100px] sm:w-[150px]">Time</TableHead>
                    <TableHead className="w-[80px] sm:w-[100px]">Status</TableHead>
                    <TableHead className="w-[60px] sm:w-[80px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredErrors.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8 text-muted-foreground text-sm">
                        {searchQuery ? 'No errors match your search' : 'No errors found'}
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredErrors.map((error) => {
                      const SourceIcon = sourceIcons[error.error_source] || Bug;
                      const TypeIcon = typeIcons[error.error_type] || Bug;
                      
                      return (
                        <TableRow key={error.id} className={error.resolved ? 'opacity-60' : ''}>
                          <TableCell className="p-2 sm:p-4">
                            <Badge className={`${severityColors[error.severity]} text-xs`}>
                              {error.severity}
                            </Badge>
                          </TableCell>
                          <TableCell className="p-2 sm:p-4">
                            <div className="flex items-center gap-2">
                              <TypeIcon className="h-3 w-3 sm:h-4 sm:w-4 text-muted-foreground shrink-0" />
                              <span className="font-mono text-xs sm:text-sm truncate max-w-[100px] sm:max-w-none">{error.function_name}</span>
                            </div>
                          </TableCell>
                          <TableCell className="p-2 sm:p-4">
                            <p className="text-xs sm:text-sm truncate max-w-[150px] sm:max-w-[300px]" title={error.error_message}>
                              {error.error_message}
                            </p>
                            {error.endpoint && (
                              <p className="text-xs text-muted-foreground truncate max-w-[150px] sm:max-w-[300px]">
                                {error.endpoint}
                              </p>
                            )}
                          </TableCell>
                          <TableCell className="p-2 sm:p-4 hidden sm:table-cell">
                            <div className="flex items-center gap-1">
                              <SourceIcon className="h-4 w-4" />
                              <span className="text-sm capitalize">{error.error_source.replace('_', ' ')}</span>
                            </div>
                          </TableCell>
                          <TableCell className="p-2 sm:p-4">
                            <span className="text-xs sm:text-sm" title={format(new Date(error.timestamp), 'PPpp')}>
                              {formatDistanceToNow(new Date(error.timestamp), { addSuffix: true })}
                            </span>
                          </TableCell>
                          <TableCell className="p-2 sm:p-4">
                            {error.resolved ? (
                              <Badge variant="outline" className="text-green-500 border-green-500 text-xs">
                                <CheckCircle className="h-3 w-3 mr-1" />
                                <span className="hidden sm:inline">Resolved</span>
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-red-500 border-red-500 text-xs">
                                <XCircle className="h-3 w-3 mr-1" />
                                <span className="hidden sm:inline">Open</span>
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="p-2 sm:p-4">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setSelectedError(error)}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Error Detail Dialog */}
      <Dialog open={!!selectedError} onOpenChange={() => setSelectedError(null)}>
        <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex flex-wrap items-center gap-2">
              <span>Error Details</span>
              {selectedError && (
                <Badge className={severityColors[selectedError.severity]}>
                  {selectedError.severity}
                </Badge>
              )}
            </DialogTitle>
            <DialogDescription className="text-xs sm:text-sm">
              {selectedError && format(new Date(selectedError.timestamp), 'PPpp')}
            </DialogDescription>
          </DialogHeader>
          
          {selectedError && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                <div>
                  <label className="text-xs sm:text-sm font-medium text-muted-foreground">Function</label>
                  <p className="font-mono text-sm break-all">{selectedError.function_name}</p>
                </div>
                <div>
                  <label className="text-xs sm:text-sm font-medium text-muted-foreground">Source</label>
                  <p className="text-sm capitalize">{selectedError.error_source.replace('_', ' ')}</p>
                </div>
                <div>
                  <label className="text-xs sm:text-sm font-medium text-muted-foreground">Type</label>
                  <p className="text-sm capitalize">{selectedError.error_type}</p>
                </div>
                <div>
                  <label className="text-xs sm:text-sm font-medium text-muted-foreground">Endpoint</label>
                  <p className="text-sm truncate">{selectedError.endpoint || 'N/A'}</p>
                </div>
              </div>

              <div>
                <label className="text-xs sm:text-sm font-medium text-muted-foreground">Error Message</label>
                <div className="bg-muted p-2 sm:p-3 rounded-lg mt-1">
                  <p className="text-xs sm:text-sm whitespace-pre-wrap break-words">{selectedError.error_message}</p>
                </div>
              </div>

              {selectedError.error_stack && (
                <div>
                  <label className="text-xs sm:text-sm font-medium text-muted-foreground">Stack Trace</label>
                  <div className="bg-muted p-2 sm:p-3 rounded-lg mt-1 max-h-32 sm:max-h-40 overflow-auto">
                    <pre className="text-xs whitespace-pre-wrap break-words">{selectedError.error_stack}</pre>
                  </div>
                </div>
              )}

              {selectedError.request_metadata && Object.keys(selectedError.request_metadata).length > 0 && (
                <div>
                  <label className="text-xs sm:text-sm font-medium text-muted-foreground">Request Metadata</label>
                  <div className="bg-muted p-2 sm:p-3 rounded-lg mt-1 overflow-x-auto">
                    <pre className="text-xs whitespace-pre-wrap break-words">
                      {JSON.stringify(selectedError.request_metadata, null, 2)}
                    </pre>
                  </div>
                </div>
              )}

              {selectedError.resolved && (
                <div className="border-t pt-4">
                  <label className="text-xs sm:text-sm font-medium text-muted-foreground">Resolution</label>
                  <p className="text-xs sm:text-sm text-green-600">
                    Resolved {formatDistanceToNow(new Date(selectedError.resolved_at!), { addSuffix: true })}
                  </p>
                  {selectedError.resolution_notes && (
                    <p className="text-xs sm:text-sm mt-2">{selectedError.resolution_notes}</p>
                  )}
                </div>
              )}

              {!selectedError.resolved && (
                <div className="border-t pt-4 space-y-3">
                  <label className="text-xs sm:text-sm font-medium">Resolution Notes</label>
                  <Textarea
                    placeholder="Describe how this error was resolved..."
                    value={resolutionNotes}
                    onChange={(e) => setResolutionNotes(e.target.value)}
                    rows={3}
                    className="text-sm"
                  />
                </div>
              )}
            </div>
          )}

          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => setSelectedError(null)} className="w-full sm:w-auto">
              Close
            </Button>
            {selectedError && !selectedError.resolved && (
              <Button onClick={handleResolve} disabled={resolving} className="w-full sm:w-auto">
                <CheckCircle className="h-4 w-4 mr-2" />
                Mark as Resolved
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
