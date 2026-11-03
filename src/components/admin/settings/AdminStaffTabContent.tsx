import { stickyHeaderTableClass } from "@/components/ui/table";
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useAdminActivityLogger } from '@/hooks/useAdminActivityLogger';
import { supabase } from '@/integrations/supabase/client';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Plus, MoreHorizontal, Trash2, Edit, Copy, Users, UserCheck, UserX, Shield, ShieldCheck, Crown, Eye, Building2, Check, ChevronsUpDown, X, Search, Briefcase, ExternalLink, ArrowUpCircle, ArrowDownCircle } from 'lucide-react';
import { useAdminAccess } from '@/hooks/useAdminAccess';

interface AdminStaffMember {
  id: string;
  user_id: string;
  name: string;
  email: string;
  phone: string | null;
  status: string;
  created_at: string;
  client_access?: string[];
  is_super_admin: boolean;
}

interface ClientStaffMember {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  status: string;
  permissions: any;
  created_at: string;
  client_id: string;
  company_name: string;
}

interface Client {
  id: string;
  company_name: string;
}

function generateRandomPassword(length: number = 12): string {
  const lower = 'abcdefghijklmnopqrstuvwxyz';
  const upper = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const digits = '0123456789';
  const special = '!@#$%&*';
  const all = lower + upper + digits + special;

  // Guarantee one from each class
  const password: string[] = [
    lower[Math.floor(Math.random() * lower.length)],
    upper[Math.floor(Math.random() * upper.length)],
    digits[Math.floor(Math.random() * digits.length)],
    special[Math.floor(Math.random() * special.length)],
  ];

  // Fill remaining with random chars
  for (let i = password.length; i < length; i++) {
    password.push(all[Math.floor(Math.random() * all.length)]);
  }

  // Shuffle
  for (let i = password.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [password[i], password[j]] = [password[j], password[i]];
  }

  return password.join('');
}

export function AdminStaffTabContent() {
  const { user } = useAuth();
  const { canWrite, readOnly, readOnlyMessage, isSuperAdmin: viewerIsSuperAdmin } = useAdminAccess();
  const navigate = useNavigate();
  const { logStaffUpdate, logStaffStatusChange, logStaffPermissionUpdate } = useAdminActivityLogger();
  const [staffMembers, setStaffMembers] = useState<AdminStaffMember[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [addingStaff, setAddingStaff] = useState(false);
  
  // Filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [clientAccessFilter, setClientAccessFilter] = useState('all');
  
  // State for one-time password display after creation
  const [createdStaffInfo, setCreatedStaffInfo] = useState<{ name: string; email: string; password: string } | null>(null);
  const [showPasswordDialog, setShowPasswordDialog] = useState(false);
  
  const [newStaff, setNewStaff] = useState({
    name: '',
    email: '',
    phone: '',
    password: generateRandomPassword(),
    selectedClients: [] as string[],
  });

  const [editingStaff, setEditingStaff] = useState<AdminStaffMember | null>(null);

  // Client staff states
  const [clientStaff, setClientStaff] = useState<ClientStaffMember[]>([]);
  const [clientStaffLoading, setClientStaffLoading] = useState(true);
  const [clientStaffSearch, setClientStaffSearch] = useState('');
  const [clientStaffCompanyFilter, setClientStaffCompanyFilter] = useState('all');
  const [clientStaffStatusFilter, setClientStaffStatusFilter] = useState('all');
  const [clientStaffPermFilter, setClientStaffPermFilter] = useState('all');
  const [activeTab, setActiveTab] = useState('admin');

  // Client staff edit dialog state
  const [csEditOpen, setCsEditOpen] = useState(false);
  const [csEditing, setCsEditing] = useState<ClientStaffMember | null>(null);
  const [csSaving, setCsSaving] = useState(false);

  const PERMISSION_KEYS: { key: string; label: string }[] = [
    { key: 'catalog_access', label: 'Ring OS (Catalog, Widget, JewlX Agent)' },
    { key: 'custom_x_access', label: 'Custom X (Ring Builder, Grillz, Custom Enquiry)' },
    { key: 'metal_buying_access', label: 'Metal IQ (Widget + Leads)' },
    { key: 'leads_access', label: 'Leads & Bookings' },
  ];

  const normalizePermLevel = (v: any): 'false' | 'view' | 'edit' => {
    if (v === true) return 'edit';
    if (v === undefined || v === null || v === false) return 'false';
    const s = String(v).toLowerCase().trim();
    if (s === 'edit' || s === 'true') return 'edit';
    if (s === 'view') return 'view';
    return 'false';
  };

  const openEditClientStaff = (s: ClientStaffMember) => {
    const normalized: Record<string, string> = {};
    for (const { key } of PERMISSION_KEYS) {
      normalized[key] = normalizePermLevel(s.permissions?.[key]);
    }
    setCsEditing({ ...s, permissions: normalized });
    setCsEditOpen(true);
  };

  const saveClientStaffEdit = async () => {
    if (!csEditing) return;
    setCsSaving(true);
    try {
      const updates = {
        name: csEditing.name,
        email: csEditing.email,
        phone: csEditing.phone,
        status: csEditing.status,
        permissions: csEditing.permissions,
      };
      const { data, error } = await supabase.functions.invoke('update-client-staff-member', {
        body: { staffMemberId: csEditing.id, clientId: csEditing.client_id, updates },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      await logStaffUpdate(csEditing.name, csEditing.id, {
        name: csEditing.name,
        email: csEditing.email,
        phone: csEditing.phone,
        status: csEditing.status,
      });
      await logStaffPermissionUpdate(
        csEditing.name,
        csEditing.id,
        Object.entries(csEditing.permissions || {})
          .filter(([, v]) => v && v !== 'false')
          .map(([k, v]) => `${k}:${v}`)
      );

      toast.success('Staff member updated');
      setCsEditOpen(false);
      setCsEditing(null);
      fetchClientStaff();
    } catch (err: any) {
      console.error('Error updating client staff:', err);
      toast.error(err.message || 'Failed to update staff member');
    } finally {
      setCsSaving(false);
    }
  };

  const toggleClientStaffStatus = async (s: ClientStaffMember) => {
    const newStatus = s.status === 'active' ? 'inactive' : 'active';
    try {
      const { data, error } = await supabase.functions.invoke('update-client-staff-member', {
        body: { staffMemberId: s.id, clientId: s.client_id, updates: { status: newStatus } },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      await logStaffStatusChange(s.name, s.id, newStatus);
      toast.success(`Staff member ${newStatus === 'active' ? 'activated' : 'deactivated'}`);
      fetchClientStaff();
    } catch (err: any) {
      console.error('Error toggling status:', err);
      toast.error(err.message || 'Failed to update status');
    }
  };

  const deleteClientStaff = async (s: ClientStaffMember) => {
    if (!confirm(`Permanently delete "${s.name || s.email}"? This cannot be undone.`)) return;
    try {
      const { data, error } = await supabase.functions.invoke('delete-staff-user', {
        body: { staffMemberId: s.id },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success('Staff member deleted');
      fetchClientStaff();
    } catch (err: any) {
      console.error('Error deleting client staff:', err);
      toast.error(err.message || 'Failed to delete staff member');
    }
  };

  useEffect(() => {
    if (user) {
      fetchAdminStaff();
      fetchClients();
      fetchClientStaff();
    }
  }, [user]);

  // Filter staff members
  // The three platform owners live in their own tab; this list is staff only.
  const superAdmins = staffMembers.filter((staff) => staff.is_super_admin);
  const regularStaff = staffMembers.filter((staff) => !staff.is_super_admin);

  const filteredStaffMembers = regularStaff.filter((staff) => {
    // Search filter
    const matchesSearch = searchQuery === '' || 
      staff.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      staff.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (staff.phone && staff.phone.toLowerCase().includes(searchQuery.toLowerCase()));
    
    // Status filter
    const matchesStatus = statusFilter === 'all' || staff.status === statusFilter;
    
    // Client access filter
    let matchesClientAccess = true;
    if (clientAccessFilter === 'all_clients') {
      matchesClientAccess = !staff.client_access || staff.client_access.length === 0;
    } else if (clientAccessFilter === 'specific_clients') {
      matchesClientAccess = staff.client_access && staff.client_access.length > 0;
    } else if (clientAccessFilter !== 'all') {
      matchesClientAccess = staff.client_access?.includes(clientAccessFilter) || false;
    }
    
    return matchesSearch && matchesStatus && matchesClientAccess;
  });

  const fetchClients = async () => {
    try {
      const { data, error } = await supabase
        .from('clients')
        .select('id, company_name')
        .order('company_name', { ascending: true });

      if (error) throw error;
      setClients(data || []);
    } catch (error) {
      console.error('Error fetching clients:', error);
    }
  };

  const fetchClientStaff = async () => {
    setClientStaffLoading(true);
    try {
      const { data, error } = await supabase
        .from('staff_members')
        .select('id, name, email, phone, status, permissions, created_at, client_id, clients(company_name)')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setClientStaff((data || []).map((s: any) => ({
        ...s,
        company_name: (s.clients as any)?.company_name || 'Unknown',
      })));
    } catch (error) {
      console.error('Error fetching client staff:', error);
    } finally {
      setClientStaffLoading(false);
    }
  };

  const getPermissionLevel = (permissions: any, key: string): string => {
    if (!permissions) return 'none';
    const val = permissions[key];
    if (!val || val === 'false' || val === false) return 'none';
    return val;
  };

  const filteredClientStaff = clientStaff.filter((staff) => {
    const matchesSearch = clientStaffSearch === '' ||
      staff.name.toLowerCase().includes(clientStaffSearch.toLowerCase()) ||
      staff.email.toLowerCase().includes(clientStaffSearch.toLowerCase());
    const matchesCompany = clientStaffCompanyFilter === 'all' || staff.client_id === clientStaffCompanyFilter;
    const matchesStatus = clientStaffStatusFilter === 'all' || staff.status === clientStaffStatusFilter;
    let matchesPerm = true;
    if (clientStaffPermFilter === 'catalog_edit') {
      matchesPerm = getPermissionLevel(staff.permissions, 'catalog_access') === 'edit';
    } else if (clientStaffPermFilter === 'catalog_view') {
      matchesPerm = getPermissionLevel(staff.permissions, 'catalog_access') === 'view';
    } else if (clientStaffPermFilter === 'custom_x_edit') {
      matchesPerm = getPermissionLevel(staff.permissions, 'custom_x_access') === 'edit';
    } else if (clientStaffPermFilter === 'metal_iq_edit') {
      matchesPerm = getPermissionLevel(staff.permissions, 'metal_buying_access') === 'edit';
    } else if (clientStaffPermFilter === 'metal_iq_view') {
      matchesPerm = getPermissionLevel(staff.permissions, 'metal_buying_access') === 'view';
    }
    return matchesSearch && matchesCompany && matchesStatus && matchesPerm;
  });

  const fetchAdminStaff = async () => {
    try {
      const { data: staffData, error: staffError } = await supabase
        .from('admin_staff_members' as any)
        .select('*')
        .order('created_at', { ascending: false });

      if (staffError) throw staffError;

      const { data: accessData, error: accessError } = await supabase
        .from('admin_staff_client_access')
        .select('admin_staff_id, client_id');

      if (accessError) throw accessError;

      const staffWithAccess = (staffData || []).map((staff: any) => ({
        ...staff,
        client_access: (accessData || [])
          .filter((access: any) => access.admin_staff_id === staff.id)
          .map((access: any) => access.client_id),
      }));

      setStaffMembers(staffWithAccess as AdminStaffMember[]);
    } catch (error) {
      console.error('Error fetching admin staff:', error);
      toast.error('Failed to load admin staff members');
    } finally {
      setLoading(false);
    }
  };

  const handleAddStaff = async () => {
    if (!newStaff.name || !newStaff.email) {
      toast.error('Please fill in all required fields');
      return;
    }

    setAddingStaff(true);
    try {
      const { data, error } = await supabase.functions.invoke('create-admin-staff-user', {
        body: {
          email: newStaff.email,
          password: newStaff.password,
          name: newStaff.name,
          phone: newStaff.phone || null,
          clientIds: newStaff.selectedClients,
        },
      });

      if (error) {
        let errorMessage = error.message;
        try {
          const errorBody = await (error as any).context?.json();
          errorMessage = errorBody?.error || errorMessage;
        } catch {}
        throw new Error(errorMessage);
      }
      if (data?.error) throw new Error(data.error);

      // Store the password for one-time display
      const temporaryPassword = data?.temporaryPassword || newStaff.password;
      setCreatedStaffInfo({
        name: newStaff.name,
        email: newStaff.email,
        password: temporaryPassword,
      });
      
      setDialogOpen(false);
      setShowPasswordDialog(true);
      
      setNewStaff({
        name: '',
        email: '',
        phone: '',
        password: generateRandomPassword(),
        selectedClients: [],
      });
      fetchAdminStaff();
    } catch (error: any) {
      console.error('Error adding admin staff:', error);
      toast.error(error.message || 'Failed to add admin staff member');
    } finally {
      setAddingStaff(false);
    }
  };

  const toggleClientSelection = (clientId: string, isNew: boolean = true) => {
    if (isNew) {
      setNewStaff(prev => ({
        ...prev,
        selectedClients: prev.selectedClients.includes(clientId)
          ? prev.selectedClients.filter(id => id !== clientId)
          : [...prev.selectedClients, clientId],
      }));
    } else if (editingStaff) {
      setEditingStaff(prev => prev ? {
        ...prev,
        client_access: (prev.client_access || []).includes(clientId)
          ? (prev.client_access || []).filter(id => id !== clientId)
          : [...(prev.client_access || []), clientId],
      } : null);
    }
  };

  const handleUpdateStaff = async () => {
    if (!editingStaff) return;

    try {
      const { error } = await supabase
        .from('admin_staff_members' as any)
        .update({
          name: editingStaff.name,
          email: editingStaff.email,
          phone: editingStaff.phone,
          status: editingStaff.status,
        })
        .eq('id', editingStaff.id);

      if (error) throw error;

      const { error: deleteError } = await supabase
        .from('admin_staff_client_access')
        .delete()
        .eq('admin_staff_id', editingStaff.id);

      if (deleteError) throw deleteError;

      if (editingStaff.client_access && editingStaff.client_access.length > 0) {
        const accessRecords = editingStaff.client_access.map(clientId => ({
          admin_staff_id: editingStaff.id,
          client_id: clientId,
        }));

        const { error: insertError } = await supabase
          .from('admin_staff_client_access')
          .insert(accessRecords);

        if (insertError) throw insertError;
      }

      toast.success('Admin staff member updated successfully');
      setEditDialogOpen(false);
      setEditingStaff(null);
      fetchAdminStaff();
    } catch (error: any) {
      console.error('Error updating staff:', error);
      toast.error(error.message || 'Failed to update staff member');
    }
  };

  const handleStatusChange = async (staffId: string, newStatus: string) => {
    try {
      const { error } = await supabase
        .from('admin_staff_members' as any)
        .update({ status: newStatus })
        .eq('id', staffId);

      if (error) throw error;

      toast.success(`Staff member ${newStatus === 'active' ? 'activated' : 'deactivated'} successfully`);
      fetchAdminStaff();
    } catch (error: any) {
      console.error('Error updating status:', error);
      toast.error(error.message || 'Failed to update status');
    }
  };

  const handleToggleSuperAdmin = async (staff: AdminStaffMember) => {
    const promoting = !staff.is_super_admin;
    const question = promoting
      ? `Give ${staff.name} full Super Admin rights? They will be able to create, edit and delete everything.`
      : `Remove Super Admin rights from ${staff.name}? They will become view-only.`;
    if (!confirm(question)) return;

    try {
      const { error } = await supabase
        .from('admin_staff_members' as any)
        .update({ is_super_admin: promoting })
        .eq('id', staff.id);

      if (error) throw error;

      await logStaffUpdate(staff.name, staff.id, {
        access_level: promoting ? 'super_admin' : 'view_only_staff',
      });

      toast.success(
        promoting
          ? `${staff.name} is now a Super Admin`
          : `${staff.name} is now view-only admin staff`,
      );
      fetchAdminStaff();
    } catch (error: any) {
      console.error('Error changing super admin flag:', error);
      toast.error(error.message || 'Failed to change access level');
    }
  };

  const handleDeleteStaff = async (id: string, userId: string, staffEmail?: string, staffName?: string) => {
    if (!confirm('Are you sure you want to delete this admin staff member?')) return;

    try {
      const { data, error } = await supabase.functions.invoke('delete-admin-staff-user', {
        body: { 
          staffMemberId: id, 
          userId: userId,
          staffEmail,
          staffName,
          deletedByUserId: user?.id,
          deletedByEmail: user?.email,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast.success('Admin staff member deleted successfully');
      fetchAdminStaff();
    } catch (error: any) {
      console.error('Error deleting staff:', error);
      toast.error(error.message || 'Failed to delete staff member');
    }
  };

  const copyPassword = (password: string) => {
    navigator.clipboard.writeText(password);
    toast.success('Password copied to clipboard');
  };

  const regeneratePassword = () => {
    setNewStaff(prev => ({ ...prev, password: generateRandomPassword() }));
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="super" className="gap-2">
            <Crown className="h-4 w-4" />
            Super Admins
          </TabsTrigger>
          <TabsTrigger value="admin" className="gap-2">
            <Shield className="h-4 w-4" />
            Admin Staff
          </TabsTrigger>
          <TabsTrigger value="client" className="gap-2">
            <Briefcase className="h-4 w-4" />
            Client Staff
          </TabsTrigger>
        </TabsList>

        <TabsContent value="super" className="space-y-6">
          <div>
            <h2 className="text-xl font-semibold flex items-center gap-2">
              <Crown className="h-5 w-5 text-violet-500" />
              Super Admins
            </h2>
            <p className="text-muted-foreground">
              Platform owners with full read and write access across every screen and client account.
            </p>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5" />
                Owner Accounts
              </CardTitle>
              <CardDescription>
                {superAdmins.length} super admin{superAdmins.length !== 1 ? 's' : ''}. Everyone
                listed under Admin Staff has view-only access and cannot create, edit or delete anything.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {superAdmins.length === 0 ? (
                <div className="text-center py-12">
                  <Crown className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-medium">No super admins found</h3>
                  <p className="text-muted-foreground">
                    Run the latest database migration to flag the owner accounts.
                  </p>
                </div>
              ) : (
                <Table containerClassName={stickyHeaderTableClass}>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Phone</TableHead>
                      <TableHead>Access</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Added</TableHead>
                      {viewerIsSuperAdmin && <TableHead className="w-[50px]"></TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {superAdmins.map((staff) => (
                      <TableRow key={staff.id}>
                        <TableCell className="font-medium">
                          <span className="flex items-center gap-2">
                            {staff.name}
                            {staff.user_id === user?.id && (
                              <Badge variant="outline" className="text-[10px]">You</Badge>
                            )}
                          </span>
                        </TableCell>
                        <TableCell>{staff.email}</TableCell>
                        <TableCell>{staff.phone || '-'}</TableCell>
                        <TableCell>
                          <Badge className="bg-violet-500 hover:bg-violet-600">
                            <Crown className="h-3 w-3 mr-1" />
                            Super Admin
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={staff.status === 'active' ? 'default' : 'destructive'}
                            className={staff.status === 'active' ? 'bg-emerald-500' : 'bg-red-500'}
                          >
                            {staff.status === 'active' ? 'Active' : 'Inactive'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {new Date(staff.created_at).toLocaleDateString()}
                        </TableCell>
                        {viewerIsSuperAdmin && (
                          <TableCell>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8">
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem
                                  onClick={() => handleToggleSuperAdmin(staff)}
                                  className="text-destructive"
                                >
                                  <ArrowDownCircle className="h-4 w-4 mr-2" />
                                  Demote to view-only staff
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="admin" className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Admin Staff</h2>
          <p className="text-muted-foreground">
            View-only admin team members. They can browse every screen but cannot create, edit or delete anything.
          </p>
        </div>
        
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          {canWrite && (
            <DialogTrigger asChild>
              <Button className="gap-2">
                <Plus className="h-4 w-4" />
                Add Admin Staff
              </Button>
            </DialogTrigger>
          )}
          <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Add New Admin Staff</DialogTitle>
              <DialogDescription>
                Add a new admin team member with full admin privileges.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="name">Name *</Label>
                <Input
                  id="name"
                  placeholder="John Doe"
                  value={newStaff.name}
                  onChange={(e) => setNewStaff(prev => ({ ...prev, name: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email *</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="john@example.com"
                  value={newStaff.email}
                  onChange={(e) => setNewStaff(prev => ({ ...prev, email: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Phone Number</Label>
                <Input
                  id="phone"
                  placeholder="+1 234 567 8900"
                  value={newStaff.phone}
                  onChange={(e) => setNewStaff(prev => ({ ...prev, phone: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Generated Password</Label>
                <div className="flex gap-2">
                  <Input
                    id="password"
                    value={newStaff.password}
                    readOnly
                    className="font-mono text-sm"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => copyPassword(newStaff.password)}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={regeneratePassword}
                  >
                    Regenerate
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Make sure to copy and share this password with the admin staff member.
                </p>
              </div>
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Building2 className="h-4 w-4" />
                  Client Access
                </Label>
                <p className="text-xs text-muted-foreground mb-2">
                  Select which clients this admin staff can access. If none selected, they can access all clients.
                </p>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      className="w-full justify-between h-auto min-h-10"
                    >
                      {newStaff.selectedClients.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {newStaff.selectedClients.map(clientId => {
                            const client = clients.find(c => c.id === clientId);
                            return client ? (
                              <Badge key={clientId} variant="secondary" className="text-xs mr-1">
                                {client.company_name}
                                <span
                                  className="ml-1 cursor-pointer hover:text-destructive"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    toggleClientSelection(clientId, true);
                                  }}
                                >
                                  <X className="h-3 w-3" />
                                </span>
                              </Badge>
                            ) : null;
                          })}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">Select clients...</span>
                      )}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-full p-0 bg-background" align="start">
                    <Command>
                      <CommandInput placeholder="Search clients..." />
                      <CommandList>
                        <CommandEmpty>No clients found.</CommandEmpty>
                        <CommandGroup>
                          {clients.map((client) => (
                            <CommandItem
                              key={client.id}
                              value={client.company_name}
                              onSelect={() => toggleClientSelection(client.id, true)}
                            >
                              <Check
                                className={`mr-2 h-4 w-4 ${
                                  newStaff.selectedClients.includes(client.id)
                                    ? "opacity-100"
                                    : "opacity-0"
                                }`}
                              />
                              {client.company_name}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
              <div className="flex items-center gap-2 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                <Shield className="h-5 w-5 text-amber-500" />
                <p className="text-sm text-amber-600 dark:text-amber-400">
                  This user gets <strong>view-only</strong> admin access to the selected clients.
                  Only a Super Admin can create, edit or delete.
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleAddStaff} disabled={addingStaff}>
                {addingStaff ? 'Adding...' : 'Add Admin Staff'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Admin Team Members
          </CardTitle>
          <CardDescription>
            {filteredStaffMembers.length} of {regularStaff.length} view-only admin staff member{regularStaff.length !== 1 ? 's' : ''} in your team
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Filters */}
          <div className="flex flex-col lg:flex-row gap-3">
            {/* Search Input */}
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name, email, or phone..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>

            {/* Filter Dropdowns */}
            <div className="flex flex-wrap gap-2">
              {/* Status Filter */}
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[130px] sm:w-[140px]">
                  <SelectValue placeholder="All Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>

              {/* Client Access Filter */}
              <Select value={clientAccessFilter} onValueChange={setClientAccessFilter}>
                <SelectTrigger className="w-[160px] sm:w-[180px]">
                  <SelectValue placeholder="All Access" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Access Levels</SelectItem>
                  <SelectItem value="all_clients">All Clients Access</SelectItem>
                  <SelectItem value="specific_clients">Specific Clients Only</SelectItem>
                  {clients.length > 0 && (
                    <>
                      <SelectItem value="---" disabled>───────────</SelectItem>
                      {clients.map((client) => (
                        <SelectItem key={client.id} value={client.id}>
                          {client.company_name}
                        </SelectItem>
                      ))}
                    </>
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>
          {regularStaff.length === 0 ? (
            <div className="text-center py-12">
              <Users className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium">No admin staff members yet</h3>
              <p className="text-muted-foreground mb-4">
                Add your first admin team member to get started.
              </p>
              {canWrite && (
                <Button onClick={() => setDialogOpen(true)} className="gap-2">
                  <Plus className="h-4 w-4" />
                  Add Admin Staff
                </Button>
              )}
            </div>
          ) : filteredStaffMembers.length === 0 ? (
            <div className="text-center py-12">
              <Search className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium">No matching staff members</h3>
              <p className="text-muted-foreground mb-4">
                Try adjusting your search or filter criteria.
              </p>
              <Button 
                variant="outline" 
                onClick={() => {
                  setSearchQuery('');
                  setStatusFilter('all');
                  setClientAccessFilter('all');
                }}
              >
                Clear Filters
              </Button>
            </div>
          ) : (
            <Table containerClassName={stickyHeaderTableClass}>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Client Access</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Added</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredStaffMembers.map((staff) => (
                  <TableRow key={staff.id}>
                    <TableCell className="font-medium">{staff.name}</TableCell>
                    <TableCell>{staff.email}</TableCell>
                    <TableCell>{staff.phone || '-'}</TableCell>
                    <TableCell>
                      {staff.client_access && staff.client_access.length > 0 ? (
                        <div className="flex flex-wrap gap-1 max-w-[200px]">
                          {staff.client_access.slice(0, 2).map(clientId => {
                            const client = clients.find(c => c.id === clientId);
                            return client ? (
                              <Badge key={clientId} variant="outline" className="text-xs">
                                {client.company_name}
                              </Badge>
                            ) : null;
                          })}
                          {staff.client_access.length > 2 && (
                            <Badge variant="outline" className="text-xs">
                              +{staff.client_access.length - 2} more
                            </Badge>
                          )}
                        </div>
                      ) : (
                        <Badge variant="secondary" className="text-xs">All Clients</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="gap-1">
                        <Eye className="h-3 w-3" />
                        Staff - View Only
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Select
                        value={staff.status}
                        onValueChange={(value) => handleStatusChange(staff.id, value)}
                        disabled={!canWrite}
                      >
                        <SelectTrigger className="w-[120px] h-8" title={readOnly ? readOnlyMessage : undefined}>
                          <SelectValue>
                            <Badge
                              variant={staff.status === 'active' ? 'default' : 'destructive'}
                              className={staff.status === 'active' ? 'bg-emerald-500' : 'bg-red-500'}
                            >
                              {staff.status === 'active' ? 'Active' : 'Inactive'}
                            </Badge>
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="active">
                            <div className="flex items-center gap-2">
                              <UserCheck className="h-4 w-4 text-emerald-500" />
                              <span>Active</span>
                            </div>
                          </SelectItem>
                          <SelectItem value="inactive">
                            <div className="flex items-center gap-2">
                              <UserX className="h-4 w-4 text-red-500" />
                              <span>Inactive</span>
                            </div>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {new Date(staff.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      {canWrite && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={() => {
                                setEditingStaff(staff);
                                setEditDialogOpen(true);
                              }}
                            >
                              <Edit className="h-4 w-4 mr-2" />
                              Edit
                            </DropdownMenuItem>
                            {viewerIsSuperAdmin && (
                              <DropdownMenuItem onClick={() => handleToggleSuperAdmin(staff)}>
                                <ArrowUpCircle className="h-4 w-4 mr-2" />
                                Promote to Super Admin
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem
                              onClick={() => handleDeleteStaff(staff.id, staff.user_id, staff.email, staff.name)}
                              className="text-destructive"
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Admin Staff</DialogTitle>
            <DialogDescription>
              Update admin staff member details.
            </DialogDescription>
          </DialogHeader>
          {editingStaff && (
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="edit-name">Name</Label>
                <Input
                  id="edit-name"
                  value={editingStaff.name}
                  onChange={(e) => setEditingStaff(prev => prev ? { ...prev, name: e.target.value } : null)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-email">Email</Label>
                <Input
                  id="edit-email"
                  type="email"
                  value={editingStaff.email}
                  onChange={(e) => setEditingStaff(prev => prev ? { ...prev, email: e.target.value } : null)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-phone">Phone</Label>
                <Input
                  id="edit-phone"
                  value={editingStaff.phone || ''}
                  onChange={(e) => setEditingStaff(prev => prev ? { ...prev, phone: e.target.value } : null)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-status">Status</Label>
                <Select
                  value={editingStaff.status}
                  onValueChange={(value) => setEditingStaff(prev => prev ? { ...prev, status: value } : null)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">
                      <div className="flex items-center gap-2">
                        <UserCheck className="h-4 w-4 text-emerald-500" />
                        <span>Active</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="inactive">
                      <div className="flex items-center gap-2">
                        <UserX className="h-4 w-4 text-red-500" />
                        <span>Inactive</span>
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Inactive staff members cannot log in.
                </p>
              </div>
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Building2 className="h-4 w-4" />
                  Client Access
                </Label>
                <p className="text-xs text-muted-foreground mb-2">
                  Select which clients this admin staff can access.
                </p>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      className="w-full justify-between h-auto min-h-10"
                    >
                      {(editingStaff.client_access || []).length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {(editingStaff.client_access || []).map(clientId => {
                            const client = clients.find(c => c.id === clientId);
                            return client ? (
                              <Badge key={clientId} variant="secondary" className="text-xs mr-1">
                                {client.company_name}
                                <span
                                  className="ml-1 cursor-pointer hover:text-destructive"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    toggleClientSelection(clientId, false);
                                  }}
                                >
                                  <X className="h-3 w-3" />
                                </span>
                              </Badge>
                            ) : null;
                          })}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">Select clients...</span>
                      )}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-full p-0 bg-background" align="start">
                    <Command>
                      <CommandInput placeholder="Search clients..." />
                      <CommandList>
                        <CommandEmpty>No clients found.</CommandEmpty>
                        <CommandGroup>
                          {clients.map((client) => (
                            <CommandItem
                              key={client.id}
                              value={client.company_name}
                              onSelect={() => toggleClientSelection(client.id, false)}
                            >
                              <Check
                                className={`mr-2 h-4 w-4 ${
                                  (editingStaff.client_access || []).includes(client.id)
                                    ? "opacity-100"
                                    : "opacity-0"
                                }`}
                              />
                              {client.company_name}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleUpdateStaff}>
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* One-Time Password Display Dialog */}
      <Dialog open={showPasswordDialog} onOpenChange={(open) => {
        setShowPasswordDialog(open);
        if (!open) {
          setCreatedStaffInfo(null);
          toast.success('Admin staff member added successfully');
        }
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-amber-500" />
              Admin Staff Member Created
            </DialogTitle>
            <DialogDescription>
              Save these credentials now - the password will not be shown again.
            </DialogDescription>
          </DialogHeader>
          {createdStaffInfo && (
            <div className="space-y-4 py-4">
              <div className="p-4 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg">
                <p className="text-sm text-amber-700 dark:text-amber-300 font-medium">
                  ⚠️ Copy this password now! For security, it is not stored and cannot be retrieved later.
                </p>
              </div>
              <div className="space-y-2">
                <Label>Name</Label>
                <Input value={createdStaffInfo.name} readOnly className="bg-muted" />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <div className="flex gap-2">
                  <Input value={createdStaffInfo.email} readOnly className="bg-muted" />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => {
                      navigator.clipboard.writeText(createdStaffInfo.email);
                      toast.success('Email copied');
                    }}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Temporary Password</Label>
                <div className="flex gap-2">
                  <Input value={createdStaffInfo.password} readOnly className="bg-muted font-mono" />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => {
                      navigator.clipboard.writeText(createdStaffInfo.password);
                      toast.success('Password copied');
                    }}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  The admin staff member can use this password to log in immediately.
                </p>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => {
              setShowPasswordDialog(false);
              setCreatedStaffInfo(null);
              toast.success('Admin staff member added successfully');
            }}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

        </TabsContent>

        <TabsContent value="client" className="space-y-6">
          <div>
            <h2 className="text-xl font-semibold">Client Staff</h2>
            <p className="text-muted-foreground">All staff members across client accounts</p>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Briefcase className="h-5 w-5" />
                Client Employees
              </CardTitle>
              <CardDescription>
                {filteredClientStaff.length} of {clientStaff.length} client staff member{clientStaff.length !== 1 ? 's' : ''}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Filters */}
              <div className="flex flex-col lg:flex-row gap-3">
                <div className="relative flex-1 max-w-md">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by name or email..."
                    value={clientStaffSearch}
                    onChange={(e) => setClientStaffSearch(e.target.value)}
                    className="pl-9"
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  <Select value={clientStaffCompanyFilter} onValueChange={setClientStaffCompanyFilter}>
                    <SelectTrigger className="w-[160px]">
                      <SelectValue placeholder="All Companies" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Companies</SelectItem>
                      {clients.map((client) => (
                        <SelectItem key={client.id} value={client.id}>{client.company_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={clientStaffStatusFilter} onValueChange={setClientStaffStatusFilter}>
                    <SelectTrigger className="w-[130px]">
                      <SelectValue placeholder="All Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Status</SelectItem>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="inactive">Inactive</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={clientStaffPermFilter} onValueChange={setClientStaffPermFilter}>
                    <SelectTrigger className="w-[180px]">
                      <SelectValue placeholder="All Permissions" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Permissions</SelectItem>
                      <SelectItem value="catalog_edit">Catalog: Edit</SelectItem>
                      <SelectItem value="catalog_view">Catalog: View</SelectItem>
                      <SelectItem value="custom_x_edit">Custom X: Edit</SelectItem>
                      <SelectItem value="metal_iq_edit">Metal IQ: Edit</SelectItem>
                      <SelectItem value="metal_iq_view">Metal IQ: View</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {clientStaffLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ) : filteredClientStaff.length === 0 ? (
                <div className="text-center py-12">
                  <Users className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-medium">No matching staff members</h3>
                  <p className="text-muted-foreground mb-4">Try adjusting your filters.</p>
                  <Button variant="outline" onClick={() => {
                    setClientStaffSearch('');
                    setClientStaffCompanyFilter('all');
                    setClientStaffStatusFilter('all');
                    setClientStaffPermFilter('all');
                  }}>Clear Filters</Button>
                </div>
              ) : (
                <Table containerClassName={stickyHeaderTableClass}>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Company</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Catalog</TableHead>
                      <TableHead>Custom X</TableHead>
                      <TableHead>Metal IQ</TableHead>
                      <TableHead>Added</TableHead>
                      <TableHead className="w-[60px] text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredClientStaff.map((staff) => (
                      <TableRow key={staff.id}>
                        <TableCell className="font-medium">{staff.name}</TableCell>
                        <TableCell>{staff.email}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">{staff.company_name}</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={staff.status === 'active' ? 'default' : 'destructive'}
                            className={staff.status === 'active' ? 'bg-emerald-500' : ''}
                          >
                            {staff.status === 'active' ? 'Active' : 'Inactive'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="text-xs">
                            {getPermissionLevel(staff.permissions, 'catalog_access') === 'none' ? '—' : getPermissionLevel(staff.permissions, 'catalog_access')}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="text-xs">
                            {getPermissionLevel(staff.permissions, 'custom_x_access') === 'none' ? '—' : getPermissionLevel(staff.permissions, 'custom_x_access')}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="text-xs">
                            {getPermissionLevel(staff.permissions, 'metal_buying_access') === 'none' ? '—' : getPermissionLevel(staff.permissions, 'metal_buying_access')}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {new Date(staff.created_at).toLocaleDateString()}
                        </TableCell>
                        <TableCell className="text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-56 bg-popover">
                              {canWrite && (
                                <DropdownMenuItem onClick={() => openEditClientStaff(staff)}>
                                  <Edit className="h-4 w-4 mr-2" />
                                  Edit Profile & Access
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem onClick={() => navigate(`/admin/clients/${staff.client_id}`)}>
                                <ExternalLink className="h-4 w-4 mr-2" />
                                View Client Account
                              </DropdownMenuItem>
                              {canWrite && (
                                <>
                                  <DropdownMenuItem onClick={() => toggleClientStaffStatus(staff)}>
                                    {staff.status === 'active' ? (
                                      <><UserX className="h-4 w-4 mr-2" />Deactivate</>
                                    ) : (
                                      <><UserCheck className="h-4 w-4 mr-2" />Activate</>
                                    )}
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onClick={() => deleteClientStaff(staff)}
                                    className="text-destructive focus:text-destructive"
                                  >
                                    <Trash2 className="h-4 w-4 mr-2" />
                                    Delete Permanently
                                  </DropdownMenuItem>
                                </>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {/* Edit Client Staff Dialog */}
          <Dialog open={csEditOpen} onOpenChange={setCsEditOpen}>
            <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Edit Client Staff Member</DialogTitle>
                <DialogDescription>
                  {csEditing?.company_name ? `Managing access for ${csEditing.company_name}` : 'Update profile and feature access.'}
                </DialogDescription>
              </DialogHeader>
              {csEditing && (
                <div className="space-y-4 py-2">
                  <div className="space-y-2">
                    <Label>Name</Label>
                    <Input
                      value={csEditing.name || ''}
                      onChange={(e) => setCsEditing({ ...csEditing, name: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Email</Label>
                    <Input
                      type="email"
                      value={csEditing.email || ''}
                      onChange={(e) => setCsEditing({ ...csEditing, email: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Phone</Label>
                    <Input
                      value={csEditing.phone || ''}
                      onChange={(e) => setCsEditing({ ...csEditing, phone: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Status</Label>
                    <Select
                      value={csEditing.status}
                      onValueChange={(v) => setCsEditing({ ...csEditing, status: v })}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="inactive">Inactive</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-3 pt-2 border-t">
                    <div>
                      <h4 className="text-sm font-semibold flex items-center gap-2">
                        <Shield className="h-4 w-4" />
                        Feature Access
                      </h4>
                      <p className="text-xs text-muted-foreground mt-1">
                        Set the access level for each subscription feature.
                      </p>
                    </div>
                    {PERMISSION_KEYS.map(({ key, label }) => (
                      <div key={key} className="space-y-1.5">
                        <Label className="text-sm">{label}</Label>
                        <Select
                          value={normalizePermLevel(csEditing.permissions?.[key])}
                          onValueChange={(v) =>
                            setCsEditing({
                              ...csEditing,
                              permissions: { ...(csEditing.permissions || {}), [key]: v },
                            })
                          }
                        >
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="false">Disabled</SelectItem>
                            <SelectItem value="view">View only</SelectItem>
                            <SelectItem value="edit">View & Edit</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <DialogFooter>
                <Button variant="outline" onClick={() => setCsEditOpen(false)} disabled={csSaving}>
                  Cancel
                </Button>
                <Button onClick={saveClientStaffEdit} disabled={csSaving}>
                  {csSaving ? 'Saving...' : 'Save Changes'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </TabsContent>
      </Tabs>
    </div>
  );
}
