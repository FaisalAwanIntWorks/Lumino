import { stickyHeaderTableClass } from "@/components/ui/table";
import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useAdminActivityLogger } from '@/hooks/useAdminActivityLogger';
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
import { Plus, MoreHorizontal, Trash2, Edit, Copy, Users, UserCheck, UserX, Shield, Building2, Check, ChevronsUpDown, X, ExternalLink, Search } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PasswordStrengthIndicator } from '@/components/auth/PasswordStrengthIndicator';
import { passwordSchema, validatePasswordContent, getValidationErrorMessage } from '@/lib/auth-validation';

interface AdminStaffMember {
  id: string;
  user_id: string;
  name: string;
  email: string;
  phone: string | null;
  password: string;
  status: string;
  created_at: string;
  client_access?: string[];
}

interface Client {
  id: string;
  company_name: string;
}

interface ClientStaffMember {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  status: string;
  permissions: Record<string, any>;
  created_at: string;
  client_id: string;
  client_name: string;
}

// Generate a secure random password that meets all requirements
function generateRandomPassword(length: number = 12): string {
  const lowercase = 'abcdefghijklmnopqrstuvwxyz';
  const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const numbers = '0123456789';
  const special = '!@#$%^&*';
  
  // Ensure at least one of each required type
  let password = '';
  password += uppercase.charAt(Math.floor(Math.random() * uppercase.length));
  password += lowercase.charAt(Math.floor(Math.random() * lowercase.length));
  password += numbers.charAt(Math.floor(Math.random() * numbers.length));
  password += special.charAt(Math.floor(Math.random() * special.length));
  
  // Fill the rest with random characters from all types
  const allChars = lowercase + uppercase + numbers + special;
  for (let i = password.length; i < length; i++) {
    password += allChars.charAt(Math.floor(Math.random() * allChars.length));
  }
  
  // Shuffle the password to avoid predictable patterns
  return password.split('').sort(() => Math.random() - 0.5).join('');
}

export default function AdminStaff() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { logStaffCreate, logStaffUpdate, logStaffStatusChange, logStaffPermissionUpdate } = useAdminActivityLogger();
  const [staffMembers, setStaffMembers] = useState<AdminStaffMember[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [addingStaff, setAddingStaff] = useState(false);
  const [activeTab, setActiveTab] = useState('client-staff');

  // Client staff state
  const [clientStaff, setClientStaff] = useState<ClientStaffMember[]>([]);
  const [clientStaffLoading, setClientStaffLoading] = useState(true);
  const [csSearch, setCsSearch] = useState('');
  const [csClientFilter, setCsClientFilter] = useState('all');
  const [csStatusFilter, setCsStatusFilter] = useState('all');
  const [csPermFilter, setCsPermFilter] = useState('all');
  
  const [newStaff, setNewStaff] = useState({
    name: '',
    email: '',
    phone: '',
    password: generateRandomPassword(),
    selectedClients: [] as string[],
  });

  const [editingStaff, setEditingStaff] = useState<AdminStaffMember | null>(null);

  // Client staff edit state
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
    const normalizedPerms: Record<string, string> = {};
    for (const { key } of PERMISSION_KEYS) {
      normalizedPerms[key] = normalizePermLevel(s.permissions?.[key]);
    }
    setCsEditing({ ...s, permissions: normalizedPerms });
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

  const fetchClientStaff = async () => {
    setClientStaffLoading(true);
    try {
      const { data, error } = await supabase
        .from('staff_members')
        .select('id, name, email, phone, status, permissions, created_at, client_id, clients(company_name)')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setClientStaff(
        (data || []).map((s: any) => ({
          ...s,
          client_name: s.clients?.company_name || 'Unknown',
        }))
      );
    } catch (error) {
      console.error('Error fetching client staff:', error);
    } finally {
      setClientStaffLoading(false);
    }
  };

  const filteredClientStaff = useMemo(() => {
    return clientStaff.filter(s => {
      if (csClientFilter !== 'all' && s.client_id !== csClientFilter) return false;
      if (csStatusFilter !== 'all' && s.status !== csStatusFilter) return false;
      if (csPermFilter !== 'all') {
        const perms = s.permissions || {};
        const val = perms[csPermFilter];
        if (!val || val === 'false' || val === false) return false;
      }
      if (csSearch) {
        const q = csSearch.toLowerCase();
        if (!s.name.toLowerCase().includes(q) && !s.email.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [clientStaff, csClientFilter, csStatusFilter, csPermFilter, csSearch]);

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

  const fetchAdminStaff = async () => {
    try {
      // Fetch staff members
      const { data: staffData, error: staffError } = await supabase
        .from('admin_staff_members' as any)
        .select('*')
        .order('created_at', { ascending: false });

      if (staffError) throw staffError;

      // Fetch client access for each staff member
      const { data: accessData, error: accessError } = await supabase
        .from('admin_staff_client_access')
        .select('admin_staff_id, client_id');

      if (accessError) throw accessError;

      // Map client access to staff members
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

    // Validate password with schema
    const passwordValidation = passwordSchema.safeParse(newStaff.password);
    if (!passwordValidation.success) {
      toast.error(getValidationErrorMessage(passwordValidation.error));
      return;
    }

    // Check for name/phone in password
    const contentError = validatePasswordContent(newStaff.password, newStaff.name, newStaff.phone);
    if (contentError) {
      toast.error(contentError);
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
          createdByUserId: user?.id,
          createdByEmail: user?.email,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      // Log the activity
      await logStaffCreate(newStaff.name, newStaff.email, data?.staffMemberId);

      toast.success('Admin staff member added successfully');
      setDialogOpen(false);
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
      // Update staff details
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

      // Update client access - delete existing and insert new
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

      // Log the activity
      await logStaffUpdate(editingStaff.name, editingStaff.id, {
        name: editingStaff.name,
        email: editingStaff.email,
        phone: editingStaff.phone,
        status: editingStaff.status,
      });
      
      if (editingStaff.client_access) {
        await logStaffPermissionUpdate(editingStaff.name, editingStaff.id, editingStaff.client_access);
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

  const handleStatusChange = async (staffId: string, staffName: string, newStatus: string) => {
    try {
      const { error } = await supabase
        .from('admin_staff_members' as any)
        .update({ status: newStatus })
        .eq('id', staffId);

      if (error) throw error;

      // Log the activity
      await logStaffStatusChange(staffName, staffId, newStatus);

      toast.success(`Staff member ${newStatus === 'active' ? 'activated' : 'deactivated'} successfully`);
      fetchAdminStaff();
    } catch (error: any) {
      console.error('Error updating status:', error);
      toast.error(error.message || 'Failed to update status');
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

  if (loading && clientStaffLoading) {
    return (
      <div className="p-8 space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Staff Management</h1>
        <p className="text-muted-foreground">Manage admin team and client staff members</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="client-staff">Client Staff ({clientStaff.length})</TabsTrigger>
          <TabsTrigger value="admin-staff">Admin Staff ({staffMembers.length})</TabsTrigger>
        </TabsList>

        {/* Client Staff Tab */}
        <TabsContent value="client-staff" className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name or email..."
                value={csSearch}
                onChange={(e) => setCsSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={csClientFilter} onValueChange={setCsClientFilter}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="All Clients" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Clients</SelectItem>
                {clients.map(c => (
                  <SelectItem key={c.id} value={c.id}>{c.company_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={csStatusFilter} onValueChange={setCsStatusFilter}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="All Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
            <Select value={csPermFilter} onValueChange={setCsPermFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="All Permissions" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Permissions</SelectItem>
                <SelectItem value="catalog_access">Catalog Access</SelectItem>
                <SelectItem value="custom_x_access">Custom X Access</SelectItem>
                <SelectItem value="metal_buying_access">Metal Buying Access</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Card>
            <CardContent className="p-0">
              {clientStaffLoading ? (
                <div className="p-8 text-center">
                  <Skeleton className="h-48 w-full" />
                </div>
              ) : filteredClientStaff.length === 0 ? (
                <div className="p-8 text-center">
                  <Users className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                  <p className="text-muted-foreground">No staff members found</p>
                </div>
              ) : (
                <Table containerClassName={stickyHeaderTableClass}>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Client</TableHead>
                      <TableHead>Permissions</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead className="w-[80px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredClientStaff.map((s) => (
                      <TableRow key={s.id}>
                        <TableCell className="font-medium">{s.name}</TableCell>
                        <TableCell className="text-sm">{s.email}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">{s.client_name}</Badge>
                        </TableCell>
                        <TableCell>
                          {s.permissions && Object.entries(s.permissions).filter(([, v]) => v && v !== 'false').length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {Object.entries(s.permissions)
                                .filter(([, v]) => v && v !== 'false')
                                .map(([k, v]) => (
                                  <Badge key={k} variant="secondary" className="text-xs">
                                    {k.replace('_access', '').replace('_', ' ')}: {String(v)}
                                  </Badge>
                                ))}
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">None</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant={s.status === 'active' ? 'default' : 'destructive'} className="text-xs">
                            {s.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {new Date(s.created_at).toLocaleDateString()}
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-56 bg-popover">
                              <DropdownMenuItem onClick={() => openEditClientStaff(s)}>
                                <Edit className="h-4 w-4 mr-2" />
                                Edit Profile & Access
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => navigate(`/admin/clients/${s.client_id}`)}>
                                <ExternalLink className="h-4 w-4 mr-2" />
                                View Client Account
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => toggleClientStaffStatus(s)}>
                                {s.status === 'active' ? (
                                  <><UserX className="h-4 w-4 mr-2" />Deactivate</>
                                ) : (
                                  <><UserCheck className="h-4 w-4 mr-2" />Activate</>
                                )}
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => deleteClientStaff(s)}
                                className="text-destructive focus:text-destructive"
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Delete Permanently
                              </DropdownMenuItem>
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
                  {csEditing?.client_name ? `Managing access for ${csEditing.client_name}` : 'Update profile and feature access.'}
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

        {/* Admin Staff Tab */}
        <TabsContent value="admin-staff" className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">Admin Team</h2>
          <p className="text-sm text-muted-foreground">Admin team members with full admin privileges</p>
        </div>
        
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="h-4 w-4" />
              Add Admin Staff
            </Button>
          </DialogTrigger>
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
                <PasswordStrengthIndicator 
                  password={newStaff.password} 
                  name={newStaff.name}
                  phone={newStaff.phone}
                />
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
                  This user will have admin privileges for selected clients.
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
            {staffMembers.length} admin staff member{staffMembers.length !== 1 ? 's' : ''} in your team
          </CardDescription>
        </CardHeader>
        <CardContent>
          {staffMembers.length === 0 ? (
            <div className="text-center py-12">
              <Users className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium">No admin staff members yet</h3>
              <p className="text-muted-foreground mb-4">
                Add your first admin team member to get started.
              </p>
              <Button onClick={() => setDialogOpen(true)} className="gap-2">
                <Plus className="h-4 w-4" />
                Add Admin Staff
              </Button>
            </div>
          ) : (
            <Table containerClassName={stickyHeaderTableClass}>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Password</TableHead>
                  <TableHead>Client Access</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Added</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {staffMembers.map((staff) => (
                  <TableRow key={staff.id}>
                    <TableCell className="font-medium">{staff.name}</TableCell>
                    <TableCell>{staff.email}</TableCell>
                    <TableCell>{staff.phone || '-'}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <code className="text-xs bg-muted px-2 py-1 rounded">
                          {staff.password.substring(0, 6)}...
                        </code>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => copyPassword(staff.password)}
                        >
                          <Copy className="h-3 w-3" />
                        </Button>
                      </div>
                    </TableCell>
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
                      <Badge className="bg-amber-500 hover:bg-amber-600">
                        <Shield className="h-3 w-3 mr-1" />
                        Admin
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Select
                        value={staff.status}
                        onValueChange={(value) => handleStatusChange(staff.id, staff.name, value)}
                      >
                        <SelectTrigger className="w-[120px] h-8">
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
                          <DropdownMenuItem
                            onClick={() => copyPassword(staff.password)}
                          >
                            <Copy className="h-4 w-4 mr-2" />
                            Copy Password
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => handleDeleteStaff(staff.id, staff.user_id, staff.email, staff.name)}
                            className="text-destructive"
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
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
        </TabsContent>
      </Tabs>
    </div>
  );
}
