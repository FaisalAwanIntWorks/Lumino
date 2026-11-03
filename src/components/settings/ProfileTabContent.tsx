import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useAdminImpersonation } from '@/contexts/AdminImpersonationContext';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Camera, Loader2, Save, Mail, Shield, Clock, MapPin } from 'lucide-react';
import { format } from 'date-fns';
import { Separator } from '@/components/ui/separator';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface ProfileData {
  full_name: string;
  phone: string;
  avatar_url: string;
  bio: string;
}

interface AddressData {
  address_line1: string;
  city: string;
  state: string;
  postal_code: string;
  country: string;
}

export function ProfileTabContent() {
  const { user, role } = useAuth();
  const { isImpersonating, impersonatedClientId } = useAdminImpersonation();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [profile, setProfile] = useState<ProfileData>({
    full_name: '',
    phone: '',
    avatar_url: '',
    bio: '',
  });
  const [address, setAddress] = useState<AddressData>({
    address_line1: '',
    city: '',
    state: '',
    postal_code: '',
    country: '',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [clientId, setClientId] = useState<string | null>(null);

  // Email editing
  const [currentEmail, setCurrentEmail] = useState<string>('');
  const [emailInput, setEmailInput] = useState<string>('');
  const [confirmOpen, setConfirmOpen] = useState(false);

  const [clientCreatedAt, setClientCreatedAt] = useState<string | null>(null);
  const [clientCompanyName, setClientCompanyName] = useState<string | null>(null);

  const isStaff = role === 'staff';
  const emailEditable = !isStaff; // admin (own or impersonating) and client owners can edit

  const initials = (currentEmail || user?.email || 'U').split('@')[0].slice(0, 2).toUpperCase();

  useEffect(() => {
    if (user) fetchProfile();
  }, [user, isImpersonating, impersonatedClientId]);

  const fetchProfile = async () => {
    if (!user) return;
    setLoading(true);

    // When admin is impersonating, load the impersonated client's row
    // so we show the client's info, not the admin's.
    let clientQuery = supabase
      .from('clients')
      .select('id, user_id, email, phone, company_name, created_at, address_line1, city, state, postal_code, country');
    if (isImpersonating && impersonatedClientId) {
      clientQuery = clientQuery.eq('id', impersonatedClientId);
    } else {
      clientQuery = clientQuery.eq('user_id', user.id);
    }
    const { data: clientData } = await clientQuery.maybeSingle();

    // Load user_profiles for the relevant user (client's user_id when impersonating)
    const profileUserId = (isImpersonating && clientData?.user_id) ? clientData.user_id : user.id;
    const { data } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('user_id', profileUserId)
      .maybeSingle();

    setProfile({
      full_name: data?.full_name || '',
      phone: data?.phone || clientData?.phone || '',
      avatar_url: data?.avatar_url || '',
      bio: data?.bio || '',
    });

    if (clientData) {
      setClientId(clientData.id);
      setClientCreatedAt(clientData.created_at || null);
      setClientCompanyName(clientData.company_name || null);
      setAddress({
        address_line1: clientData.address_line1 || '',
        city: clientData.city || '',
        state: clientData.state || '',
        postal_code: clientData.postal_code || '',
        country: clientData.country || '',
      });
    } else {
      setClientId(null);
      setClientCreatedAt(null);
      setClientCompanyName(null);
    }

    // Resolve email source: impersonated client's email, else own auth email
    const resolvedEmail =
      isImpersonating && clientData?.email ? clientData.email : (user.email || '');
    setCurrentEmail(resolvedEmail);
    setEmailInput(resolvedEmail);

    setLoading(false);
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    if (file.size > 2 * 1024 * 1024) {
      toast({ variant: 'destructive', title: 'File too large', description: 'Max 2MB allowed.' });
      return;
    }

    setUploading(true);
    const ext = file.name.split('.').pop();
    const filePath = `${user.id}/avatar.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(filePath, file, { upsert: true });

    if (uploadError) {
      toast({ variant: 'destructive', title: 'Upload failed', description: uploadError.message });
      setUploading(false);
      return;
    }

    const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(filePath);
    const avatarUrl = `${urlData.publicUrl}?t=${Date.now()}`;

    setProfile(prev => ({ ...prev, avatar_url: avatarUrl }));
    setUploading(false);
    toast({ title: 'Avatar uploaded', description: 'Save your profile to apply changes.' });
  };

  const emailChanged =
    emailEditable &&
    emailInput.trim().toLowerCase() !== (currentEmail || '').trim().toLowerCase() &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailInput.trim());

  const performSave = async () => {
    if (!user) return;
    setSaving(true);

    const { error } = await supabase
      .from('user_profiles')
      .upsert({
        user_id: user.id,
        full_name: profile.full_name.trim() || null,
        phone: profile.phone.trim() || null,
        avatar_url: profile.avatar_url || null,
        bio: profile.bio.trim() || null,
      }, { onConflict: 'user_id' });

    if (clientId) {
      await supabase
        .from('clients')
        .update({
          phone: profile.phone.trim() || null,
          address_line1: address.address_line1.trim() || null,
          city: address.city.trim() || null,
          state: address.state.trim() || null,
          postal_code: address.postal_code.trim() || null,
          country: address.country.trim() || null,
        })
        .eq('id', clientId);
    }

    // Handle email change separately
    let emailMsg: string | null = null;
    if (emailChanged) {
      const newEmail = emailInput.trim().toLowerCase();
      if (isImpersonating && impersonatedClientId) {
        const { data, error: fnErr } = await supabase.functions.invoke(
          'admin-update-client-email',
          { body: { clientId: impersonatedClientId, newEmail } }
        );
        if (fnErr || (data as any)?.error) {
          toast({
            variant: 'destructive',
            title: 'Email update failed',
            description: (data as any)?.error || fnErr?.message || 'Could not update client email.',
          });
          setSaving(false);
          return;
        }
        setCurrentEmail(newEmail);
        emailMsg = 'Client email updated immediately. Their data stays linked via internal client ID.';
      } else {
        const { data: sessionData } = await supabase.auth.getSession();
        const accessToken = sessionData.session?.access_token;
        const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/client-update-own-email`;
        const resp = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({ newEmail }),
        });
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok || data?.error) {
          toast({
            variant: 'destructive',
            title: 'Email update failed',
            description: data?.error || `Request failed (${resp.status})`,
          });
          setSaving(false);
          return;
        }
        setCurrentEmail(newEmail);
        emailMsg = 'Email updated. Use your new email next time you sign in — your password stays the same.';
      }
    }

    if (error) {
      toast({ variant: 'destructive', title: 'Error saving profile', description: error.message });
    } else {
      toast({
        title: 'Profile updated',
        description: emailMsg ?? 'Your profile has been saved successfully.',
      });
      window.dispatchEvent(new Event('user-profile-updated'));
    }
    setSaving(false);
  };

  const handleSave = async () => {
    if (emailChanged) {
      setConfirmOpen(true);
      return;
    }
    await performSave();
  };

  const roleLabel = isImpersonating
    ? 'Client'
    : role === 'agency_admin' ? 'Admin' : role === 'client' ? 'Client' : role === 'staff' ? 'Staff' : 'User';
  const headerName = profile.full_name || clientCompanyName || (currentEmail || user?.email || '').split('@')[0];
  const headerEmail = currentEmail || user?.email || '';
  const headerJoined = isImpersonating ? clientCreatedAt : user?.created_at;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Avatar Card */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-6">
            <div className="relative group">
              <Avatar className="h-24 w-24 border-2 border-border">
                <AvatarImage src={profile.avatar_url} alt="Profile" />
                <AvatarFallback className="bg-primary text-primary-foreground text-2xl">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
              >
                {uploading ? (
                  <Loader2 className="h-6 w-6 animate-spin text-white" />
                ) : (
                  <Camera className="h-6 w-6 text-white" />
                )}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleAvatarUpload}
              />
            </div>
            <div className="space-y-1">
              <p className="font-semibold text-lg">{headerName}</p>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Mail className="h-3.5 w-3.5" />
                {headerEmail}
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Shield className="h-3.5 w-3.5" />
                {roleLabel}
              </div>
              {headerJoined && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Clock className="h-3.5 w-3.5" />
                  Joined {format(new Date(headerJoined), 'MMM d, yyyy')}
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Details Form */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Personal Details</CardTitle>
          <CardDescription>Update your name, phone, bio, and business address.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="full_name">Full Name</Label>
              <Input
                id="full_name"
                placeholder="Enter your full name"
                value={profile.full_name}
                onChange={e => setProfile(p => ({ ...p, full_name: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Phone</Label>
              <Input
                id="phone"
                placeholder="Enter your phone number"
                value={profile.phone}
                onChange={e => setProfile(p => ({ ...p, phone: e.target.value }))}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">
              Email{isImpersonating && <span className="ml-2 text-xs text-muted-foreground">(viewing-as client)</span>}
            </Label>
            <Input
              id="email"
              type="email"
              value={emailInput}
              disabled={!emailEditable}
              onChange={e => setEmailInput(e.target.value)}
              className={!emailEditable ? 'opacity-60' : ''}
              placeholder="name@example.com"
            />
            {!emailEditable ? (
              <p className="text-xs text-muted-foreground">Staff accounts can't change their login email. Contact an admin.</p>
            ) : isImpersonating ? (
              <p className="text-xs text-muted-foreground">
                As admin, saving will immediately update this client's login email. All Ring OS, Custom X, Metal IQ, leads, orders and billing data stay linked via internal client ID.
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Your login email will be updated immediately. Your password stays the same.
              </p>
            )}
          </div>

          {clientId && (
            <>
              <Separator />
              <div className="flex items-center gap-2 pt-1">
                <MapPin className="h-4 w-4 text-muted-foreground" />
                <p className="font-semibold text-sm">Business Address</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="address_line1">Street Address</Label>
                <Input
                  id="address_line1"
                  placeholder="123 Main St, Suite 100"
                  value={address.address_line1}
                  onChange={e => setAddress(a => ({ ...a, address_line1: e.target.value }))}
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="city">City</Label>
                  <Input
                    id="city"
                    placeholder="New York"
                    value={address.city}
                    onChange={e => setAddress(a => ({ ...a, city: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="state">State / Province</Label>
                  <Input
                    id="state"
                    placeholder="NY"
                    value={address.state}
                    onChange={e => setAddress(a => ({ ...a, state: e.target.value }))}
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="postal_code">Postal Code</Label>
                  <Input
                    id="postal_code"
                    placeholder="10001"
                    value={address.postal_code}
                    onChange={e => setAddress(a => ({ ...a, postal_code: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="country">Country</Label>
                  <Input
                    id="country"
                    placeholder="United States"
                    value={address.country}
                    onChange={e => setAddress(a => ({ ...a, country: e.target.value }))}
                  />
                </div>
              </div>
            </>
          )}

          <div className="flex justify-end">
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Save Changes
            </Button>
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Change email address?</AlertDialogTitle>
            <AlertDialogDescription>
              {isImpersonating ? (
                <>
                  You are about to change this client's login email from{' '}
                  <span className="font-medium">{currentEmail}</span> to{' '}
                  <span className="font-medium">{emailInput.trim()}</span>. The change is immediate and bypasses verification. All their platform data remains linked.
                </>
              ) : (
                <>
                  Your login email will change from{' '}
                  <span className="font-medium">{currentEmail}</span> to{' '}
                  <span className="font-medium">{emailInput.trim()}</span> immediately. Use the new email next time you sign in — your password stays the same.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                setConfirmOpen(false);
                await performSave();
              }}
            >
              Confirm change
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
