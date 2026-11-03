import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Camera, Loader2, Save, Mail, Shield, Clock, MapPin } from 'lucide-react';
import { format } from 'date-fns';
import { Separator } from '@/components/ui/separator';

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

export default function Profile() {
  const { user, role } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
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

  const initials = user?.email?.split('@')[0].slice(0, 2).toUpperCase() || 'U';

  useEffect(() => {
    if (user) fetchProfile();
  }, [user]);

  const fetchProfile = async () => {
    if (!user) return;
    setLoading(true);
    
    // Fetch user profile
    const { data } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();

    // Fetch client address data
    const { data: clientData } = await supabase
      .from('clients')
      .select('id, phone, address_line1, city, state, postal_code, country')
      .eq('user_id', user.id)
      .maybeSingle();

    setProfile({
      full_name: data?.full_name || '',
      phone: data?.phone || clientData?.phone || '',
      avatar_url: data?.avatar_url || '',
      bio: data?.bio || '',
    });

    if (clientData) {
      setClientId(clientData.id);
      setAddress({
        address_line1: clientData.address_line1 || '',
        city: clientData.city || '',
        state: clientData.state || '',
        postal_code: clientData.postal_code || '',
        country: clientData.country || '',
      });
    }

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

  const handleSave = async () => {
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

    // Save phone + address to clients table if user has a client record
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

    if (error) {
      toast({ variant: 'destructive', title: 'Error saving profile', description: error.message });
    } else {
      toast({ title: 'Profile updated', description: 'Your profile has been saved successfully.' });
      window.dispatchEvent(new Event('user-profile-updated'));
      if (role === 'agency_admin') {
        navigate('/admin');
      } else {
        navigate('/dashboard');
      }
    }
    setSaving(false);
  };

  const roleLabel = role === 'agency_admin' ? 'Admin' : role === 'client' ? 'Client' : role === 'staff' ? 'Staff' : 'User';

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">My Profile</h1>
        <p className="text-muted-foreground text-sm">Manage your personal information and avatar.</p>
      </div>

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
              <p className="font-semibold text-lg">{profile.full_name || user?.email?.split('@')[0]}</p>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Mail className="h-3.5 w-3.5" />
                {user?.email}
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Shield className="h-3.5 w-3.5" />
                {roleLabel}
              </div>
              {user?.created_at && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Clock className="h-3.5 w-3.5" />
                  Joined {format(new Date(user.created_at), 'MMM d, yyyy')}
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
            <Label htmlFor="email">Email</Label>
            <Input id="email" value={user?.email || ''} disabled className="opacity-60" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="bio">Bio</Label>
            <Textarea
              id="bio"
              placeholder="A short bio about yourself..."
              rows={3}
              value={profile.bio}
              maxLength={500}
              onChange={e => setProfile(p => ({ ...p, bio: e.target.value }))}
            />
            <p className="text-xs text-muted-foreground text-right">{profile.bio.length}/500</p>
          </div>

          {/* Business Address Section */}
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
    </div>
  );
}
