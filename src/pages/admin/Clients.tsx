import { useEffect, useState, useMemo } from 'react';
import { z } from 'zod';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import { Search, LogIn, Eye, Plus, X, Filter, Trash2, Copy, Users } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAdminImpersonation } from '@/contexts/AdminImpersonationContext';
import { toast } from 'sonner';
import { Skeleton } from '@/components/ui/skeleton';
import { usePageSearchRegistration } from '@/hooks/usePageSearchRegistration';
import { formatCurrency } from '@/lib/pricing-utils';
import { useAdminActivityLogger } from '@/hooks/useAdminActivityLogger';
import { ShopifyWebhookStatusDialog } from '@/components/admin/ShopifyWebhookStatusDialog';

interface Client {
  id: string;
  company_name: string;
  email: string;
  phone: string | null;
  status: string;
  created_at: string;
  plan_id: string;
  subscription_plans: { name: string } | null;
}

interface Plan {
  id: string;
  name: string;
}

const clientSchema = z.object({
  company_name: z.string().trim().min(1, 'Company name is required').max(100, 'Company name must be less than 100 characters'),
  email: z.string().trim().email('Invalid email address').max(255, 'Email must be less than 255 characters'),
  plan_id: z.string().min(1, 'Plan selection is required'),

  status: z.enum(['trial', 'active', 'paused', 'cancelled', 'CRM - Trial', 'CRM - Active', 'CRM - Active Billing', 'CRM - Paused', 'CRM - Cancelled']),
});

const initialClientState = {
  company_name: '',
  email: '',
  phone: '',
  password: '',
  plan_id: '',

  status: 'trial' as string,
  currency: 'USD',
  timezone: 'America/New_York',
  // Address fields
  address_line1: '',
  address_line2: '',
  city: '',
  state: '',
  postal_code: '',
  country: '',
  // Additional fields
  logo_url: '',
  shopify_store_url: '',
  allowed_domains: '',
};

export default function Clients() {
  const navigate = useNavigate();
  const { startImpersonation } = useAdminImpersonation();
  const { logClientCreate } = useAdminActivityLogger();
  const [clients, setClients] = useState<Client[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [planFilter, setPlanFilter] = useState<string>('all');
  const [orderStats, setOrderStats] = useState<Record<string, { count: number; revenue: number }>>({});
  const [dialogOpen, setDialogOpen] = useState(false);
  const [addingClient, setAddingClient] = useState(false);
  const [viewPasswordDialog, setViewPasswordDialog] = useState<{ open: boolean; client: Client | null }>({ open: false, client: null });

  const [purgeDialogOpen, setPurgeDialogOpen] = useState(false);
  const [purgeEmail, setPurgeEmail] = useState('');
  const [purgingEmail, setPurgingEmail] = useState(false);
  
  const [newClient, setNewClient] = useState(initialClientState);

  // Register page search items
  const searchItems = useMemo(() => 
    clients.map(c => ({
      id: c.id,
      label: c.company_name,
      description: c.email,
      icon: Users,
      category: c.status,
      action: () => navigate(`/admin/clients/${c.id}`),
    })),
    [clients, navigate]
  );
  usePageSearchRegistration('Clients', searchItems);

  useEffect(() => {
    fetchClients();
    fetchOrderStats();
    fetchPlans();
  }, []);

  const fetchClients = async () => {
    try {
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }

      // Check if current user is an admin staff member with restricted access
      const { data: adminStaff } = await supabase
        .from('admin_staff_members')
        .select('id')
        .eq('user_id', user.id)
        .single();

      let allowedClientIds: string[] | null = null;

      if (adminStaff) {
        // Get client access for this admin staff
        const { data: accessData } = await supabase
          .from('admin_staff_client_access')
          .select('client_id')
          .eq('admin_staff_id', adminStaff.id);

        // If there are specific client access records, filter by them
        // If no records exist, they have access to all clients
        if (accessData && accessData.length > 0) {
          allowedClientIds = accessData.map(a => a.client_id);
        }
      }
      // Select only non-sensitive columns - exclude encrypted tokens
      const ADMIN_SAFE_COLUMNS = `
        id, agency_id, user_id, company_name, email, phone, logo_url, status, plan_id,
        shopify_store_url, created_at, subscription_ends_at, branding_config,
        address_line1, address_line2, city, state, postal_code, country,
        allowed_domains, widget_theme,
        subscription_plans(name)
      `;

      // Fetch clients with optional filtering
      let query = supabase
        .from('clients')
        .select(ADMIN_SAFE_COLUMNS)
        .order('created_at', { ascending: false });

      if (allowedClientIds !== null) {
        query = query.in('id', allowedClientIds);
      }

      const { data, error } = await query;

      if (error) throw error;
      setClients(data || []);
    } catch (error) {
      console.error('Error fetching clients:', error);
      toast.error('Failed to load clients');
    } finally {
      setLoading(false);
    }
  };

  const fetchOrderStats = async () => {
    try {
      const { data, error } = await supabase
        .from('orders')
        .select('client_id, total_amount');

      if (error) throw error;

      const stats: Record<string, { count: number; revenue: number }> = {};
      data?.forEach((order) => {
        if (!stats[order.client_id]) {
          stats[order.client_id] = { count: 0, revenue: 0 };
        }
        stats[order.client_id].count++;
        stats[order.client_id].revenue += Number(order.total_amount);
      });

      setOrderStats(stats);
    } catch (error) {
      console.error('Error fetching order stats:', error);
    }
  };

  const fetchPlans = async () => {
    try {
      const { data, error } = await supabase
        .from('subscription_plans')
        .select('id, name')
        .eq('is_visible', true);

      if (error) throw error;
      setPlans(data || []);
    } catch (error) {
      console.error('Error fetching plans:', error);
    }
  };

  const generatePassword = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%';
    let password = '';
    for (let i = 0; i < 12; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setNewClient({ ...newClient, password });
  };

  const handleAddClient = async () => {
    try {
      setAddingClient(true);

      // Validate form data
      if (!newClient.company_name.trim()) {
        toast.error('Company name is required');
        return;
      }
      if (!newClient.email.trim()) {
        toast.error('Email is required');
        return;
      }
      if (!newClient.password.trim() || newClient.password.length < 8) {
        toast.error('Password must be at least 8 characters');
        return;
      }

      // Call edge function to create client
      const { data, error } = await supabase.functions.invoke('create-client-user', {
        body: {
          email: newClient.email.trim(),
          password: newClient.password,
          companyName: newClient.company_name.trim(),
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      // Update client with additional fields
      if (data?.userId) {
        const updateData: Record<string, any> = {
          status: newClient.status,
          currency: newClient.currency,
          timezone: newClient.timezone,
        };

        // Phone
        if (newClient.phone) updateData.phone = newClient.phone;

        // Address fields
        if (newClient.address_line1) updateData.address_line1 = newClient.address_line1;
        if (newClient.address_line2) updateData.address_line2 = newClient.address_line2;
        if (newClient.city) updateData.city = newClient.city;
        if (newClient.state) updateData.state = newClient.state;
        if (newClient.postal_code) updateData.postal_code = newClient.postal_code;
        if (newClient.country) updateData.country = newClient.country;

        // Additional fields
        if (newClient.logo_url) updateData.logo_url = newClient.logo_url;
        if (newClient.shopify_store_url) updateData.shopify_store_url = newClient.shopify_store_url;
        if (newClient.allowed_domains) {
          updateData.allowed_domains = newClient.allowed_domains.split(',').map(d => d.trim()).filter(Boolean);
        }

        await supabase
          .from('clients')
          .update(updateData)
          .eq('user_id', data.userId);
      }

      // Log the activity
      await logClientCreate(newClient.company_name.trim(), data?.clientId || 'unknown', {
        email: newClient.email.trim(),
        planId: newClient.plan_id || null,
        status: newClient.status,
      });

      // Notify all other admins about the new client
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user?.email) {
          await supabase.functions.invoke('notify-admins-new-client', {
            body: {
              new_client_company: newClient.company_name.trim(),
              new_client_email: newClient.email.trim(),
              created_by_admin_email: user.email,
              created_by_admin_name: user.user_metadata?.name || user.email,
            },
          });
        }
      } catch (notifyErr) {
        // Don't fail client creation if notification fails
        console.error('Failed to notify admins:', notifyErr);
      }

      toast.success('Client added successfully');
      setDialogOpen(false);
      setNewClient(initialClientState);
      fetchClients();
    } catch (error: any) {
      console.error('Error adding client:', error);
      toast.error(error.message || 'Failed to add client');
    } finally {
      setAddingClient(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard');
  };

  const handlePurgeEmail = async () => {
    const parsed = z.string().trim().email().safeParse(purgeEmail);
    if (!parsed.success) {
      toast.error('Please enter a valid email');
      return;
    }

    const emailToPurge = parsed.data.toLowerCase();

    try {
      setPurgingEmail(true);

      const { data, error } = await supabase.functions.invoke('delete-auth-user', {
        body: { email: emailToPurge },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast.success(`Purged account for ${emailToPurge}`);
      setPurgeEmail('');
      setPurgeDialogOpen(false);
      fetchClients();
    } catch (error: any) {
      console.error('Error purging account:', error);
      toast.error(error.message || 'Failed to purge account');
    } finally {
      setPurgingEmail(false);
    }
  };

  const handleImpersonate = (clientId: string, clientName: string) => {
    startImpersonation(clientId, clientName);
    toast.success(`Viewing as ${clientName}`);
    // Navigate to embedded client view within admin portal
    navigate('/admin/view-as/dashboard');
  };

  const filteredClients = clients.filter((client) => {
    const matchesSearch = 
      client.company_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      client.email.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesStatus = statusFilter === 'all' || client.status === statusFilter;
    const matchesPlan = planFilter === 'all' || client.plan_id === planFilter;
    
    return matchesSearch && matchesStatus && matchesPlan;
  });

  const clearFilters = () => {
    setSearchQuery('');
    setStatusFilter('all');
    setPlanFilter('all');
  };

  const hasActiveFilters = searchQuery || statusFilter !== 'all' || planFilter !== 'all';

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      active: 'bg-green-500/10 text-green-500 border-green-500/20',
      trial: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
      paused: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
      cancelled: 'bg-red-500/10 text-red-500 border-red-500/20',
      'CRM - Active': 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
      'CRM - Active Billing': 'bg-lime-500/10 text-lime-500 border-lime-500/20',
      'CRM - Trial': 'bg-cyan-500/10 text-cyan-500 border-cyan-500/20',
      'CRM - Paused': 'bg-orange-500/10 text-orange-500 border-orange-500/20',
      'CRM - Cancelled': 'bg-pink-500/10 text-pink-500 border-pink-500/20',
      inactive: 'bg-muted text-muted-foreground border-border',
    };
    return colors[status] || 'bg-muted text-muted-foreground';
  };

  if (loading) {
    return (
      <div className="p-4 sm:p-6 lg:p-8">
        <Skeleton className="h-10 w-48 sm:w-64 mb-6" />
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-32 sm:h-24" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 sm:mb-8">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold mb-1 sm:mb-2">Clients</h1>
          <p className="text-sm sm:text-base text-muted-foreground">Manage your client accounts</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <ShopifyWebhookStatusDialog />
          <Dialog open={purgeDialogOpen} onOpenChange={setPurgeDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">
                <Trash2 className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">Purge Email</span>
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Purge account by email</DialogTitle>
                <DialogDescription>
                  This permanently removes a login account (even if the client record was already deleted), so the email can be registered again.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-2">
                <Label htmlFor="purge_email">Email</Label>
                <Input
                  id="purge_email"
                  type="email"
                  value={purgeEmail}
                  onChange={(e) => setPurgeEmail(e.target.value)}
                  placeholder="client@example.com"
                  maxLength={255}
                />
                <p className="text-xs text-muted-foreground">
                  Use this only if signup says “account already exists” but the email is not in your clients list.
                </p>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setPurgeDialogOpen(false)} disabled={purgingEmail}>
                  Cancel
                </Button>
                <Button variant="destructive" onClick={handlePurgeEmail} disabled={purgingEmail}>
                  {purgingEmail ? 'Purging…' : 'Purge'}
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">Add Client</span>
              </Button>
            </DialogTrigger>
          <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-2xl max-h-[90vh]">
            <DialogHeader>
              <DialogTitle>Add New Client</DialogTitle>
              <DialogDescription>
                Create a new client account with login credentials and details.
              </DialogDescription>
            </DialogHeader>
            <ScrollArea className="max-h-[60vh] pr-4">
              <div className="space-y-6 py-4">
                {/* Basic Information Section */}
                <div className="space-y-4">
                  <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Account Information</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="col-span-2">
                      <Label htmlFor="company_name">Company Name *</Label>
                      <Input
                        id="company_name"
                        value={newClient.company_name}
                        onChange={(e) => setNewClient({ ...newClient, company_name: e.target.value })}
                        placeholder="Brilliant Jewelry Co."
                        maxLength={100}
                      />
                    </div>
                    <div className="col-span-2">
                      <Label htmlFor="email">Email Address *</Label>
                      <Input
                        id="email"
                        type="email"
                        value={newClient.email}
                        onChange={(e) => setNewClient({ ...newClient, email: e.target.value })}
                        placeholder="client@example.com"
                        maxLength={255}
                      />
                    </div>
                    <div className="col-span-2">
                      <Label htmlFor="phone">Phone Number</Label>
                      <Input
                        id="phone"
                        type="tel"
                        value={newClient.phone}
                        onChange={(e) => setNewClient({ ...newClient, phone: e.target.value })}
                        placeholder="+1 (555) 123-4567"
                        maxLength={20}
                      />
                    </div>
                    <div className="col-span-2">
                      <Label htmlFor="password">Password *</Label>
                      <div className="flex gap-2">
                        <Input
                          id="password"
                          type="text"
                          value={newClient.password}
                          onChange={(e) => setNewClient({ ...newClient, password: e.target.value })}
                          placeholder="Enter or generate password"
                          className="flex-1"
                        />
                        <Button type="button" variant="outline" onClick={generatePassword}>
                          Generate
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">Minimum 8 characters. Password will be stored for reference.</p>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="status">Initial Status</Label>
                      <Select value={newClient.status} onValueChange={(value: any) => setNewClient({ ...newClient, status: value })}>
                        <SelectTrigger id="status">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="trial">Trial</SelectItem>
                          <SelectItem value="active">Active</SelectItem>
                          <SelectItem value="paused">Paused</SelectItem>
                          <SelectItem value="cancelled">Cancelled</SelectItem>
                          <SelectItem value="CRM - Trial">CRM - Trial</SelectItem>
                          <SelectItem value="CRM - Active">CRM - Active</SelectItem>
                          <SelectItem value="CRM - Active Billing">CRM - Active Billing</SelectItem>
                          <SelectItem value="CRM - Paused">CRM - Paused</SelectItem>
                          <SelectItem value="CRM - Cancelled">CRM - Cancelled</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label htmlFor="currency">Currency</Label>
                      <Select value={newClient.currency} onValueChange={(value) => setNewClient({ ...newClient, currency: value })}>
                        <SelectTrigger id="currency">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="USD">USD ($)</SelectItem>
                          <SelectItem value="GBP">GBP (£)</SelectItem>
                          <SelectItem value="EUR">EUR (€)</SelectItem>
                          <SelectItem value="AUD">AUD (A$)</SelectItem>
                          <SelectItem value="CAD">CAD (C$)</SelectItem>
                          <SelectItem value="NZD">NZD (NZ$)</SelectItem>
                          <SelectItem value="ZAR">ZAR (R)</SelectItem>
                          <SelectItem value="INR">INR (₹)</SelectItem>
                          <SelectItem value="AED">AED (د.إ)</SelectItem>
                          <SelectItem value="CHF">CHF</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label htmlFor="timezone">Timezone</Label>
                      <Select value={newClient.timezone} onValueChange={(value) => setNewClient({ ...newClient, timezone: value })}>
                        <SelectTrigger id="timezone">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="America/New_York">Eastern (ET)</SelectItem>
                          <SelectItem value="America/Chicago">Central (CT)</SelectItem>
                          <SelectItem value="America/Denver">Mountain (MT)</SelectItem>
                          <SelectItem value="America/Los_Angeles">Pacific (PT)</SelectItem>
                          <SelectItem value="America/Anchorage">Alaska (AKT)</SelectItem>
                          <SelectItem value="Pacific/Honolulu">Hawaii (HT)</SelectItem>
                          <SelectItem value="Europe/London">London (GMT/BST)</SelectItem>
                          <SelectItem value="Europe/Paris">Paris (CET)</SelectItem>
                          <SelectItem value="Asia/Dubai">Dubai (GST)</SelectItem>
                          <SelectItem value="Asia/Kolkata">India (IST)</SelectItem>
                          <SelectItem value="Asia/Singapore">Singapore (SGT)</SelectItem>
                          <SelectItem value="Australia/Sydney">Sydney (AEST)</SelectItem>
                          <SelectItem value="Pacific/Auckland">Auckland (NZST)</SelectItem>
                          <SelectItem value="Africa/Johannesburg">Johannesburg (SAST)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>

                {/* Address Section */}
                <div className="space-y-4">
                  <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Address (Optional)</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="col-span-2">
                      <Label htmlFor="address_line1">Address Line 1</Label>
                      <Input
                        id="address_line1"
                        value={newClient.address_line1}
                        onChange={(e) => setNewClient({ ...newClient, address_line1: e.target.value })}
                        placeholder="123 Main Street"
                      />
                    </div>
                    <div className="col-span-2">
                      <Label htmlFor="address_line2">Address Line 2</Label>
                      <Input
                        id="address_line2"
                        value={newClient.address_line2}
                        onChange={(e) => setNewClient({ ...newClient, address_line2: e.target.value })}
                        placeholder="Suite 100"
                      />
                    </div>
                    <div>
                      <Label htmlFor="city">City</Label>
                      <Input
                        id="city"
                        value={newClient.city}
                        onChange={(e) => setNewClient({ ...newClient, city: e.target.value })}
                        placeholder="New York"
                      />
                    </div>
                    <div>
                      <Label htmlFor="state">State / Province</Label>
                      <Input
                        id="state"
                        value={newClient.state}
                        onChange={(e) => setNewClient({ ...newClient, state: e.target.value })}
                        placeholder="NY"
                      />
                    </div>
                    <div>
                      <Label htmlFor="postal_code">Postal Code</Label>
                      <Input
                        id="postal_code"
                        value={newClient.postal_code}
                        onChange={(e) => setNewClient({ ...newClient, postal_code: e.target.value })}
                        placeholder="10001"
                      />
                    </div>
                    <div>
                      <Label htmlFor="country">Country</Label>
                      <Input
                        id="country"
                        value={newClient.country}
                        onChange={(e) => setNewClient({ ...newClient, country: e.target.value })}
                        placeholder="United States"
                      />
                    </div>
                  </div>
                </div>

                {/* Integration Section */}
                <div className="space-y-4">
                  <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Integrations (Optional)</h3>
                  <div className="grid grid-cols-1 gap-4">
                    <div>
                      <Label htmlFor="logo_url">Logo URL</Label>
                      <Input
                        id="logo_url"
                        value={newClient.logo_url}
                        onChange={(e) => setNewClient({ ...newClient, logo_url: e.target.value })}
                        placeholder="https://example.com/logo.png"
                      />
                    </div>
                    <div>
                      <Label htmlFor="shopify_store_url">Shopify Store URL</Label>
                      <Input
                        id="shopify_store_url"
                        value={newClient.shopify_store_url}
                        onChange={(e) => setNewClient({ ...newClient, shopify_store_url: e.target.value })}
                        placeholder="mystore.myshopify.com"
                      />
                    </div>
                    <div>
                      <Label htmlFor="allowed_domains">Allowed Domains</Label>
                      <Textarea
                        id="allowed_domains"
                        value={newClient.allowed_domains}
                        onChange={(e) => setNewClient({ ...newClient, allowed_domains: e.target.value })}
                        placeholder="example.com, www.example.com (comma-separated)"
                        rows={2}
                      />
                      <p className="text-xs text-muted-foreground mt-1">Comma-separated list of domains where the embed widget can be used</p>
                    </div>
                  </div>
                </div>
              </div>
            </ScrollArea>
            <div className="flex gap-2 pt-4 border-t">
              <Button variant="outline" onClick={() => { setDialogOpen(false); setNewClient(initialClientState); }} className="flex-1">
                Cancel
              </Button>
              <Button onClick={handleAddClient} disabled={addingClient} className="flex-1">
                {addingClient ? 'Adding...' : 'Add Client'}
              </Button>
            </div>
          </DialogContent>
          </Dialog>
        </div>

        {/* View Credentials Dialog */}
        <Dialog open={viewPasswordDialog.open} onOpenChange={(open) => setViewPasswordDialog({ open, client: open ? viewPasswordDialog.client : null })}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Client Credentials</DialogTitle>
              <DialogDescription>
                Login credentials for {viewPasswordDialog.client?.company_name}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div>
                <Label className="text-muted-foreground">Email</Label>
                <div className="flex items-center gap-2 mt-1">
                  <Input value={viewPasswordDialog.client?.email || ''} readOnly className="bg-muted" />
                  <Button size="icon" variant="outline" onClick={() => copyToClipboard(viewPasswordDialog.client?.email || '')}>
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="p-3 bg-muted rounded-lg border">
                <p className="text-sm text-muted-foreground">
                  Passwords are no longer stored for security. Clients receive a welcome email with a password setup link when their account is created.
                </p>
              </div>
            </div>
            <Button onClick={() => setViewPasswordDialog({ open: false, client: null })} className="w-full">
              Close
            </Button>
          </DialogContent>
        </Dialog>
      </div>

      {/* Search and Filters */}
      <div className="mb-4 sm:mb-6 space-y-3 sm:space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
          <div className="flex-1 sm:max-w-md relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
            <Input
              placeholder="Search clients..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 pr-8"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          
          <div className="flex items-center gap-2 flex-wrap">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[110px] sm:w-[150px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="trial">Trial</SelectItem>
                <SelectItem value="paused">Paused</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
                <SelectItem value="CRM - Trial">CRM - Trial</SelectItem>
                <SelectItem value="CRM - Active">CRM - Active</SelectItem>
                <SelectItem value="CRM - Active Billing">CRM - Active Billing</SelectItem>
                <SelectItem value="CRM - Paused">CRM - Paused</SelectItem>
                <SelectItem value="CRM - Cancelled">CRM - Cancelled</SelectItem>
              </SelectContent>
            </Select>

            <Select value={planFilter} onValueChange={setPlanFilter}>
              <SelectTrigger className="w-[120px] sm:w-[180px]">
                <SelectValue placeholder="Plan" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Plans</SelectItem>
                {plans.map((plan) => (
                  <SelectItem key={plan.id} value={plan.id}>
                    {plan.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {hasActiveFilters && (
              <Button variant="outline" onClick={clearFilters} size="sm">
                <X className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">Clear</span>
              </Button>
            )}
          </div>
        </div>
        
        {hasActiveFilters && (
          <div className="flex items-center gap-2 text-xs sm:text-sm text-muted-foreground">
            <Filter className="h-4 w-4" />
            <span>
              Showing {filteredClients.length} of {clients.length} clients
            </span>
          </div>
        )}
      </div>

      <div className="grid gap-3 sm:gap-4">
        {filteredClients.map((client) => {
          const stats = orderStats[client.id] || { count: 0, revenue: 0 };
          return (
            <Card key={client.id} className="p-4 sm:p-6 hover:shadow-lg transition-shadow">
              <div className="flex flex-col sm:flex-row sm:items-center gap-4 sm:justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-start sm:items-center gap-2 sm:gap-3 mb-3 flex-wrap">
                    <h3 className="font-semibold text-base sm:text-lg truncate max-w-[200px] sm:max-w-none">{client.company_name}</h3>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge className={`${getStatusColor(client.status)} text-xs`}>
                        {client.status}
                      </Badge>
                      {client.subscription_plans && (
                        <Badge variant="outline" className="text-xs">{client.subscription_plans.name}</Badge>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 sm:gap-4 text-xs sm:text-sm">
                    <div>
                      <p className="text-muted-foreground">Email</p>
                      <p className="font-medium truncate">{client.email}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Phone</p>
                      <p className="font-medium truncate">{client.phone || '—'}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Orders</p>
                      <p className="font-medium">{stats.count}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Revenue</p>
                      <p className="font-medium">{formatCurrency(stats.revenue)}</p>
                    </div>
                    <div className="col-span-2 sm:col-span-1">
                      <p className="text-muted-foreground">Member Since</p>
                      <p className="font-medium">{new Date(client.created_at).toLocaleDateString()}</p>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-3 sm:pt-0 border-t sm:border-t-0 sm:ml-4 flex-wrap sm:flex-nowrap">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => navigate(`/admin/clients/${client.id}`)}
                  >
                    <Eye className="h-4 w-4 sm:mr-1" />
                    <span className="hidden sm:inline">View</span>
                  </Button>
                  <Button
                    variant="default"
                    size="sm"
                    onClick={() => handleImpersonate(client.id, client.company_name)}
                  >
                    <LogIn className="h-4 w-4 sm:mr-1" />
                    <span className="hidden sm:inline">Login As</span>
                  </Button>
                </div>
              </div>
            </Card>
          );
        })}
      </div>



      {filteredClients.length === 0 && (
        <Card className="p-8 sm:p-12 text-center">
          <h3 className="text-base sm:text-lg font-semibold mb-2">No clients found</h3>
          <p className="text-sm sm:text-base text-muted-foreground mb-4">
            {searchQuery ? 'Try adjusting your search query' : 'Get started by adding your first client'}
          </p>
          {!searchQuery && (
            <Button onClick={() => setDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Add Client
            </Button>
          )}
        </Card>
      )}
    </div>
  );
}
