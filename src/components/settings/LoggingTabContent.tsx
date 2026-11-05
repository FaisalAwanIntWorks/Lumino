import { stickyHeaderTableClass } from "@/components/ui/table";
import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useAdminImpersonation } from '@/contexts/AdminImpersonationContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
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

// Category configuration with proper display labels
const CATEGORY_CONFIG: Record<string, { label: string; badgeLabel: string; className: string }> = {
  authentication: { label: 'Authentication', badgeLabel: 'AUTH', className: 'bg-blue-500/10 text-blue-600 border-blue-500/20' },
  catalog: { label: 'Catalog', badgeLabel: 'CATALOG', className: 'bg-purple-500/10 text-purple-600 border-purple-500/20' },
  staff_management: { label: 'Staff Management', badgeLabel: 'STAFF', className: 'bg-green-500/10 text-green-600 border-green-500/20' },
  settings: { label: 'Settings', badgeLabel: 'SETTINGS', className: 'bg-gray-500/10 text-gray-600 border-gray-500/20' },
  orders: { label: 'Orders', badgeLabel: 'ORDERS', className: 'bg-amber-500/10 text-amber-600 border-amber-500/20' },
  design: { label: 'Design', badgeLabel: 'DESIGN', className: 'bg-pink-500/10 text-pink-600 border-pink-500/20' },
  shopify: { label: 'Shopify', badgeLabel: 'SHOPIFY', className: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' },
  ai_configuration: { label: 'Aurezo Agent', badgeLabel: 'AI', className: 'bg-violet-500/10 text-violet-600 border-violet-500/20' },
  documents: { label: 'Documents', badgeLabel: 'DOCS', className: 'bg-cyan-500/10 text-cyan-600 border-cyan-500/20' },
  general: { label: 'General', badgeLabel: 'GENERAL', className: 'bg-slate-500/10 text-slate-600 border-slate-500/20' },
};

const getCategoryLabel = (category: string): string => {
  return CATEGORY_CONFIG[category]?.label || category.replace(/_/g, ' ');
};

const getCategoryBadge = (category: string) => {
  const config = CATEGORY_CONFIG[category] || { badgeLabel: category.toUpperCase(), className: '' };
  return <Badge variant="secondary" className={config.className}>{config.badgeLabel}</Badge>;
};

const getUserTypeBadge = (userType: 'owner' | 'staff') => {
  if (userType === 'owner') {
    return <Badge variant="default" className="bg-primary/10 text-primary border-primary/20">Owner</Badge>;
  }
  return <Badge variant="outline">Staff</Badge>;
};

export function LoggingTabContent() {
  const { user, role, staffInfo } = useAuth();
  const { isImpersonating, impersonatedClientId } = useAdminImpersonation();
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

  const loadData = async () => {
    if (!user) return;

    try {
      let currentClientId = clientId;

      if (!currentClientId) {
        // Use impersonated client ID if admin is impersonating
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

      // In admin impersonation mode, use edge functions to bypass RLS
      if (isImpersonating) {
        // Fetch staff members via edge function
        try {
          const { data: staffRes, error: staffErr } = await supabase.functions.invoke('get-client-staff-members', {
            body: { clientId: currentClientId, limit: 500 },
          });
          if (!staffErr) {
            const staffData = (staffRes as any)?.staff || [];
            setStaffMembers(staffData.map((s: any) => ({
              id: s.id,
              name: s.name,
              email: s.email,
              user_id: s.user_id,
            })));
          }
        } catch (err) {
          console.error('Error fetching staff via edge function:', err);
        }

        // Fetch activity logs via edge function
        try {
          const { data: logsRes, error: logsErr } = await supabase.functions.invoke('get-client-activity-logs', {
            body: { clientId: currentClientId, dateFrom, limit: 500 },
          });
          if (!logsErr) {
            setActivityLogs((logsRes as any)?.logs || []);
          } else {
            setActivityLogs([]);
          }
        } catch (err) {
          console.error('Error fetching activity logs via edge function:', err);
          setActivityLogs([]);
        }

        // Fetch failed logins via edge function
        try {
          const { data: failedRes, error: failedErr } = await supabase.functions.invoke(
            'get-client-failed-logins',
            {
              body: { clientId: currentClientId, dateFrom, limit: 100 },
            }
          );
          if (!failedErr) {
            setFailedLogins((failedRes as any)?.attempts || []);
          } else {
            setFailedLogins([]);
          }
        } catch (err) {
          setFailedLogins([]);
        }

        setLoading(false);
        setRefreshing(false);
        return;
      }

      // Non-impersonation mode: use direct Supabase queries
      const { data: staffData } = await supabase
        .from('staff_members')
        .select('id, name, email, user_id')
        .eq('client_id', currentClientId);

      setStaffMembers(staffData || []);

      try {
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
          setActivityLogs([]);
        }
      } catch (err) {
        console.error('Error fetching activity logs:', err);
        setActivityLogs([]);
      }

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
          setFailedLogins([]);
        } else {
          setFailedLogins((failedRes as any)?.attempts || []);
        }
      } catch (err) {
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
    if (isImpersonating && !impersonatedClientId) return;
    loadData();
  }, [user, role, staffInfo, dateFilter, isImpersonating, impersonatedClientId]);

  const handleRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const filteredLogs = useMemo(() => {
    return activityLogs.filter(log => {
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

      if (categoryFilter !== 'all' && log.action_category !== categoryFilter) {
        return false;
      }

      if (userFilter !== 'all' && log.user_id !== userFilter) {
        return false;
      }

      return true;
    });
  }, [activityLogs, searchTerm, categoryFilter, userFilter]);

  const categories = useMemo(() => {
    const cats = new Set(activityLogs.map(log => log.action_category));
    return Array.from(cats).sort();
  }, [activityLogs]);

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

  const stats = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const todayLogs = activityLogs.filter(log => new Date(log.created_at) >= today);
    const loginEvents = activityLogs.filter(log => log.action_category === 'authentication');
    const catalogEvents = activityLogs.filter(log => log.action_category === 'catalog');
    const staffActions = activityLogs.filter(log => log.user_type === 'staff');

    return {
      total: activityLogs.length,
      today: todayLogs.length,
      logins: loginEvents.length,
      catalogActions: catalogEvents.length,
      staffActions: staffActions.length,
      failedLogins: failedLogins.length,
    };
  }, [activityLogs, failedLogins]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h3 className="text-lg font-semibold">Activity Logging</h3>
          <p className="text-sm text-muted-foreground">Track all activities performed by you and your team</p>
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
        <CardContent className="pt-4">
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
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {categories.map(cat => (
                  <SelectItem key={cat} value={cat}>{getCategoryLabel(cat)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={dateFilter} onValueChange={setDateFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Time period" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="24hours">Last 24 hours</SelectItem>
                <SelectItem value="7days">Last 7 days</SelectItem>
                <SelectItem value="30days">Last 30 days</SelectItem>
                <SelectItem value="90days">Last 90 days</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Activity Table */}
      <Card>
        <CardContent className="p-0">
          <ScrollArea className="h-[400px]">
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
                    <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                      No activity logs found
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredLogs.map(log => {
                    const Icon = getActionIcon(log.action_type);
                    return (
                      <TableRow key={log.id}>
                        <TableCell className="whitespace-nowrap text-sm">
                          {format(new Date(log.created_at), 'MMM d, HH:mm')}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {getUserTypeBadge(log.user_type)}
                            <span className="text-sm truncate max-w-[150px]">
                              {log.user_name || log.user_email}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Icon className="w-4 h-4 text-muted-foreground" />
                        </TableCell>
                        <TableCell className="font-medium text-sm">
                          {getActionLabel(log.action_type)}
                        </TableCell>
                        <TableCell>
                          {getCategoryBadge(log.action_category)}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground max-w-[300px] truncate">
                          {log.description}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Failed Logins Section */}
      {failedLogins.length > 0 && (
        <Card>
          <CardContent className="pt-4">
            <h4 className="font-semibold mb-4 flex items-center gap-2">
              <XCircle className="w-4 h-4 text-destructive" />
              Failed Login Attempts
            </h4>
            <Table containerClassName={stickyHeaderTableClass}>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>IP Address</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {failedLogins.slice(0, 10).map(attempt => (
                  <TableRow key={attempt.id}>
                    <TableCell className="text-sm">
                      {formatDistanceToNow(new Date(attempt.attempted_at), { addSuffix: true })}
                    </TableCell>
                    <TableCell className="text-sm">{attempt.email}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {attempt.failure_reason || 'Invalid credentials'}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {attempt.ip_address || 'Unknown'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
