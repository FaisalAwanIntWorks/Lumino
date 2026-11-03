import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { DateRange } from 'react-day-picker';

import { DashboardHeader } from '@/components/client/dashboard/DashboardHeader';
import { TrafficOverview } from '@/components/client/dashboard/TrafficOverview';
import { AIActivityCard } from '@/components/client/dashboard/AIActivityCard';
import { RecentLeads } from '@/components/client/dashboard/RecentLeads';
import { RecentOrders } from '@/components/client/dashboard/RecentOrders';
import { LeadSources } from '@/components/client/dashboard/LeadSources';
import { UpcomingBookings } from '@/components/client/dashboard/UpcomingBookings';
import { SessionsChart } from '@/components/dashboard/SessionsChart';
import { AdminTopClientsCard } from '@/components/admin/dashboard/AdminTopClientsCard';
import { AdminStatusSummary } from '@/components/admin/dashboard/AdminStatusSummary';
import { AdminRevenueTile, type RevenueBreakdown } from '@/components/admin/dashboard/AdminRevenueTile';
import {
  ModuleSections,
  buildClientSections,
  formatByCurrency,
  sumCurrencyRows,
  type ModuleSectionData,
} from '@/components/client/dashboard/ModuleSections';
import { withFeatureDefaults, type ClientFeatures } from '@/lib/feature-registry';
import type { DashboardStats } from '@/hooks/useClientDashboard';
import { sumDeviceCounts, useLeadDeviceBreakdown } from '@/hooks/useLeadDeviceBreakdown';
import { ADMIN_LEAD_FORMS, DeviceInfoHover, LeadDeviceCounts, LeadFormsDeviceTable } from '@/components/dashboard/LeadDeviceBreakdown';

interface ClientOption {
  id: string;
  company_name: string;
  status: string | null;
  enabled_features: Record<string, boolean> | null;
}

interface AdminPlatformStats {
  totalRevenue: number;
  /** null/absent when get_product_revenue isn't available yet — tile falls back to totalRevenue. */
  revenueBreakdown?: RevenueBreakdown | null;
  totalLeads: number;
  totalBookings: number;
  totalMetalIQ: number;
  /** Exact lead counts per source table; absent on older edge-function deploys. */
  leadTotals?: Record<string, number>;
  dailyLeads: { date: string; count: number }[];
  dailyTraffic: { date: string; count: number }[];
  topClientsByLeads: { id: string; name: string; count: number }[];
  topClientsByGenerations: { id: string; name: string; count: number }[];
  topClientsByMetalIQ: { id: string; name: string; count: number }[];
  leadStatusCounts: Record<string, number>;
  bookingStatusCounts: Record<string, number>;
  orderStatusCounts: Record<string, number>;
  cadStatusCounts: Record<string, number>;
}

function formatCurrency(v: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(v);
}

export default function AdminDashboard() {
  const [clientStats, setClientStats] = useState<DashboardStats | null>(null);
  const [platformStats, setPlatformStats] = useState<AdminPlatformStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [selectedClientId, setSelectedClientId] = useState<string>('all');
  const [dateRange, setDateRange] = useState<DateRange>(() => {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 30);
    return { from: start, to: end };
  });
  const [tick, setTick] = useState(0);

  const isAllClients = selectedClientId === 'all';
  const deviceBreakdown = useLeadDeviceBreakdown({
    clientId: isAllClients ? null : selectedClientId,
    from: dateRange.from,
    to: dateRange.to,
  });

  useEffect(() => {
    const interval = setInterval(() => setTick(t => t + 1), 60000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    supabase.from('clients').select('id, company_name, status, enabled_features').order('company_name').then(({ data }) => {
      if (data) setClients(data as ClientOption[]);
    });
  }, []);

  const fetchData = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const startISO = dateRange.from ? dateRange.from.toISOString() : undefined;
      const endISO = dateRange.to
        ? new Date(dateRange.to.getFullYear(), dateRange.to.getMonth(), dateRange.to.getDate(), 23, 59, 59, 999).toISOString()
        : undefined;

      if (isAllClients) {
        // Use admin endpoint
        const { data: result, error } = await supabase.functions.invoke('admin-dashboard-stats', {
          body: { dateFrom: startISO, dateTo: endISO },
        });
        if (error) throw error;
        if (result?.error) throw new Error(result.error);
        setPlatformStats(result as AdminPlatformStats);
        setClientStats(null);
      } else {
        // Use client endpoint for individual client
        const { data: result, error } = await supabase.functions.invoke('client-dashboard-stats', {
          body: { clientId: selectedClientId, startISO, endISO },
        });
        if (error) throw error;
        if (result?.error) throw new Error(result.error);
        setClientStats(result as DashboardStats);
        setPlatformStats(null);
      }

      if (isRefresh) toast.success('Dashboard refreshed');
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
      toast.error('Failed to load dashboard data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedClientId, dateRange, isAllClients]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const selectedFeatures = useMemo<ClientFeatures>(
    () => withFeatureDefaults(clients.find(c => c.id === selectedClientId)?.enabled_features ?? null),
    [clients, selectedClientId],
  );

  const rangeLabel = useMemo(() => {
    if (dateRange.from && dateRange.to) {
      return `${format(dateRange.from, 'MMM d')} – ${format(dateRange.to, 'MMM d, yyyy')}`;
    }
    return '';
  }, [dateRange]);

  // Single client: only the modules that client actually has, each under its own heading.
  const clientSections = useMemo(
    () => (clientStats ? buildClientSections(clientStats, selectedFeatures, 'USD', rangeLabel) : []),
    [clientStats, selectedFeatures, rangeLabel],
  );

  // All clients: platform totals split by module.
  const platformSections = useMemo<ModuleSectionData[]>(() => {
    if (!platformStats) return [];
    const lt = platformStats.leadTotals;
    const rb = platformStats.revenueBreakdown;
    if (!lt) return [];
    const rows = (p: string) => rb?.byProduct.find(x => x.product === p)?.byCurrency;
    const customX = sumCurrencyRows(['ring_builder', 'grillz_builder', 'custom_enquiry'].map(rows));
    const metrics = (list: [string, string | number | undefined, string[]?][]) =>
      list
        .filter(([, v]) => v !== undefined)
        .map(([label, value, deviceSources]) => ({ label, value: value as string | number, note: rangeLabel, deviceSources }));
    return [
      {
        key: 'ring_os',
        title: 'Ring OS',
        metrics: metrics([
          ['Revenue', rb ? formatByCurrency(rows('ring_os'), 'USD') : undefined],
          ['Saved Designs', lt.saved_designs || 0, ['widget']],
          ['Bookings', lt.appointment_bookings || 0, ['booking', 'metal_iq_bookings']],
        ]),
      },
      {
        key: 'custom_x',
        title: 'Custom X',
        metrics: metrics([
          ['Deposits', rb ? formatByCurrency(customX, 'USD') : undefined],
          ['Ring Builder Leads', lt.design_requests || 0, ['ring_builder']],
          ['Grillz Leads', lt.grill_form_leads || 0, ['grill_form']],
          ['Custom Enquiry Leads', lt.custom_enquiry_leads || 0, ['custom_enquiry']],
        ]),
      },
      {
        key: 'quote_estimator',
        title: 'Quote Estimator',
        metrics: metrics([['Leads', lt.diamond_form_leads || 0, ['diamond_form']]]),
      },
      {
        key: 'metal_iq',
        title: 'Metal IQ',
        metrics: metrics([['Leads', lt.metal_buying_leads || 0, ['metal_iq']]]),
      },
    ];
  }, [platformStats, rangeLabel]);

  if (loading) {
    return (
      <div className="pt-[52px] px-4 sm:px-8 lg:px-12 pb-[80px]">
        <Skeleton className="h-5 w-40 mb-2" />
        <Skeleton className="h-9 w-72 mb-10" />
        <div className="grid grid-cols-4 gap-8 mb-10">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-20" />)}
        </div>
        <Skeleton className="h-60 mb-6" />
      </div>
    );
  }

  return (
    <div className="bg-background min-h-screen">
      <div className="pt-[52px] px-4 sm:px-8 lg:px-12 pb-[80px]">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl sm:text-[28px] font-bold tracking-tight text-foreground">
              Platform Dashboard
            </h1>
            <p className="text-[13px] font-medium text-muted-foreground mt-0.5">
              {isAllClients ? 'Combined view across all clients' : clientStats?.companyName || 'Client dashboard'}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Select value={selectedClientId} onValueChange={setSelectedClientId}>
              <SelectTrigger className="w-[220px] h-9 text-sm bg-card border-border/50">
                <SelectValue placeholder="All Clients" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Clients</SelectItem>
                {clients.map(c => (
                  <SelectItem key={c.id} value={c.id}>{c.company_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              onClick={() => fetchData(true)}
              disabled={refreshing}
              className="gap-2"
            >
              <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
              Refresh
            </Button>
          </div>
        </div>

        {/* Date picker */}
        <DashboardHeader
          companyName={isAllClients ? 'All Clients' : clientStats?.companyName || ''}
          timezone={clientStats?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone}
          dateRange={dateRange}
          setDateRange={setDateRange}
        />

        {/* ====== ALL CLIENTS MODE ====== */}
        {isAllClients && platformStats && (
          <>
            {/* 4 KPIs */}
            <div className="mt-10" style={{ opacity: 0, animation: 'fadeUpIn 0.4s ease-out 0.06s forwards' }}>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                {[
                  { label: 'Total Revenue', value: formatCurrency(platformStats.totalRevenue) },
                  { label: 'Total Leads', value: platformStats.totalLeads.toLocaleString() },
                  { label: 'Total Bookings', value: platformStats.totalBookings.toLocaleString() },
                  { label: 'Total Metal IQ', value: platformStats.totalMetalIQ.toLocaleString() },
                ].map((m, i) => {
                  return (
                    <div key={m.label} className="neu-card p-5 sm:p-6">
                      <div>
                        {i === 0 && platformStats.revenueBreakdown ? (
                          <AdminRevenueTile data={platformStats.revenueBreakdown} />
                        ) : (
                          <>
                            <div className="flex items-center gap-1.5">
                              <p className="text-xs font-medium text-muted-foreground">{m.label}</p>
                              {deviceBreakdown && m.label === 'Total Leads' && (
                                <DeviceInfoHover wide>
                                  <p className="text-[11px] font-semibold tracking-[0.1em] uppercase text-muted-foreground/60 mb-2">Leads by form &amp; device</p>
                                  <LeadFormsDeviceTable breakdown={deviceBreakdown} forms={ADMIN_LEAD_FORMS} />
                                </DeviceInfoHover>
                              )}
                              {deviceBreakdown && (m.label === 'Total Bookings' || m.label === 'Total Metal IQ') && (
                                <DeviceInfoHover>
                                  <LeadDeviceCounts
                                    title={`${m.label.replace('Total ', '')} by device`}
                                    counts={sumDeviceCounts(deviceBreakdown, m.label === 'Total Bookings' ? ['booking', 'metal_iq_bookings'] : ['metal_iq'])}
                                  />
                                </DeviceInfoHover>
                              )}
                            </div>
                            <p className="text-[32px] font-bold tracking-[-0.03em] text-foreground mt-2">{m.value}</p>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Per-module split */}
            <ModuleSections sections={platformSections} animDelay={0.09} deviceBreakdown={deviceBreakdown} />

            {/* Chart */}
            <SessionsChart
              allLeads={[]}
              widgetViews={{}}
              dateRange={dateRange}
              isGlass={false}
              preAggregatedLeads={platformStats.dailyLeads}
              preAggregatedTraffic={platformStats.dailyTraffic}
            />

            {/* Two-column layout */}
            <div className="mt-10 grid grid-cols-1 lg:grid-cols-5 gap-6 lg:gap-8">
              {/* Left */}
              <div className="lg:col-span-3 space-y-8">
                <AdminTopClientsCard
                  title="Top Clients — Leads"
                  entries={platformStats.topClientsByLeads}
                  animDelay={0.12}
                />
                <AdminTopClientsCard
                  title="Top Clients — AI Generations"
                  entries={platformStats.topClientsByGenerations}
                  animDelay={0.18}
                />
                <AdminTopClientsCard
                  title="Top Clients — Metal IQ"
                  entries={platformStats.topClientsByMetalIQ}
                  animDelay={0.24}
                />
              </div>
              {/* Right */}
              <div className="lg:col-span-2 space-y-8">
                <AdminStatusSummary
                  title="Lead Status"
                  counts={platformStats.leadStatusCounts}
                  animDelay={0.12}
                />
                <AdminStatusSummary
                  title="Booking Status"
                  counts={platformStats.bookingStatusCounts || {}}
                  animDelay={0.15}
                />
                <AdminStatusSummary
                  title="Order Status"
                  counts={platformStats.orderStatusCounts}
                  animDelay={0.18}
                />
                <AdminStatusSummary
                  title="CAD Status"
                  counts={platformStats.cadStatusCounts}
                  animDelay={0.24}
                />
              </div>
            </div>
          </>
        )}

        {/* ====== INDIVIDUAL CLIENT MODE ====== */}
        {!isAllClients && clientStats && (
          <>
            <ModuleSections sections={clientSections} animDelay={0.06} deviceBreakdown={deviceBreakdown} />

            <div className="mt-10 grid grid-cols-1 lg:grid-cols-5 gap-6 lg:gap-8">
              <div className="lg:col-span-3 space-y-8">
                {clientStats.allLeads && (
                  <SessionsChart
                    allLeads={clientStats.allLeads}
                    widgetViews={clientStats.widgetViews}
                    dateRange={dateRange}
                    isGlass={false}
                    preAggregatedTraffic={clientStats.dailyTraffic}
                  />
                )}

                <TrafficOverview
                  stats={clientStats}
                  features={{ metal_buying: true, product_catalogue: true, diamond_form: true, orders: true, custom_enquiry: true, grillz_builder: true, embed_branding: true, jewlx_agent: true }}
                  isGlass={false}
                  animDelay={0.15}
                />

                <RecentLeads
                  leads={clientStats.recentLeads}
                  currency="USD"
                  isGlass={false}
                  animDelay={0.18}
                  tick={tick}
                />
              </div>
              <div className="lg:col-span-2 space-y-8">
                <AIActivityCard
                  stats={clientStats}
                  rangeLabel=""
                  isGlass={false}
                  animDelay={0.12}
                />
                <UpcomingBookings
                  bookings={clientStats.upcomingBookings || []}
                  isGlass={false}
                  animDelay={0.15}
                />
                <RecentOrders
                  orders={clientStats.recentOrders}
                  currency="USD"
                  isGlass={false}
                  animDelay={0.18}
                />
                <LeadSources
                  stats={clientStats}
                  hasRingOS={true}
                  hasCustomX={true}
                  hasMetalBuying={true}
                  isGlass={false}
                  animDelay={0.24}
                />
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
