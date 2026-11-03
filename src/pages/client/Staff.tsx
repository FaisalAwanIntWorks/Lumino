import { useState, useEffect } from 'react';
import { useClientTimezone, formatDateWithTimezone } from '@/hooks/useClientTimezone';
import { useAuth } from '@/contexts/AuthContext';
import { useAdminImpersonation } from '@/contexts/AdminImpersonationContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
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
import { Plus, MoreHorizontal, Trash2, Edit, Copy, Users, Package, UserCheck, UserX, Eye, Pencil, EyeOff, FileText, Coins } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { PasswordStrengthIndicator } from '@/components/auth/PasswordStrengthIndicator';
import { StaffLeadToggles } from '@/components/settings/StaffLeadToggles';
import { staffCanSeeLeads } from '@/lib/staff-permissions';
import { passwordSchema, validatePasswordContent, getValidationErrorMessage } from '@/lib/auth-validation';

type CatalogAccessLevel = 'false' | 'view' | 'edit';

interface StaffPermissions {
  catalog_access: string | boolean; // string for new system, boolean for legacy
  [key: string]: string | boolean;
}

// Helper to normalize catalog_access value
function normalizeCatalogAccess(value: string | boolean | undefined): CatalogAccessLevel {
  if (value === undefined || value === false || value === 'false') return 'false';
  if (value === true || value === 'true') return 'view'; // Legacy: true means view
  if (value === 'view' || value === 'edit') return value;
  return 'false';
}

// Helper to get display label for catalog access
function getCatalogAccessLabel(value: string | boolean | undefined): string {
  const normalized = normalizeCatalogAccess(value);
  switch (normalized) {
    case 'edit': return 'View & Edit';
    case 'view': return 'View Only';
    default: return 'Disabled';
  }
}

interface StaffMember {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  status: string;
  permissions: StaffPermissions;
  created_at: string;
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

export default function Staff() {
  const { user, role, staffInfo } = useAuth();
  const { impersonatedClientId, isImpersonating } = useAdminImpersonation();
  const clientTimezone = useClientTimezone();
  const [staffMembers, setStaffMembers] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [addingStaff, setAddingStaff] = useState(false);
  const [clientId, setClientId] = useState<string | null>(null);
  
  // State for one-time password display after creation
  const [createdStaffInfo, setCreatedStaffInfo] = useState<{ name: string; email: string; password: string } | null>(null);
  const [showPasswordDialog, setShowPasswordDialog] = useState(false);
  
  // Check if current user has edit access (client owner always has it, staff needs 'edit' catalog access)
  const hasEditAccess = role !== 'staff' || 
    (staffInfo?.permissions?.catalog_access && 
     String(staffInfo.permissions.catalog_access).toLowerCase() === 'edit');
  
  const [newStaff, setNewStaff] = useState({
    name: '',
    email: '',
    phone: '',
    password: generateRandomPassword(),
    catalogAccess: 'view' as CatalogAccessLevel,
    customXAccess: 'view' as CatalogAccessLevel,
    metalIQAccess: 'false' as CatalogAccessLevel,
    showLeads: true,
    leadEmails: false,
  });

  const [editingStaff, setEditingStaff] = useState<StaffMember | null>(null);

  useEffect(() => {
    // In impersonation mode, wait until the impersonated clientId is available
    if (isImpersonating && !impersonatedClientId) return;
    if (user) {
      fetchClientAndStaff();
    }
  }, [user, isImpersonating, impersonatedClientId]);

  const fetchClientAndStaff = async () => {
    try {
      let currentClientId: string | null = null;

      // If impersonating, use the impersonated client ID directly
      if (isImpersonating && impersonatedClientId) {
        currentClientId = impersonatedClientId;
      } else if (role === 'staff' && staffInfo?.clientId) {
        // Staff member - use client ID from staffInfo
        currentClientId = staffInfo.clientId;
      } else {
        // Get client ID for current user (client owner)
        const { data: clientData, error: clientError } = await supabase
          .from('clients')
          .select('id')
          .eq('user_id', user?.id)
          .maybeSingle();

        // Not all authenticated users have a client row (e.g. agency admins)
        if (clientError && clientError.code !== 'PGRST116') throw clientError;
        currentClientId = clientData?.id || null;
      }
      
      setClientId(currentClientId);

      // Fetch staff members
      let staffData: any[] = [];
      if (isImpersonating) {
        const { data: res, error: fnErr } = await supabase.functions.invoke('get-client-staff-members', {
          body: { clientId: currentClientId, limit: 1000 },
        });
        if (fnErr) throw fnErr;
        staffData = (res as any)?.staff || [];
      } else {
        const { data, error: staffError } = await supabase
          .from('staff_members')
          .select('*')
          .eq('client_id', currentClientId)
          .order('created_at', { ascending: false });
        if (staffError) throw staffError;
        staffData = data || [];
      }

      // Map the data to ensure proper typing
      const mappedStaff: StaffMember[] = (staffData || []).map(s => ({
        id: s.id,
        name: s.name,
        email: s.email,
        phone: s.phone,
        status: s.status,
        permissions: (s.permissions as StaffPermissions) || { catalog_access: true },
        created_at: s.created_at,
      }));

      setStaffMembers(mappedStaff);
    } catch (error) {
      console.error('Error fetching staff:', error);
      toast.error('Failed to load staff members');
    } finally {
      setLoading(false);
    }
  };

  const handleAddStaff = async () => {
    if (!newStaff.name || !newStaff.email || !clientId) {
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
      // Call edge function to create auth user and staff member
      const { data, error } = await supabase.functions.invoke('create-staff-user', {
        body: {
          email: newStaff.email,
          password: newStaff.password,
          name: newStaff.name,
          phone: newStaff.phone || null,
          clientId: clientId,
          permissions: {
            catalog_access: newStaff.catalogAccess,
            custom_x_access: newStaff.customXAccess,
            metal_buying_access: newStaff.metalIQAccess,
            show_leads: newStaff.showLeads,
            lead_email_notifications: newStaff.leadEmails,
          },
        },
      });

      if (error) throw error;
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

      // Send staff activity notification (non-blocking)
      if (clientId) {
        const { data: clientData } = await supabase.from('clients').select('company_name').eq('id', clientId).maybeSingle();
        supabase.functions.invoke('notify-staff-activity', {
          body: {
            client_id: clientId,
            event_type: 'staff_added',
            staff_name: newStaff.name,
            staff_email: newStaff.email,
            performed_by: clientData?.company_name || 'Account Owner',
            details: { catalog_access: newStaff.catalogAccess },
          },
        }).catch(err => console.error('Staff notification failed:', err));
      }
      
      setNewStaff({
        name: '',
        email: '',
        phone: '',
        password: generateRandomPassword(),
        catalogAccess: 'view',
        customXAccess: 'view',
        metalIQAccess: 'false',
        showLeads: true,
        leadEmails: false,
      });
      fetchClientAndStaff();
    } catch (error: any) {
      console.error('Error adding staff:', error);
      toast.error(error.message || 'Failed to add staff member');
    } finally {
      setAddingStaff(false);
    }
  };

  const handleUpdateStaff = async () => {
    if (!editingStaff) return;

    try {
      const { error } = await supabase
        .from('staff_members')
        .update({
          name: editingStaff.name,
          email: editingStaff.email,
          phone: editingStaff.phone,
          status: editingStaff.status,
          permissions: editingStaff.permissions,
        })
        .eq('id', editingStaff.id);

      if (error) throw error;

      toast.success('Staff member updated successfully');

      // Send permissions change notification if permissions changed (non-blocking)
      if (clientId) {
        const originalStaff = staffMembers.find(s => s.id === editingStaff.id);
        if (originalStaff && JSON.stringify(originalStaff.permissions) !== JSON.stringify(editingStaff.permissions)) {
          const { data: clientData } = await supabase.from('clients').select('company_name').eq('id', clientId).maybeSingle();
          supabase.functions.invoke('notify-staff-activity', {
            body: {
              client_id: clientId,
              event_type: 'staff_permissions_changed',
              staff_name: editingStaff.name,
              staff_email: editingStaff.email,
              performed_by: clientData?.company_name || 'Account Owner',
              details: {
                old_permissions: originalStaff.permissions,
                new_permissions: editingStaff.permissions,
              },
            },
          }).catch(err => console.error('Staff notification failed:', err));
        }
      }

      setEditDialogOpen(false);
      setEditingStaff(null);
      fetchClientAndStaff();
    } catch (error: any) {
      console.error('Error updating staff:', error);
      toast.error(error.message || 'Failed to update staff member');
    }
  };

  const handleStatusChange = async (staffId: string, newStatus: string) => {
    try {
      const { error } = await supabase
        .from('staff_members')
        .update({ status: newStatus })
        .eq('id', staffId);

      if (error) throw error;

      toast.success(`Staff member ${newStatus === 'active' ? 'activated' : 'deactivated'} successfully`);

      // Send status change notification (non-blocking)
      if (clientId) {
        const staff = staffMembers.find(s => s.id === staffId);
        if (staff) {
          const { data: clientData } = await supabase.from('clients').select('company_name').eq('id', clientId).maybeSingle();
          supabase.functions.invoke('notify-staff-activity', {
            body: {
              client_id: clientId,
              event_type: 'staff_status_changed',
              staff_name: staff.name,
              staff_email: staff.email,
              performed_by: clientData?.company_name || 'Account Owner',
              details: { new_status: newStatus },
            },
          }).catch(err => console.error('Staff notification failed:', err));
        }
      }

      fetchClientAndStaff();
    } catch (error: any) {
      console.error('Error updating status:', error);
      toast.error(error.message || 'Failed to update status');
    }
  };

  const handleDeleteStaff = async (id: string) => {
    if (!confirm('Are you sure you want to delete this staff member?')) return;

    try {
      // Call edge function to delete auth user and staff member
      const { data, error } = await supabase.functions.invoke('delete-staff-user', {
        body: { staffMemberId: id },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast.success('Staff member deleted successfully');

      // Send staff removed notification (non-blocking)
      if (clientId) {
        const deletedStaff = staffMembers.find(s => s.id === id);
        if (deletedStaff) {
          const { data: clientData } = await supabase.from('clients').select('company_name').eq('id', clientId).maybeSingle();
          supabase.functions.invoke('notify-staff-activity', {
            body: {
              client_id: clientId,
              event_type: 'staff_removed',
              staff_name: deletedStaff.name,
              staff_email: deletedStaff.email,
              performed_by: clientData?.company_name || 'Account Owner',
            },
          }).catch(err => console.error('Staff notification failed:', err));
        }
      }

      fetchClientAndStaff();
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
      <div className="p-8 space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">My Staff</h1>
          <p className="text-muted-foreground">
            {hasEditAccess ? 'Manage your team members' : 'View team members'}
          </p>
        </div>
        
        {hasEditAccess && (
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <Plus className="h-4 w-4" />
                Add Staff Member
              </Button>
            </DialogTrigger>
          <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Add New Staff Member</DialogTitle>
              <DialogDescription>
                Add a new team member to your account.
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
                  Make sure to copy and share this password with the staff member.
                </p>
                <PasswordStrengthIndicator 
                  password={newStaff.password} 
                  name={newStaff.name}
                  phone={newStaff.phone}
                />
              </div>
              <div className="space-y-3 pt-2 border-t">
                <Label className="text-sm font-medium">Permissions</Label>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Package className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">Ring OS Access</span>
                  </div>
                  <Select
                    value={newStaff.catalogAccess}
                    onValueChange={(value: CatalogAccessLevel) => setNewStaff(prev => ({ ...prev, catalogAccess: value }))}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select access level" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="false">
                        <div className="flex items-center gap-2">
                          <EyeOff className="h-4 w-4 text-muted-foreground" />
                          <span>Disabled</span>
                        </div>
                      </SelectItem>
                      <SelectItem value="view">
                        <div className="flex items-center gap-2">
                          <Eye className="h-4 w-4 text-blue-500" />
                          <span>View Only</span>
                        </div>
                      </SelectItem>
                      <SelectItem value="edit">
                        <div className="flex items-center gap-2">
                          <Pencil className="h-4 w-4 text-emerald-500" />
                          <span>View & Edit</span>
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">Custom X Access</span>
                  </div>
                  <Select
                    value={newStaff.customXAccess}
                    onValueChange={(value: CatalogAccessLevel) => setNewStaff(prev => ({ ...prev, customXAccess: value }))}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select access level" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="false">
                        <div className="flex items-center gap-2">
                          <EyeOff className="h-4 w-4 text-muted-foreground" />
                          <span>Disabled</span>
                        </div>
                      </SelectItem>
                      <SelectItem value="view">
                        <div className="flex items-center gap-2">
                          <Eye className="h-4 w-4 text-blue-500" />
                          <span>View Only</span>
                        </div>
                      </SelectItem>
                      <SelectItem value="edit">
                        <div className="flex items-center gap-2">
                          <Pencil className="h-4 w-4 text-emerald-500" />
                          <span>View & Edit</span>
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Coins className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">Metal IQ Access</span>
                  </div>
                  <Select
                    value={newStaff.metalIQAccess}
                    onValueChange={(value: CatalogAccessLevel) => setNewStaff(prev => ({ ...prev, metalIQAccess: value }))}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select access level" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="false">
                        <div className="flex items-center gap-2">
                          <EyeOff className="h-4 w-4 text-muted-foreground" />
                          <span>Disabled</span>
                        </div>
                      </SelectItem>
                      <SelectItem value="view">
                        <div className="flex items-center gap-2">
                          <Eye className="h-4 w-4 text-blue-500" />
                          <span>View Only</span>
                        </div>
                      </SelectItem>
                      <SelectItem value="edit">
                        <div className="flex items-center gap-2">
                          <Pencil className="h-4 w-4 text-emerald-500" />
                          <span>View & Edit</span>
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <StaffLeadToggles
                  idPrefix="new-staff"
                  showLeads={newStaff.showLeads}
                  leadEmails={newStaff.leadEmails}
                  onShowLeadsChange={(value) => setNewStaff(prev => ({ ...prev, showLeads: value }))}
                  onLeadEmailsChange={(value) => setNewStaff(prev => ({ ...prev, leadEmails: value }))}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleAddStaff} disabled={addingStaff}>
                {addingStaff ? 'Adding...' : 'Add Staff Member'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Team Members
          </CardTitle>
          <CardDescription>
            {staffMembers.length} staff member{staffMembers.length !== 1 ? 's' : ''} in your team
          </CardDescription>
        </CardHeader>
        <CardContent>
          {staffMembers.length === 0 ? (
            <div className="text-center py-12">
              <Users className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium">No staff members yet</h3>
              <p className="text-muted-foreground mb-4">
                Add your first team member to get started.
              </p>
              <Button onClick={() => setDialogOpen(true)} className="gap-2">
                <Plus className="h-4 w-4" />
                Add Staff Member
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Ring OS</TableHead>
                  <TableHead>Custom X</TableHead>
                  <TableHead>Metal IQ</TableHead>
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
                      {(() => {
                        const level = normalizeCatalogAccess(staff.permissions?.catalog_access);
                        const label = getCatalogAccessLabel(staff.permissions?.catalog_access);
                        return (
                          <Badge
                            variant={level === 'false' ? 'secondary' : 'default'}
                            className={
                              level === 'edit' ? 'bg-emerald-500' :
                              level === 'view' ? 'bg-blue-500' : 'bg-muted'
                            }
                          >
                            {label}
                          </Badge>
                        );
                      })()}
                    </TableCell>
                    <TableCell>
                      {(() => {
                        const level = normalizeCatalogAccess(staff.permissions?.custom_x_access);
                        const label = getCatalogAccessLabel(staff.permissions?.custom_x_access);
                        return (
                          <Badge
                            variant={level === 'false' ? 'secondary' : 'default'}
                            className={
                              level === 'edit' ? 'bg-emerald-500' :
                              level === 'view' ? 'bg-blue-500' : 'bg-muted'
                            }
                          >
                            {label}
                          </Badge>
                        );
                      })()}
                    </TableCell>
                    <TableCell>
                      {(() => {
                        const level = normalizeCatalogAccess(staff.permissions?.metal_buying_access);
                        const label = getCatalogAccessLabel(staff.permissions?.metal_buying_access);
                        return (
                          <Badge
                            variant={level === 'false' ? 'secondary' : 'default'}
                            className={
                              level === 'edit' ? 'bg-emerald-500' :
                              level === 'view' ? 'bg-blue-500' : 'bg-muted'
                            }
                          >
                            {label}
                          </Badge>
                        );
                      })()}
                    </TableCell>
                    <TableCell>
                      {hasEditAccess ? (
                        <Select
                          value={staff.status}
                          onValueChange={(value) => handleStatusChange(staff.id, value)}
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
                      ) : (
                        <Badge
                          variant={staff.status === 'active' ? 'default' : 'destructive'}
                          className={staff.status === 'active' ? 'bg-emerald-500' : 'bg-red-500'}
                        >
                          {staff.status === 'active' ? 'Active' : 'Inactive'}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDateWithTimezone(staff.created_at, clientTimezone)}
                    </TableCell>
                    <TableCell>
                      {hasEditAccess ? (
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
                              className="text-destructive"
                              onClick={() => handleDeleteStaff(staff.id)}
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      ) : (
                        <span className="text-muted-foreground text-sm">-</span>
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
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Staff Member</DialogTitle>
            <DialogDescription>
              Update staff member information.
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
                <Label htmlFor="edit-phone">Phone Number</Label>
                <Input
                  id="edit-phone"
                  value={editingStaff.phone || ''}
                  onChange={(e) => setEditingStaff(prev => prev ? { ...prev, phone: e.target.value } : null)}
                />
              </div>
              <div className="space-y-3 pt-2 border-t">
                <Label className="text-sm font-medium">Status</Label>
                <Select
                  value={editingStaff.status}
                  onValueChange={(value) => setEditingStaff(prev => prev ? { ...prev, status: value } : null)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select status" />
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
                  Inactive staff members cannot log in to the system.
                </p>
              </div>
              <div className="space-y-3 pt-2 border-t">
                <Label className="text-sm font-medium">Permissions</Label>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Package className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">Ring OS Access</span>
                  </div>
                  <Select
                    value={normalizeCatalogAccess(editingStaff.permissions?.catalog_access)}
                    onValueChange={(value: CatalogAccessLevel) => setEditingStaff(prev => prev ? { 
                      ...prev, 
                      permissions: { ...prev.permissions, catalog_access: value } 
                    } : null)}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select access level" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="false">
                        <div className="flex items-center gap-2">
                          <EyeOff className="h-4 w-4 text-muted-foreground" />
                          <span>Disabled</span>
                        </div>
                      </SelectItem>
                      <SelectItem value="view">
                        <div className="flex items-center gap-2">
                          <Eye className="h-4 w-4 text-blue-500" />
                          <span>View Only</span>
                        </div>
                      </SelectItem>
                      <SelectItem value="edit">
                        <div className="flex items-center gap-2">
                          <Pencil className="h-4 w-4 text-emerald-500" />
                          <span>View & Edit</span>
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    <strong>Disabled:</strong> No catalog access<br />
                    <strong>View Only:</strong> Can view the catalog<br />
                    <strong>View & Edit:</strong> Can view and reset/regenerate the catalog
                  </p>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">Custom X Access</span>
                  </div>
                  <Select
                    value={normalizeCatalogAccess(editingStaff.permissions?.custom_x_access)}
                    onValueChange={(value: CatalogAccessLevel) => setEditingStaff(prev => prev ? { 
                      ...prev, 
                      permissions: { ...prev.permissions, custom_x_access: value } 
                    } : null)}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select access level" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="false">
                        <div className="flex items-center gap-2">
                          <EyeOff className="h-4 w-4 text-muted-foreground" />
                          <span>Disabled</span>
                        </div>
                      </SelectItem>
                      <SelectItem value="view">
                        <div className="flex items-center gap-2">
                          <Eye className="h-4 w-4 text-blue-500" />
                          <span>View Only</span>
                        </div>
                      </SelectItem>
                      <SelectItem value="edit">
                        <div className="flex items-center gap-2">
                          <Pencil className="h-4 w-4 text-emerald-500" />
                          <span>View & Edit</span>
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    <strong>Disabled:</strong> No Custom X access<br />
                    <strong>View Only:</strong> Can view Custom X forms<br />
                    <strong>View & Edit:</strong> Can view and edit Custom X forms
                  </p>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Coins className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">Metal IQ Access</span>
                  </div>
                  <Select
                    value={normalizeCatalogAccess(editingStaff.permissions?.metal_buying_access)}
                    onValueChange={(value: CatalogAccessLevel) => setEditingStaff(prev => prev ? { 
                      ...prev, 
                      permissions: { ...prev.permissions, metal_buying_access: value } 
                    } : null)}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select access level" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="false">
                        <div className="flex items-center gap-2">
                          <EyeOff className="h-4 w-4 text-muted-foreground" />
                          <span>Disabled</span>
                        </div>
                      </SelectItem>
                      <SelectItem value="view">
                        <div className="flex items-center gap-2">
                          <Eye className="h-4 w-4 text-blue-500" />
                          <span>View Only</span>
                        </div>
                      </SelectItem>
                      <SelectItem value="edit">
                        <div className="flex items-center gap-2">
                          <Pencil className="h-4 w-4 text-emerald-500" />
                          <span>View & Edit</span>
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    <strong>Disabled:</strong> No Metal IQ access<br />
                    <strong>View Only:</strong> Can view Metal IQ leads<br />
                    <strong>View & Edit:</strong> Can view and edit Metal IQ config
                  </p>
                </div>
                <StaffLeadToggles
                  idPrefix="edit-staff"
                  showLeads={staffCanSeeLeads(editingStaff.permissions)}
                  leadEmails={editingStaff.permissions?.lead_email_notifications === true}
                  onShowLeadsChange={(value) =>
                    setEditingStaff(prev => prev ? {
                      ...prev,
                      permissions: { ...prev.permissions, show_leads: value }
                    } : null)
                  }
                  onLeadEmailsChange={(value) =>
                    setEditingStaff(prev => prev ? {
                      ...prev,
                      permissions: { ...prev.permissions, lead_email_notifications: value }
                    } : null)
                  }
                />
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
          toast.success('Staff member added successfully');
        }
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              Staff Member Created
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
                <Label>Email</Label>
                <div className="flex gap-2">
                  <Input value={createdStaffInfo.email} readOnly className="bg-muted" />
                  <Button variant="outline" size="icon" onClick={() => { navigator.clipboard.writeText(createdStaffInfo.email); toast.success('Email copied'); }}>
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Temporary Password</Label>
                <div className="flex gap-2">
                  <Input value={createdStaffInfo.password} readOnly className="bg-muted font-mono" />
                  <Button variant="outline" size="icon" onClick={() => { navigator.clipboard.writeText(createdStaffInfo.password); toast.success('Password copied'); }}>
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">The staff member will also receive an email with a password setup link.</p>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => { setShowPasswordDialog(false); setCreatedStaffInfo(null); toast.success('Staff member added successfully'); }}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}