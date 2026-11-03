import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface AdminNotification {
  id: string;
  user_id: string;
  category: string;
  title: string;
  message: string | null;
  metadata: Record<string, any> | null;
  is_read: boolean;
  created_at: string;
}

export function useAdminNotifications() {
  const { user, role } = useAuth();
  const [notifications, setNotifications] = useState<AdminNotification[]>([]);
  const [loading, setLoading] = useState(true);

  const isAdmin = role === "agency_admin";
  const unreadCount = notifications.filter((n) => !n.is_read).length;

  const fetchNotifications = useCallback(async () => {
    if (!user || !isAdmin) return;
    const { data } = await (supabase as any)
      .from("admin_notifications")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50);
    if (data) setNotifications(data);
    setLoading(false);
  }, [user, isAdmin]);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  // Realtime
  useEffect(() => {
    if (!user || !isAdmin) return;
    const channel = supabase
      .channel("admin-notifications")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "admin_notifications", filter: `user_id=eq.${user.id}` },
        () => fetchNotifications()
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, isAdmin, fetchNotifications]);

  const markAsRead = useCallback(async (id: string) => {
    await (supabase as any).from("admin_notifications").update({ is_read: true }).eq("id", id);
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)));
  }, []);

  const markAllAsRead = useCallback(async () => {
    if (!user) return;
    await (supabase as any).from("admin_notifications").update({ is_read: true }).eq("user_id", user.id).eq("is_read", false);
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
  }, [user]);

  const clearAll = useCallback(async () => {
    if (!user) return;
    await (supabase as any).from("admin_notifications").delete().eq("user_id", user.id);
    setNotifications([]);
  }, [user]);

  return { notifications, unreadCount, loading, markAsRead, markAllAsRead, clearAll };
}
