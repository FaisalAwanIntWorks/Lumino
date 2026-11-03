import { useEffect, useState, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/pricing-utils';
import {
  RefreshCw, DollarSign, Users, TrendingUp, TrendingDown,
  CreditCard, AlertTriangle, BarChart3,
} from 'lucide-react';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts';
import { formatDistanceToNow } from 'date-fns';

interface SaaSData {
  kpis: {
    totalClients: number;
    newThisMonth: number;
    churnedThisMonth: number;
    mrr: number;
    totalStripeRevenue: number;
    failedPayments: number;
    avgRevenuePerClient: number;
    activeSubscriptions: number;
    trialingSubscriptions: number;
    pastDueSubscriptions: number;
  };
  charts: {
    mrrOverTime: { month: string; mrr: number }[];
    growthOverTime: { month: string; newClients: number; cancellations: number }[];
    planDistribution: { name: string; count: number }[];
    revenueByPlan: { name: string; revenue: number }[];
  };
  tables: {
    topClientsByRevenue: { name: string; revenue: number }[];
    topClientsByAI: { name: string; usage: number }[];
    recentSignups: { name: string; status: string; created_at: string }[];
    recentEvents?: { id: string; type: string; category: string; description: string; admin: string; client: string | null; created_at: string }[];
  };
}

type DateRange = '7d' | '30d' | '90d' | '12m' | 'all';

const PIE_COLORS = ['#22c55e', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];

function useAnimatedNumber(target: number, duration = 600) {
  const [value, setValue] = useState(0);
  const ref = useRef<number>();
  useEffect(() => {
    const start = value;
    const diff = target - start;
    if (diff === 0) return;
    const startTime = performance.now();
    const animate = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(start + diff * eased));
      if (progress < 1) ref.current = requestAnimationFrame(animate);
    };
    ref.current = requestAnimationFrame(animate);
    return () => { if (ref.current) cancelAnimationFrame(ref.current); };
  }, [target]);
  return value;
}

function AnimatedKPI({ value, isCurrency }: { value: number; isCurrency?: boolean }) {
  const animated = useAnimatedNumber(value);
  return <>{isCurrency ? formatCurrency(animated) : animated.toLocaleString()}</>;
}

export default function SaaSDashboard() {
  const [data, setData] = useState<SaaSData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [dateRange, setDateRange] = useState<DateRange>('all');

  useEffect(() => { fetchData(); }, [dateRange]);

  const fetchData = async (isManual = false) => {
    try {
      if (isManual) setRefreshing(true);
      else setLoading(true);

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const { data: result, error } = await supabase.functions.invoke('saas-dashboard', {
        body: { dateRange },
      });

      if (error) throw error;
      if (result?.error) throw new Error(result.error);

      setData(result as SaaSData);
      if (isManual) toast.success('SaaS dashboard refreshed');
    } catch (error) {
      console.error('Error fetching SaaS dashboard:', error);
      toast.error('Failed to load SaaS dashboard data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const kpiCards = data ? [
    { label: 'MRR', value: data.kpis.mrr, isCurrency: true, icon: DollarSign, accent: 'from-emerald-500/20 to-emerald-500/5', iconBg: 'bg-emerald-500/10 text-emerald-600' },
    { label: 'Total Revenue', value: data.kpis.totalStripeRevenue, isCurrency: true, icon: TrendingUp, accent: 'from-blue-500/20 to-blue-500/5', iconBg: 'bg-blue-500/10 text-blue-600' },
    { label: 'Total Clients', value: data.kpis.totalClients, icon: Users, accent: 'from-violet-500/20 to-violet-500/5', iconBg: 'bg-violet-500/10 text-violet-600', note: `${data.kpis.newThisMonth} new this month` },
    { label: 'Active Subscriptions', value: data.kpis.activeSubscriptions, icon: CreditCard, accent: 'from-amber-500/20 to-amber-500/5', iconBg: 'bg-amber-500/10 text-amber-600', note: `${data.kpis.trialingSubscriptions} trialing` },
    { label: 'Churned This Month', value: data.kpis.churnedThisMonth, icon: TrendingDown, accent: 'from-red-500/20 to-red-500/5', iconBg: 'bg-red-500/10 text-red-600' },
    { label: 'Failed Payments', value: data.kpis.failedPayments, icon: AlertTriangle, accent: 'from-orange-500/20 to-orange-500/5', iconBg: 'bg-orange-500/10 text-orange-600' },
    { label: 'Avg Revenue/Client', value: data.kpis.avgRevenuePerClient, isCurrency: true, icon: BarChart3, accent: 'from-cyan-500/20 to-cyan-500/5', iconBg: 'bg-cyan-500/10 text-cyan-600' },
    { label: 'Past Due', value: data.kpis.pastDueSubscriptions, icon: AlertTriangle, accent: 'from-rose-500/20 to-rose-500/5', iconBg: 'bg-rose-500/10 text-rose-600' },
  ] : [];

  return (
    <div className="bg-background min-h-screen">
      <div className="pt-[52px] px-4 sm:px-8 lg:px-12 pb-[80px]">
        {/* Header */}
        <div className="flex items-center justify-between animate-in fade-in slide-in-from-bottom-2 duration-500">
          <div>
            <h1 className="text-2xl sm:text-[28px] font-bold tracking-tight text-foreground">SaaS Dashboard</h1>
            <p className="text-[13px] font-medium text-muted-foreground mt-0.5">
              Revenue, subscriptions & business health
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => fetchData(true)} disabled={refreshing} className="gap-2">
            <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
            Refresh
          </Button>
        </div>

        {/* Date Filter */}
        <div className="mt-6 flex items-center gap-1.5 flex-wrap animate-in fade-in slide-in-from-bottom-2 duration-500 delay-100">
          {(['7d', '30d', '90d', '12m', 'all'] as DateRange[]).map(preset => (
            <button
              key={preset}
              onClick={() => setDateRange(preset)}
              className={cn(
                'px-3 py-1.5 rounded-md text-xs font-semibold transition-all duration-200',
                dateRange === preset
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'bg-muted/50 text-muted-foreground hover:bg-muted'
              )}
            >
              {preset === 'all' ? 'All Time' : preset === '12m' ? '12 Months' : preset}
            </button>
          ))}
        </div>

        {loading && (
          <div className="mt-8">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {[1, 2, 3, 4, 5, 6, 7, 8].map(i => <Skeleton key={i} className="h-28 rounded-xl" />)}
            </div>
          </div>
        )}

        {!loading && data && (
          <>
            {/* KPI Grid */}
            <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 animate-in fade-in slide-in-from-bottom-3 duration-500 delay-150">
              {kpiCards.map((kpi) => {
                const Icon = kpi.icon;
                return (
                  <div key={kpi.label} className={cn('group relative rounded-xl border border-border/40 p-5 transition-all duration-300 bg-gradient-to-br', kpi.accent, 'hover:border-border/60 hover:shadow-md')}>
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{kpi.label}</p>
                        <p className="text-[28px] font-bold tracking-tight text-foreground mt-1.5 tabular-nums">
                          <AnimatedKPI value={kpi.value} isCurrency={kpi.isCurrency} />
                        </p>
                        {(kpi as any).note && <p className="text-[11px] font-medium text-muted-foreground/70 mt-0.5">{(kpi as any).note}</p>}
                      </div>
                      <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center', kpi.iconBg)}>
                        <Icon className="w-4 h-4" />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Charts Row 1: MRR + Growth */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-8">
              <div className="rounded-xl border border-border/40 bg-card/50 p-5">
                <p className="text-[11px] font-semibold tracking-[0.1em] uppercase mb-4 text-muted-foreground/60">Revenue Over Time (12 Months)</p>
                <div className="h-[220px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={data.charts.mrrOverTime} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="mrrGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                          <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
                      <YAxis hide />
                      <Tooltip contentStyle={{ fontSize: 12, borderRadius: 10, border: '1px solid hsl(var(--border))', background: 'hsl(var(--card))' }} formatter={(v: number) => [formatCurrency(v), 'Revenue']} />
                      <Area type="monotone" dataKey="mrr" stroke="hsl(var(--primary))" strokeWidth={2} fill="url(#mrrGrad)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="rounded-xl border border-border/40 bg-card/50 p-5">
                <p className="text-[11px] font-semibold tracking-[0.1em] uppercase mb-4 text-muted-foreground/60">New Clients vs Cancellations</p>
                <div className="h-[220px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data.charts.growthOverTime} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
                      <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
                      <YAxis hide />
                      <Tooltip contentStyle={{ fontSize: 12, borderRadius: 10, border: '1px solid hsl(var(--border))', background: 'hsl(var(--card))' }} />
                      <Bar dataKey="newClients" fill="#22c55e" radius={[4, 4, 0, 0]} name="New Clients" />
                      <Bar dataKey="cancellations" fill="#ef4444" radius={[4, 4, 0, 0]} name="Cancellations" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            {/* Charts Row 2: Plan Distribution + Revenue by Plan */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-8">
              <div className="rounded-xl border border-border/40 bg-card/50 p-5">
                <p className="text-[11px] font-semibold tracking-[0.1em] uppercase mb-4 text-muted-foreground/60">Plan Distribution</p>
                <div className="h-[250px]">
                  {data.charts.planDistribution.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-16 text-center">No subscriptions yet</p>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={data.charts.planDistribution}
                          dataKey="count"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          outerRadius={80}
                          label={({ name, count }) => `${name} (${count})`}
                        >
                          {data.charts.planDistribution.map((_, i) => (
                            <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                          ))}
                        </Pie>
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>

              <div className="rounded-xl border border-border/40 bg-card/50 p-5">
                <p className="text-[11px] font-semibold tracking-[0.1em] uppercase mb-4 text-muted-foreground/60">Revenue by Plan</p>
                <div className="h-[250px]">
                  {data.charts.revenueByPlan.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-16 text-center">No revenue data yet</p>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={data.charts.revenueByPlan} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
                        <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                        <YAxis hide />
                        <Tooltip contentStyle={{ fontSize: 12, borderRadius: 10, border: '1px solid hsl(var(--border))', background: 'hsl(var(--card))' }} formatter={(v: number) => [formatCurrency(v), 'Revenue']} />
                        <Bar dataKey="revenue" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>
            </div>

            {/* Tables */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-8">
              {/* Top Clients by Revenue */}
              <div className="rounded-xl border border-border/40 bg-card/50 p-5">
                <p className="text-[11px] font-semibold tracking-[0.1em] uppercase mb-4 text-muted-foreground/60">Top Clients by Revenue</p>
                {data.tables.topClientsByRevenue.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-6 text-center">No data</p>
                ) : (
                  data.tables.topClientsByRevenue.map((c, i) => (
                    <div key={c.name} className={cn('flex items-center justify-between py-2.5', i < data.tables.topClientsByRevenue.length - 1 && 'border-b border-border/15')}>
                      <p className="text-sm font-medium text-foreground truncate">{c.name}</p>
                      <span className="text-sm font-semibold tabular-nums text-foreground">{formatCurrency(c.revenue)}</span>
                    </div>
                  ))
                )}
              </div>

              {/* Top Clients by AI */}
              <div className="rounded-xl border border-border/40 bg-card/50 p-5">
                <p className="text-[11px] font-semibold tracking-[0.1em] uppercase mb-4 text-muted-foreground/60">Top Clients by AI Usage</p>
                {data.tables.topClientsByAI.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-6 text-center">No AI usage</p>
                ) : (
                  data.tables.topClientsByAI.map((c, i) => (
                    <div key={c.name} className={cn('flex items-center justify-between py-2.5', i < data.tables.topClientsByAI.length - 1 && 'border-b border-border/15')}>
                      <p className="text-sm font-medium text-foreground truncate">{c.name}</p>
                      <span className="text-xs font-semibold tabular-nums text-primary">{c.usage} req</span>
                    </div>
                  ))
                )}
              </div>

              {/* Recent Signups */}
              <div className="rounded-xl border border-border/40 bg-card/50 p-5">
                <p className="text-[11px] font-semibold tracking-[0.1em] uppercase mb-4 text-muted-foreground/60">Recent Signups</p>
                {data.tables.recentSignups.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-6 text-center">No signups</p>
                ) : (
                  data.tables.recentSignups.slice(0, 10).map((c, i) => (
                    <div key={`${c.name}-${i}`} className={cn('flex items-center justify-between py-2.5', i < Math.min(data.tables.recentSignups.length, 10) - 1 && 'border-b border-border/15')}>
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: c.status === 'active' ? '#22c55e' : c.status === 'trial' ? '#3b82f6' : '#9ca3af' }} />
                        <p className="text-sm font-medium text-foreground truncate">{c.name}</p>
                      </div>
                      <span className="text-xs text-muted-foreground shrink-0 ml-2">
                        {formatDistanceToNow(new Date(c.created_at), { addSuffix: true })}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Recent Activity Events */}
            {(data.tables.recentEvents?.length ?? 0) > 0 && (
              <div className="mt-8 rounded-xl border border-border/40 bg-card/50 p-5 animate-in fade-in slide-in-from-bottom-3 duration-500">
                <p className="text-[11px] font-semibold tracking-[0.1em] uppercase mb-4 text-muted-foreground/60">Recent Activity</p>
                <div className="divide-y divide-border/15">
                  {data.tables.recentEvents!.slice(0, 20).map((evt) => (
                    <div key={evt.id} className="flex items-center justify-between py-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-foreground truncate">{evt.description}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {evt.admin}{evt.client ? ` · ${evt.client}` : ''} · {evt.category}
                        </p>
                      </div>
                      <span className="text-xs text-muted-foreground shrink-0 ml-4">
                        {formatDistanceToNow(new Date(evt.created_at), { addSuffix: true })}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
