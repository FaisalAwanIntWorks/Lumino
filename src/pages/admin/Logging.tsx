import { stickyHeaderTableClass } from "@/components/ui/table";
import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Activity, 
  Search, 
  RefreshCw, 
  Download,
  Clock,
  Shield,
  Users,
  Settings,
  LogIn,
  LogOut,
  AlertTriangle,
  User,
  Package,
  Factory,
  Pencil,
  Database,
  UserCheck
} from 'lucide-react';
import { format, subDays, subHours } from 'date-fns';

interface AdminActivityLog {
  id: string;
  admin_user_id: string;
  admin_email: string;
  admin_name: string | null;
  admin_type: string;
  action_type: string;
  action_category: string;
  description: string;
  metadata: Record<string, any> | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

interface FailedLoginAttempt {
  email: string;
  attempted_at: string;
  ip_address: string | null;
  user_agent: string | null;
  failure_reason: string | null;
}

const categoryIcons: Record<string, React.ReactNode> = {
  authentication: <LogIn className="h-4 w-4" />,
  client_management: <Users className="h-4 w-4" />,
  admin_staff: <UserCheck className="h-4 w-4" />,
  products: <Package className="h-4 w-4" />,
  orders: <Activity className="h-4 w-4" />,
  manufacturing: <Factory className="h-4 w-4" />,
  design_requests: <Pencil className="h-4 w-4" />,
  settings: <Settings className="h-4 w-4" />,
  security: <Shield className="h-4 w-4" />,
  data_governance: <Database className="h-4 w-4" />,
  impersonation: <User className="h-4 w-4" />,
};

const categoryColors: Record<string, string> = {
  authentication: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
  client_management: 'bg-purple-500/10 text-purple-500 border-purple-500/20',
  admin_staff: 'bg-indigo-500/10 text-indigo-500 border-indigo-500/20',
  products: 'bg-green-500/10 text-green-500 border-green-500/20',
  orders: 'bg-orange-500/10 text-orange-500 border-orange-500/20',
  manufacturing: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
  design_requests: 'bg-pink-500/10 text-pink-500 border-pink-500/20',
  settings: 'bg-slate-500/10 text-slate-500 border-slate-500/20',
  security: 'bg-red-500/10 text-red-500 border-red-500/20',
  data_governance: 'bg-cyan-500/10 text-cyan-500 border-cyan-500/20',
  impersonation: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
};

export default function AdminLogging() {
  const { user } = useAuth();
  const [activities, setActivities] = useState<AdminActivityLog[]>([]);
  const [failedLogins, setFailedLogins] = useState<FailedLoginAttempt[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [dateRange, setDateRange] = useState('7d');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [userFilter, setUserFilter] = useState('all');
  const [adminUsers, setAdminUsers] = useState<{ id: string; email: string; name: string }[]>([]);

  const getDateFrom = () => {
    switch (dateRange) {
      case '24h': return subHours(new Date(), 24).toISOString();
      case '7d': return subDays(new Date(), 7).toISOString();
      case '30d': return subDays(new Date(), 30).toISOString();
      case '90d': return subDays(new Date(), 90).toISOString();
      default: return subDays(new Date(), 7).toISOString();
    }
  };

  const fetchData = async () => {
    if (!user) return;
    setLoading(true);

    try {
      const dateFrom = getDateFrom();

      // Fetch activity logs
      let query = supabase
        .from('admin_activity_logs')
        .select('*')
        .gte('created_at', dateFrom)
        .order('created_at', { ascending: false });

      if (categoryFilter !== 'all') {
        query = query.eq('action_category', categoryFilter);
      }

      if (userFilter !== 'all') {
        query = query.eq('admin_user_id', userFilter);
      }

      const { data: logsData, error: logsError } = await query;

      if (logsError) {
        console.error('Error fetching admin activity logs:', logsError);
      } else {
        // Cast to handle Json type compatibility
        setActivities((logsData || []) as AdminActivityLog[]);
      }

      // Fetch admin users for filter
      const { data: adminStaff } = await supabase
        .from('admin_staff_members')
        .select('user_id, email, name');

      if (adminStaff) {
        setAdminUsers(adminStaff.map(s => ({ id: s.user_id, email: s.email, name: s.name })));
      }

      // Fetch failed logins via edge function
      const { data: failedRes, error: failedErr } = await supabase.functions.invoke(
        'get-admin-failed-logins',
        {
          body: {
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
      console.error('Error fetching data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [user, dateRange, categoryFilter, userFilter]);

  const filteredActivities = activities.filter(activity => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      activity.description.toLowerCase().includes(query) ||
      activity.admin_email.toLowerCase().includes(query) ||
      (activity.admin_name?.toLowerCase().includes(query)) ||
      activity.action_type.toLowerCase().includes(query)
    );
  });

  const stats = {
    total: activities.length,
    today: activities.filter(a => new Date(a.created_at) > subHours(new Date(), 24)).length,
    authEvents: activities.filter(a => a.action_category === 'authentication').length,
    clientActions: activities.filter(a => a.action_category === 'client_management').length,
    staffActions: activities.filter(a => a.action_category === 'admin_staff').length,
    failedLogins: failedLogins.length,
  };

  const exportToCSV = () => {
    const headers = ['Timestamp', 'Admin', 'Email', 'Category', 'Action', 'Description'];
    const rows = filteredActivities.map(a => [
      format(new Date(a.created_at), 'yyyy-MM-dd HH:mm:ss'),
      a.admin_name || 'N/A',
      a.admin_email,
      a.action_category,
      a.action_type,
      a.description,
    ]);

    const csvContent = [headers, ...rows].map(row => row.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `admin-activity-logs-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold">Admin Activity Logs</h1>
          <p className="text-muted-foreground">Track all admin activities, logins, and security events</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={exportToCSV}>
            <Download className="h-4 w-4 mr-2" />
            Export CSV
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Events</CardDescription>
            <CardTitle className="text-2xl">{stats.total}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Today</CardDescription>
            <CardTitle className="text-2xl">{stats.today}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Auth Events</CardDescription>
            <CardTitle className="text-2xl">{stats.authEvents}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Client Actions</CardDescription>
            <CardTitle className="text-2xl">{stats.clientActions}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Staff Actions</CardDescription>
            <CardTitle className="text-2xl">{stats.staffActions}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-destructive/50">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1">
              <AlertTriangle className="h-3 w-3 text-destructive" />
              Failed Logins
            </CardDescription>
            <CardTitle className="text-2xl text-destructive">{stats.failedLogins}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search activities..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={dateRange} onValueChange={setDateRange}>
              <SelectTrigger className="w-[150px]">
                <Clock className="h-4 w-4 mr-2" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="24h">Last 24 hours</SelectItem>
                <SelectItem value="7d">Last 7 days</SelectItem>
                <SelectItem value="30d">Last 30 days</SelectItem>
                <SelectItem value="90d">Last 90 days</SelectItem>
              </SelectContent>
            </Select>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="All Categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                <SelectItem value="authentication">Authentication</SelectItem>
                <SelectItem value="client_management">Client Management</SelectItem>
                <SelectItem value="admin_staff">Admin Staff</SelectItem>
                <SelectItem value="products">Products</SelectItem>
                <SelectItem value="orders">Orders</SelectItem>
                <SelectItem value="manufacturing">Manufacturing</SelectItem>
                <SelectItem value="design_requests">Design Requests</SelectItem>
                <SelectItem value="settings">Settings</SelectItem>
                <SelectItem value="security">Security</SelectItem>
                <SelectItem value="data_governance">Data Governance</SelectItem>
                <SelectItem value="impersonation">Impersonation</SelectItem>
              </SelectContent>
            </Select>
            <Select value={userFilter} onValueChange={setUserFilter}>
              <SelectTrigger className="w-[200px]">
                <User className="h-4 w-4 mr-2" />
                <SelectValue placeholder="All Users" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Users</SelectItem>
                {adminUsers.map(admin => (
                  <SelectItem key={admin.id} value={admin.id}>
                    {admin.name || admin.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs defaultValue="timeline" className="space-y-4">
        <TabsList>
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
          <TabsTrigger value="table">Table View</TabsTrigger>
          <TabsTrigger value="failed-logins">Failed Logins</TabsTrigger>
        </TabsList>

        {/* Timeline View */}
        <TabsContent value="timeline">
          <Card>
            <CardContent className="pt-6">
              <ScrollArea className="h-[600px] pr-4">
                {loading ? (
                  <div className="flex items-center justify-center h-32">
                    <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : filteredActivities.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <Activity className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No activity logs found</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {filteredActivities.map((activity) => (
                      <div
                        key={activity.id}
                        className="flex gap-4 p-4 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                      >
                        <div className={`p-2 rounded-full h-fit ${categoryColors[activity.action_category] || 'bg-muted'}`}>
                          {categoryIcons[activity.action_category] || <Activity className="h-4 w-4" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <p className="font-medium">{activity.description}</p>
                              <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
                                <User className="h-3 w-3" />
                                <span>{activity.admin_name || activity.admin_email}</span>
                                <span>•</span>
                                <Badge variant="outline" className="text-xs">
                                  {activity.action_category.replace('_', ' ')}
                                </Badge>
                              </div>
                            </div>
                            <span className="text-xs text-muted-foreground whitespace-nowrap">
                              {format(new Date(activity.created_at), 'MMM d, HH:mm')}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Table View */}
        <TabsContent value="table">
          <Card>
            <CardContent className="pt-6">
              <ScrollArea className="h-[600px]">
                <Table containerClassName={stickyHeaderTableClass}>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Timestamp</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Action</TableHead>
                      <TableHead>Description</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-12">
                          <RefreshCw className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                        </TableCell>
                      </TableRow>
                    ) : filteredActivities.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                          No activity logs found
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredActivities.map((activity) => (
                        <TableRow key={activity.id}>
                          <TableCell className="whitespace-nowrap">
                            {format(new Date(activity.created_at), 'MMM d, HH:mm:ss')}
                          </TableCell>
                          <TableCell className="font-medium">
                            {activity.admin_name || 'N/A'}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {activity.admin_email}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className={categoryColors[activity.action_category]}>
                              {activity.action_category.replace('_', ' ')}
                            </Badge>
                          </TableCell>
                          <TableCell>{activity.action_type.replace('_', ' ')}</TableCell>
                          <TableCell className="max-w-[300px] truncate">
                            {activity.description}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Failed Logins Tab */}
        <TabsContent value="failed-logins">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-destructive" />
                Failed Login Attempts
              </CardTitle>
              <CardDescription>
                Track failed login attempts for admin accounts
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[500px]">
                <Table containerClassName={stickyHeaderTableClass}>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Timestamp</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>IP Address</TableHead>
                      <TableHead>Reason</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center py-12">
                          <RefreshCw className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                        </TableCell>
                      </TableRow>
                    ) : failedLogins.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center py-12 text-muted-foreground">
                          <Shield className="h-12 w-12 mx-auto mb-4 opacity-50" />
                          No failed login attempts found
                        </TableCell>
                      </TableRow>
                    ) : (
                      failedLogins.map((attempt, idx) => (
                        <TableRow key={idx}>
                          <TableCell className="whitespace-nowrap">
                            {format(new Date(attempt.attempted_at), 'MMM d, HH:mm:ss')}
                          </TableCell>
                          <TableCell>{attempt.email}</TableCell>
                          <TableCell>{attempt.ip_address || 'N/A'}</TableCell>
                          <TableCell>
                            <Badge variant="destructive">
                              {attempt.failure_reason || 'Invalid credentials'}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
