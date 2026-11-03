import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAdminImpersonation } from '@/contexts/AdminImpersonationContext';
import { useAuth } from '@/contexts/AuthContext';
import { DateRange } from 'react-day-picker';
import { getPageCache, setPageCache, resolveOwnClientId } from '@/lib/page-cache';

export interface LeadItem {
  id: string;
  customer_name: string;
  customer_email: string;
  follow_up_status: string | null;
  created_at: string;
  source: 'widget' | 'ring_builder' | 'diamond_form' | 'grill_form' | 'custom_enquiry' | 'booking' | 'metal_iq' | 'deposit';
  estimated_total?: number;
  /** Metal IQ only; absent on older edge-function deploys. */
  estimated_profit?: number;
}

export interface WidgetViewStats {
  total: number;
  unique: number;
}

export interface UpcomingBooking {
  id: string;
  customer_name: string;
  customer_email: string;
  preferred_date: string | null;
  preferred_time: string | null;
  status: string;
}

export interface DashboardStats {
  companyName: string;
  storeVisits: number;
  totalLeads: number;
  totalBookings: number;
  totalOrders: number;
  monthlyRevenue: number;
  widgetRevenue: number;
  /** Shopify order currency of widgetRevenue; absent on older edge-function deploys. */
  widgetRevenueCurrency?: string | null;
  widgetRevenueByCurrency?: { currency: string; amount: number; orders: number }[];
  formsRevenueCurrency?: string | null;
  /** Ring OS + the three CustomX forms, always in that order; absent on older deploys. */
  revenueByProduct?: { product: string; byCurrency: { currency: string; amount: number; orders: number }[] }[] | null;
  formsRevenue: number;
  totalDeposits: number;
  depositCount: number;
  hasDepositMode: boolean;
  avgLeadValue: number;
  totalSavedDesigns: number;
  totalAIConfigurations: number;
  totalChatSessions: number;
  totalInquiries: number;
  recentLeads: LeadItem[];
  recentOrders: any[];
  leadSources: Record<string, number>;
  timezone: string;
  widgetViews: {
    jewlx_widget: WidgetViewStats;
    ring_builder: WidgetViewStats;
    grillz_builder: WidgetViewStats;
    custom_enquiry: WidgetViewStats;
    metal_buying: WidgetViewStats;
  };
  /** Daily widget-view buckets for the Traffic Activity chart, from the edge function. */
  dailyTraffic?: { date: string; count: number }[];
  leadTagCounts: Record<string, number>;
  orderTagCounts: Record<string, number>;
  cadStatusCounts: Record<string, number>;
  allLeads: LeadItem[];
  upcomingBookings?: UpcomingBooking[];
}

function getDefaultRange(): DateRange {
  const end = new Date();
  const start = new Date(end.getFullYear(), end.getMonth(), 1);
  return { from: start, to: end };
}

const dayKey = (d?: Date) => (d ? `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}` : '');

export function useClientDashboard() {
  const { impersonatedClientId } = useAdminImpersonation();
  const { user, role, staffInfo } = useAuth();
  const [dateRange, setDateRange] = useState<DateRange>(getDefaultRange);
  // Last stats for this account + date range, shown instantly while fresh ones load.
  const accountKey = impersonatedClientId || (role === 'staff' ? staffInfo?.clientId : user?.id) || null;
  const cacheKey = accountKey ? `dashboard:${accountKey}:${dayKey(dateRange.from)}:${dayKey(dateRange.to)}` : null;
  const cached = getPageCache<{ stats: DashboardStats; clientId: string | null }>(cacheKey);
  const [stats, setStats] = useState<DashboardStats | null>(() => cached?.stats ?? null);
  const [loading, setLoading] = useState(() => !cached);
  const [resolvedClientId, setResolvedClientId] = useState<string | null>(() => cached?.clientId ?? null);

  // Switching to a date range we already loaded shows it immediately.
  useEffect(() => {
    const hit = getPageCache<{ stats: DashboardStats; clientId: string | null }>(cacheKey);
    if (hit) { setStats(hit.stats); setLoading(false); }
  }, [cacheKey]);
  const [tick, setTick] = useState(0);

  // Real-time tick for timeAgo updates every 60s
  useEffect(() => {
    const interval = setInterval(() => setTick(t => t + 1), 60000);
    return () => clearInterval(interval);
  }, []);

  const fetchDashboardData = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      // Resolve clientId for realtime subscription (cached; runs alongside the stats call)
      let clientId: string | null | undefined = impersonatedClientId;
      if (!clientId && role === 'staff' && staffInfo?.clientId) clientId = staffInfo.clientId;
      if (clientId) {
        setResolvedClientId(clientId);
      } else {
        resolveOwnClientId(session.user.id)
          .then((id) => { if (id) setResolvedClientId((prev) => prev ?? id); })
          .catch((lookupErr) => console.error('Client lookup failed:', lookupErr));
      }

      const startISO = dateRange.from ? dateRange.from.toISOString() : undefined;
      const endISO = dateRange.to
        ? new Date(dateRange.to.getFullYear(), dateRange.to.getMonth(), dateRange.to.getDate(), 23, 59, 59, 999).toISOString()
        : undefined;

      const { data, error } = await supabase.functions.invoke('client-dashboard-stats', {
        body: {
          clientId: impersonatedClientId || undefined,
          startISO,
          endISO,
        },
      });

      if (error) {
        console.error('Dashboard stats error:', error);
        return;
      }

      setStats(data as DashboardStats);
      if (data?.clientId) setResolvedClientId(data.clientId);
      setPageCache(cacheKey, { stats: data as DashboardStats, clientId: data?.clientId ?? clientId ?? null });
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setLoading(false);
    }
  }, [impersonatedClientId, dateRange, role, staffInfo?.clientId, cacheKey]);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  // Hybrid live-update strategy (cost-optimized):
  // 1. Keep realtime ONLY on `orders` and `client_notifications` (low-churn, kept in publication).
  // 2. Poll every 45s in the background for the 8 high-churn lead tables that were removed
  //    from the realtime publication to cut Cloud broadcast costs.
  // 3. Refetch instantly when the user returns to the tab (no stale data on resume).
  useEffect(() => {
    if (!resolvedClientId) return;

    const channel = supabase.channel(`dashboard-realtime-${resolvedClientId}`);
    for (const table of ['orders', 'client_notifications'] as const) {
      channel.on('postgres_changes', {
        event: '*',
        schema: 'public',
        table,
        filter: `client_id=eq.${resolvedClientId}`,
      }, () => {
        fetchDashboardData();
      });
    }
    channel.subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [resolvedClientId, fetchDashboardData]);

  // Background polling for tables no longer broadcast via realtime
  useEffect(() => {
    if (!resolvedClientId) return;
    const interval = setInterval(() => { fetchDashboardData(); }, 45000);
    return () => clearInterval(interval);
  }, [resolvedClientId, fetchDashboardData]);

  // Instant refresh when user returns to the tab
  useEffect(() => {
    const onFocus = () => { fetchDashboardData(); };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [fetchDashboardData]);

  return {
    stats,
    loading,
    dateRange,
    setDateRange,
    resolvedClientId,
    tick,
    refresh: fetchDashboardData,
  };
}
