import { stickyHeaderTableClass } from "@/components/ui/table";
import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useAdminImpersonation } from '@/contexts/AdminImpersonationContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatDistanceToNow, format } from 'date-fns';
import {
  Activity,
  AlertTriangle,
  Info,
  XCircle,
  Search,
  RefreshCw,
  Download,
  LogIn,
  LogOut,
  Package,
  UserPlus,
  UserMinus,
  Settings,
  Eye,
  Edit,
  Trash,
  ShoppingCart,
  FileText,
  Shield,
  Calendar,
  Filter,
  User,
} from 'lucide-react';

interface ActivityLog {
  id: string;
  client_id: string;
  user_id: string;
  user_email: string;
  user_name: string | null;
  user_type: 'owner' | 'staff';
  action_type: string;
  action_category: string;
  description: string;
  metadata: Record<string, unknown> | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

interface FailedLoginAttempt {
  id: string;
  email: string;
  attempted_at: string;
  ip_address: string | null;
  user_agent: string | null;
  failure_reason: string | null;
}

interface StaffMember {
  id: string;
  name: string;
  email: string;
  user_id: string;
}

// Action type to readable label mapping
const getActionLabel = (action: string): string => {
  const labels: Record<string, string> = {
    login: 'Login',
    logout: 'Logout',
    password_change: 'Password Changed',
    catalog_generate: 'Catalog Generated',
    catalog_reset: 'Catalog Reset',
    catalog_update: 'Catalog Updated',
    catalog_item_enable: 'Catalog Item Enabled',
    catalog_item_disable: 'Catalog Item Disabled',
    catalog_price_update: 'Catalog Price Updated',
    staff_create: 'Staff Member Added',
    staff_update: 'Staff Member Updated',
    staff_delete: 'Staff Member Deleted',
    staff_permission_update: 'Staff Permissions Updated',
    order_create: 'Order Created',
    order_update: 'Order Updated',
    order_status_change: 'Order Status Changed',
    design_save: 'Design Saved',
    design_delete: 'Design Deleted',
    design_request_create: 'Design Request Created',
    design_request_update: 'Design Request Updated',
    settings_update: 'Settings Updated',
    branding_update: 'Branding Updated',
    embed_update: 'Embed Configuration Updated',
    profile_update: 'Profile Updated',
    shopify_connect: 'Shopify Connected',
    shopify_disconnect: 'Shopify Disconnected',
    shopify_sync: 'Shopify Synced',
    shopify_push: 'Shopify Pushed',
    ai_config_update: 'AI Configuration Updated',
    ai_training_add: 'AI Training Added',
    ai_training_delete: 'AI Training Deleted',
    document_upload: 'Document Uploaded',
    document_delete: 'Document Deleted',
    view_page: 'Page Viewed',
    export_data: 'Data Exported',
  };
  return labels[action] || action.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
};

// Get icon for action type
const getActionIcon = (action: string) => {
  if (action.includes('login')) return LogIn;
  if (action.includes('logout')) return LogOut;
  if (action.includes('catalog')) return Package;
  if (action.includes('staff_create') || action.includes('user_add')) return UserPlus;
  if (action.includes('staff_delete') || action.includes('user_remove')) return UserMinus;
  if (action.includes('order')) return ShoppingCart;
  if (action.includes('design')) return FileText;
  if (action.includes('settings') || action.includes('config')) return Settings;
  if (action.includes('view') || action.includes('impersonate')) return Eye;
  if (action.includes('update') || action.includes('edit')) return Edit;
  if (action.includes('delete') || action.includes('remove')) return Trash;
  if (action.includes('security')) return Shield;
  return Activity;
};

// Get category badge
const getCategoryBadge = (category: string) => {
  const categoryConfig: Record<string, { label: string; className: string }> = {
    authentication: { label: 'Auth', className: 'bg-blue-500/10 text-blue-600 border-blue-500/20' },
    catalog: { label: 'Catalog', className: 'bg-purple-500/10 text-purple-600 border-purple-500/20' },
    staff_management: { label: 'Staff', className: 'bg-green-500/10 text-green-600 border-green-500/20' },
    settings: { label: 'Settings', className: 'bg-gray-500/10 text-gray-600 border-gray-500/20' },
    orders: { label: 'Orders', className: 'bg-amber-500/10 text-amber-600 border-amber-500/20' },
    design: { label: 'Design', className: 'bg-pink-500/10 text-pink-600 border-pink-500/20' },
    shopify: { label: 'Shopify', className: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' },
    ai_configuration: { label: 'AI', className: 'bg-violet-500/10 text-violet-600 border-violet-500/20' },
    documents: { label: 'Docs', className: 'bg-cyan-500/10 text-cyan-600 border-cyan-500/20' },
  };
  
  const config = categoryConfig[category] || { label: category, className: '' };
  return <Badge variant="secondary" className={config.className}>{config.label}</Badge>;
};

// Get user type badge
const getUserTypeBadge = (userType: 'owner' | 'staff') => {
  if (userType === 'owner') {
    return <Badge variant="default" className="bg-primary/10 text-primary border-primary/20">Owner</Badge>;
  }
  return <Badge variant="outline">Staff</Badge>;
};

export default function ClientLogging() {
  const { user, role, staffInfo } = useAuth();
  const { impersonatedClientId, isImpersonating } = useAdminImpersonation();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
  const [failedLogins, setFailedLogins] = useState<FailedLoginAttempt[]>([]);
  const [staffMembers, setStaffMembers] = useState<StaffMember[]>([]);
  const [clientId, setClientId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [userFilter, setUserFilter] = useState<string>('all');
  const [dateFilter, setDateFilter] = useState<string>('7days');

  // Get date range based on filter
  const getDateRange = () => {
    const now = new Date();
    switch (dateFilter) {
      case '24hours':
        return new Date(now.getTime() - 24 * 60 * 60 * 1000);
      case '7days':
        return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      case '30days':
        return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      case '90days':
        return new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      default:
        return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    }
  };

  // Load data
  const loadData = async () => {
    if (!user) return;

    try {
      // First get the client ID
      let currentClientId = clientId;

      if (!currentClientId) {
        // If impersonating, use the impersonated client ID directly
        if (isImpersonating && impersonatedClientId) {
          currentClientId = impersonatedClientId;
        } else if (role === 'client') {
          const { data: clientData, error: clientErr } = await supabase
            .from('clients')
            .select('id')
            .eq('user_id', user.id)
            .maybeSingle();
          // Not all authenticated users have a client row (e.g. agency admins)
          if (clientErr && clientErr.code !== 'PGRST116') throw clientErr;
          currentClientId = clientData?.id || null;
        } else if (role === 'staff' && staffInfo) {
          currentClientId = staffInfo.clientId;
        }
        setClientId(currentClientId);
      }

      if (!currentClientId) {
        setLoading(false);
        return;
      }

      const dateFrom = getDateRange().toISOString();

      // Get client info for emails
      const { data: clientData } = await supabase
        .from('clients')
        .select('user_id, email')
        .eq('id', currentClientId)
        .maybeSingle();

      // Get all staff members
      const { data: staffData } = await supabase
        .from('staff_members')
        .select('id, name, email, user_id')
        .eq('client_id', currentClientId);

      setStaffMembers(staffData || []);

      // Fetch activity logs
      try {
        if (isImpersonating) {
          const { data: res, error: fnErr } = await supabase.functions.invoke('get-client-activity-logs', {
            body: { clientId: currentClientId, dateFrom, limit: 500 },
          });
          if (fnErr) throw fnErr;
          setActivityLogs(((res as any)?.logs || []) as ActivityLog[]);
        } else {
          const session = await supabase.auth.getSession();
          const response = await fetch(
            `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/client_activity_logs?client_id=eq.${currentClientId}&created_at=gte.${dateFrom}&order=created_at.desc&limit=500`,
            {
              headers: {
                'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
                'Authorization': `Bearer ${session.data.session?.access_token}`,
              },
            }
          );
          if (response.ok) {
            const logsData = await response.json();
            setActivityLogs(logsData || []);
          } else {
            console.error('Error fetching activity logs');
            setActivityLogs([]);
          }
        }
      } catch (err) {
        console.error('Error fetching activity logs:', err);
        setActivityLogs([]);
      }

      // Load failed login attempts via backend function (table is RLS-protected)
      try {
        const { data: failedRes, error: failedErr } = await supabase.functions.invoke(
          'get-client-failed-logins',
          {
            body: {
              clientId: currentClientId,
              dateFrom,
              limit: 100,
            },
          }
        );

        if (failedErr) {
          console.error('Error fetching failed login attempts:', failedErr);
          setFailedLogins([]);
        } else {
          setFailedLogins((failedRes as any)?.attempts || []);
        }
      } catch (err) {
        console.error('Error fetching failed login attempts:', err);
        setFailedLogins([]);
      }

    } catch (error) {
      console.error('Error loading logging data:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    // In impersonation mode, wait until the impersonated clientId is available
    if (isImpersonating && !impersonatedClientId) return;
    loadData();
  }, [user, role, staffInfo, dateFilter, isImpersonating, impersonatedClientId]);

  const handleRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  // Filter logs
  const filteredLogs = useMemo(() => {
    return activityLogs.filter(log => {
      // Search filter
      if (searchTerm) {
        const searchLower = searchTerm.toLowerCase();
        const matchesSearch = 
          log.action_type.toLowerCase().includes(searchLower) ||
          log.user_email?.toLowerCase().includes(searchLower) ||
          log.user_name?.toLowerCase().includes(searchLower) ||
          log.description.toLowerCase().includes(searchLower) ||
          log.action_category.toLowerCase().includes(searchLower);
        if (!matchesSearch) return false;
      }

      // Category filter
      if (categoryFilter !== 'all' && log.action_category !== categoryFilter) {
        return false;
      }

      // User filter
      if (userFilter !== 'all' && log.user_id !== userFilter) {
        return false;
      }

      return true;
    });
  }, [activityLogs, searchTerm, categoryFilter, userFilter]);

  // Get unique categories for filter
  const categories = useMemo(() => {
    const cats = new Set(activityLogs.map(log => log.action_category));
    return Array.from(cats).sort();
  }, [activityLogs]);

  // Export logs as CSV
  const handleExport = () => {
    const headers = ['Timestamp', 'User', 'Type', 'Action', 'Category', 'Description', 'Details'];
    const rows = filteredLogs.map(log => [
      format(new Date(log.created_at), 'yyyy-MM-dd HH:mm:ss'),
      log.user_email || 'Unknown',
      log.user_type,
      getActionLabel(log.action_type),
      log.action_category,
      log.description,
      JSON.stringify(log.metadata || {}),
    ]);

    const csvContent = [headers.join(','), ...rows.map(row => row.map(cell => `"${cell}"`).join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `activity-logs-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Stats
  const stats = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const todayLogs = activityLogs.filter(log => new Date(log.created_at) >= today);
    const loginEvents = activityLogs.filter(log => log.action_category === 'authentication');
    const catalogEvents = activityLogs.filter(log => log.action_category === 'catalog');
    const staffEvents = activityLogs.filter(log => log.action_category === 'staff_management');
    const ownerActions = activityLogs.filter(log => log.user_type === 'owner');
    const staffActions = activityLogs.filter(log => log.user_type === 'staff');

    return {
      total: activityLogs.length,
      today: todayLogs.length,
      logins: loginEvents.length,
      catalogActions: catalogEvents.length,
      staffEvents: staffEvents.length,
      failedLogins: failedLogins.length,
      ownerActions: ownerActions.length,
      staffActions: staffActions.length,
    };
  }, [activityLogs, failedLogins]);

  if (loading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Activity Logging</h1>
          <p className="text-muted-foreground">Track all activities performed by you and your team</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing}>
            <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download className="w-4 h-4 mr-2" />
            Export CSV
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-primary" />
              <span className="text-sm text-muted-foreground">Total Events</span>
            </div>
            <p className="text-2xl font-bold mt-1">{stats.total}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-blue-500" />
              <span className="text-sm text-muted-foreground">Today</span>
            </div>
            <p className="text-2xl font-bold mt-1">{stats.today}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <LogIn className="w-4 h-4 text-green-500" />
              <span className="text-sm text-muted-foreground">Auth Events</span>
            </div>
            <p className="text-2xl font-bold mt-1">{stats.logins}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <Package className="w-4 h-4 text-purple-500" />
              <span className="text-sm text-muted-foreground">Catalog Actions</span>
            </div>
            <p className="text-2xl font-bold mt-1">{stats.catalogActions}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <User className="w-4 h-4 text-amber-500" />
              <span className="text-sm text-muted-foreground">Staff Actions</span>
            </div>
            <p className="text-2xl font-bold mt-1">{stats.staffActions}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <XCircle className="w-4 h-4 text-destructive" />
              <span className="text-sm text-muted-foreground">Failed Logins</span>
            </div>
            <p className="text-2xl font-bold mt-1">{stats.failedLogins}</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search activities..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={dateFilter} onValueChange={setDateFilter}>
              <SelectTrigger className="w-[160px]">
                <Calendar className="w-4 h-4 mr-2" />
                <SelectValue placeholder="Time range" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="24hours">Last 24 Hours</SelectItem>
                <SelectItem value="7days">Last 7 Days</SelectItem>
                <SelectItem value="30days">Last 30 Days</SelectItem>
                <SelectItem value="90days">Last 90 Days</SelectItem>
              </SelectContent>
            </Select>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-[180px]">
                <Filter className="w-4 h-4 mr-2" />
                <SelectValue placeholder="Filter by category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                <SelectItem value="authentication">Authentication</SelectItem>
                <SelectItem value="catalog">Catalog</SelectItem>
                <SelectItem value="staff_management">Staff Management</SelectItem>
                <SelectItem value="orders">Orders</SelectItem>
                <SelectItem value="design">Designs</SelectItem>
                <SelectItem value="settings">Settings</SelectItem>
                <SelectItem value="shopify">Shopify</SelectItem>
                <SelectItem value="ai_configuration">AI Config</SelectItem>
                <SelectItem value="documents">Documents</SelectItem>
              </SelectContent>
            </Select>
            {staffMembers.length > 0 && (
              <Select value={userFilter} onValueChange={setUserFilter}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Filter by user" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Users</SelectItem>
                  {staffMembers.map(staff => (
                    <SelectItem key={staff.id} value={staff.user_id}>
                      {staff.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </CardHeader>
      </Card>

      {/* Tabs for different views */}
      <Tabs defaultValue="timeline" className="space-y-4">
        <TabsList>
          <TabsTrigger value="timeline">Timeline View</TabsTrigger>
          <TabsTrigger value="table">Table View</TabsTrigger>
          <TabsTrigger value="failed-logins">Failed Logins</TabsTrigger>
        </TabsList>

        {/* Timeline View */}
        <TabsContent value="timeline">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="w-5 h-5" />
                Activity Timeline
              </CardTitle>
              <CardDescription>
                Showing {filteredLogs.length} activities
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[600px] pr-4">
                <div className="space-y-3">
                  {filteredLogs.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      No activity logs found for the selected filters
                    </div>
                  ) : (
                    filteredLogs.map((log) => {
                      const IconComponent = getActionIcon(log.action_type);
                      return (
                        <div
                          key={log.id}
                          className="flex items-start gap-3 p-4 border rounded-lg hover:bg-accent/50 transition-colors"
                        >
                          <div className="mt-0.5 p-2 rounded-full bg-muted">
                            <IconComponent className="w-4 h-4" />
                          </div>
                          <div className="flex-1 space-y-1">
                            <div className="flex items-center justify-between flex-wrap gap-2">
                              <span className="font-medium">
                                {getActionLabel(log.action_type)}
                              </span>
                              <div className="flex items-center gap-2">
                                {getCategoryBadge(log.action_category)}
                                {getUserTypeBadge(log.user_type)}
                              </div>
                            </div>
                            <p className="text-sm text-muted-foreground">{log.description}</p>
                            <div className="text-sm text-muted-foreground">
                              <span className="font-medium">{log.user_name || log.user_email}</span>
                              {log.user_name && log.user_email && (
                                <span className="text-xs"> ({log.user_email})</span>
                              )}
                            </div>
                            {log.metadata && Object.keys(log.metadata).length > 0 && (
                              <div className="text-xs text-muted-foreground bg-muted/50 rounded p-2 mt-2">
                                {Object.entries(log.metadata).slice(0, 5).map(([key, value]) => (
                                  <div key={key}>
                                    <span className="font-medium">{key}:</span>{' '}
                                    {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                                  </div>
                                ))}
                              </div>
                            )}
                            <div className="text-xs text-muted-foreground">
                              {formatDistanceToNow(new Date(log.created_at), { addSuffix: true })}
                              <span className="mx-1">•</span>
                              {format(new Date(log.created_at), 'MMM d, yyyy h:mm a')}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Table View */}
        <TabsContent value="table">
          <Card>
            <CardHeader>
              <CardTitle>Activity Log Table</CardTitle>
              <CardDescription>
                Detailed view of all activities
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border">
                <Table containerClassName={stickyHeaderTableClass}>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Timestamp</TableHead>
                      <TableHead>User</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Action</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Description</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredLogs.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                          No activity logs found
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredLogs.slice(0, 100).map((log) => (
                        <TableRow key={log.id}>
                          <TableCell className="whitespace-nowrap">
                            <div className="text-sm">
                              {format(new Date(log.created_at), 'MMM d, yyyy')}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {format(new Date(log.created_at), 'h:mm:ss a')}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="text-sm font-medium">{log.user_name || log.user_email}</div>
                            <div className="text-xs text-muted-foreground">{log.user_email}</div>
                          </TableCell>
                          <TableCell>
                            {getUserTypeBadge(log.user_type)}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {(() => {
                                const IconComponent = getActionIcon(log.action_type);
                                return <IconComponent className="w-4 h-4 text-muted-foreground" />;
                              })()}
                              <span>{getActionLabel(log.action_type)}</span>
                            </div>
                          </TableCell>
                          <TableCell>{getCategoryBadge(log.action_category)}</TableCell>
                          <TableCell className="max-w-[250px] truncate">
                            {log.description}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Failed Logins Tab */}
        <TabsContent value="failed-logins">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="w-5 h-5" />
                Failed Login Attempts
              </CardTitle>
              <CardDescription>
                Security-related login failures for your account and staff
              </CardDescription>
            </CardHeader>
            <CardContent>
              {failedLogins.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Shield className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>No failed login attempts found</p>
                  <p className="text-sm">This is a good sign! No suspicious activity detected.</p>
                </div>
              ) : (
                <div className="rounded-md border">
                  <Table containerClassName={stickyHeaderTableClass}>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Time</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Reason</TableHead>
                        <TableHead>IP Address</TableHead>
                        <TableHead>User Agent</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {failedLogins.map((attempt) => (
                        <TableRow key={attempt.id}>
                          <TableCell className="whitespace-nowrap">
                            <div className="text-sm">
                              {format(new Date(attempt.attempted_at), 'MMM d, yyyy')}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {format(new Date(attempt.attempted_at), 'h:mm:ss a')}
                            </div>
                          </TableCell>
                          <TableCell className="font-medium">{attempt.email}</TableCell>
                          <TableCell>
                            <Badge variant="destructive" className="text-xs">
                              {attempt.failure_reason || 'Unknown'}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {attempt.ip_address || 'N/A'}
                          </TableCell>
                          <TableCell className="max-w-[200px] truncate text-xs text-muted-foreground">
                            {attempt.user_agent || 'N/A'}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
