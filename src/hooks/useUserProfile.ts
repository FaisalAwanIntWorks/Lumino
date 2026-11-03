import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

interface UserProfile {
  full_name: string;
  phone: string;
  avatar_url: string;
  bio: string;
}

const defaultProfile: UserProfile = { full_name: '', phone: '', avatar_url: '', bio: '' };

export function useUserProfile() {
  const { user, role, staffInfo } = useAuth();
  const [profile, setProfile] = useState<UserProfile>(defaultProfile);
  const [loading, setLoading] = useState(true);

  const fetchProfile = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();

    let fullName = data?.full_name || '';

    // If no full_name in user_profiles, try staff_members name
    if (!fullName && role === 'staff' && staffInfo?.id) {
      const { data: staffData } = await supabase
        .from('staff_members')
        .select('name')
        .eq('id', staffInfo.id)
        .maybeSingle();
      fullName = staffData?.name || '';
    }

    setProfile({
      full_name: fullName,
      phone: data?.phone || '',
      avatar_url: data?.avatar_url || '',
      bio: data?.bio || '',
    });
    setLoading(false);
  }, [user, role, staffInfo]);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  // Listen for profile updates from other components
  useEffect(() => {
    const handler = () => fetchProfile();
    window.addEventListener('user-profile-updated', handler);
    return () => window.removeEventListener('user-profile-updated', handler);
  }, [fetchProfile]);

  return { profile, loading, refetch: fetchProfile };
}
