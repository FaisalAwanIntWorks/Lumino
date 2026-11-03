import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface ClientNotification {
  id: string;
  client_id: string;
  category: string;
  title: string;
  message: string;
  metadata: Record<string, unknown>;
  is_read: boolean;
  created_at: string;
}

export function useNotifications() {
  const { user, role, staffInfo } = useAuth();
  const [notifications, setNotifications] = useState<ClientNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);

  const getClientId = useCallback(async (): Promise<string | null> => {
    if (!user) return null;
    if (role === 'staff' && staffInfo?.clientId) return staffInfo.clientId;
    const { data } = await supabase
      .from('clients')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle();
    return data?.id ?? null;
  }, [user, role, staffInfo]);

  const fetchNotifications = useCallback(async () => {
    const clientId = await getClientId();
    if (!clientId) { setLoading(false); return; }

    const { data, error } = await supabase
      .from('client_notifications')
      .select('*')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false })
      .limit(50);

    if (!error && data) {
      setNotifications(data as ClientNotification[]);
      setUnreadCount(data.filter((n: any) => !n.is_read).length);
    }
    setLoading(false);
  }, [getClientId]);

  const markAsRead = useCallback(async (notificationId: string) => {
    await supabase
      .from('client_notifications')
      .update({ is_read: true })
      .eq('id', notificationId);
    setNotifications(prev =>
      prev.map(n => n.id === notificationId ? { ...n, is_read: true } : n)
    );
    setUnreadCount(prev => Math.max(0, prev - 1));
  }, []);

  const markAllAsRead = useCallback(async () => {
    const clientId = await getClientId();
    if (!clientId) return;
    await supabase
      .from('client_notifications')
      .update({ is_read: true })
      .eq('client_id', clientId)
      .eq('is_read', false);
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    setUnreadCount(0);
  }, [getClientId]);

  const clearAll = useCallback(async () => {
    const clientId = await getClientId();
    if (!clientId) return;
    await supabase
      .from('client_notifications')
      .delete()
      .eq('client_id', clientId);
    setNotifications([]);
    setUnreadCount(0);
  }, [getClientId]);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  // Realtime subscription
  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null;

    const setup = async () => {
      const clientId = await getClientId();
      if (!clientId) return;

      channel = supabase
        .channel('client-notifications')
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'client_notifications',
            filter: `client_id=eq.${clientId}`,
          },
          (payload) => {
            const newNotif = payload.new as ClientNotification;
            setNotifications(prev => [newNotif, ...prev].slice(0, 50));
            setUnreadCount(prev => prev + 1);
          }
        )
        .subscribe();
    };

    setup();
    return () => { channel?.unsubscribe(); };
  }, [getClientId]);

  return { notifications, unreadCount, loading, markAsRead, markAllAsRead, clearAll, refetch: fetchNotifications };
}
