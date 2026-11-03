import { useMemo, useState } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { format, eachDayOfInterval } from 'date-fns';
import { cn } from '@/lib/utils';

interface LeadItem {
  id: string;
  created_at: string;
  source: string;
}

interface WidgetViewStats {
  total: number;
  unique: number;
}

interface SessionsChartProps {
  allLeads: LeadItem[];
  widgetViews: Record<string, WidgetViewStats>;
  dateRange: { from?: Date; to?: Date };
  isGlass?: boolean;
  /** Pre-aggregated daily leads from the dashboard endpoint */
  preAggregatedLeads?: { date: string; count: number }[];
  /**
   * Pre-aggregated daily widget views from the dashboard endpoint.
   *
   * This series MUST come from the server. The chart used to query
   * `analytics_events` straight from the browser, which returned an empty set
   * for staff users (RLS only covers admins and the client owner) and was
   * capped at 5000 unordered rows — so staff saw a flat zero line while the
   * Traffic Overview tiles right below showed real numbers.
   */
  preAggregatedTraffic?: { date: string; count: number }[];
}

type ChartMode = 'leads' | 'traffic';

export function SessionsChart({
  allLeads, dateRange, isGlass,
  preAggregatedLeads, preAggregatedTraffic,
}: SessionsChartProps) {
  const [mode, setMode] = useState<ChartMode>('leads');

  const from = dateRange.from || new Date(Date.now() - 30 * 86400000);
  const to = dateRange.to || new Date();

  // Build chart data from pre-aggregated or from allLeads
  const leadChartData = useMemo(() => {
    const days = eachDayOfInterval({ start: from, end: to });

    if (preAggregatedLeads) {
      const map = new Map(preAggregatedLeads.map(d => [d.date, d.count]));
      return days.map(day => {
        const key = format(day, 'yyyy-MM-dd');
        return { date: key, label: format(day, 'MMM d'), leads: map.get(key) || 0 };
      });
    }

    const leadsByDay = new Map<string, number>();
    allLeads.forEach(lead => {
      if (!lead.created_at) return;
      const dayKey = format(new Date(lead.created_at), 'yyyy-MM-dd');
      leadsByDay.set(dayKey, (leadsByDay.get(dayKey) || 0) + 1);
    });

    return days.map(day => {
      const key = format(day, 'yyyy-MM-dd');
      return { date: key, label: format(day, 'MMM d'), leads: leadsByDay.get(key) || 0 };
    });
  }, [allLeads, preAggregatedLeads, from.getTime(), to.getTime()]);

  const trafficChartData = useMemo(() => {
    const days = eachDayOfInterval({ start: from, end: to });
    const map = new Map((preAggregatedTraffic || []).map(d => [d.date, d.count]));
    return days.map(day => {
      const key = format(day, 'yyyy-MM-dd');
      return { date: key, label: format(day, 'MMM d'), views: map.get(key) || 0 };
    });
  }, [preAggregatedTraffic, from.getTime(), to.getTime()]);

  const chartData = mode === 'leads' ? leadChartData : trafficChartData;
  const dataKey = mode === 'leads' ? 'leads' : 'views';
  const dataLabel = mode === 'leads' ? 'Leads' : 'Views';
  const maxValue = Math.max(...chartData.map(d => (d as any)[dataKey] || 0), 1);
  const isEmpty = chartData.every(d => !(d as any)[dataKey]);

  if (chartData.length === 0) return null;

  return (
    <div className={cn("mt-10", isGlass ? "glass-panel rounded-2xl p-6" : "")}>
      <div className="flex items-center justify-between mb-4">
        <p className="text-[11px] font-semibold tracking-[0.1em] uppercase text-muted-foreground/60">
          {mode === 'leads' ? 'Lead Activity' : 'Traffic Activity'}
        </p>
        <div className="flex items-center border border-border rounded-lg p-0.5 gap-0.5">
          <button
            onClick={() => setMode('leads')}
            className={cn(
              "px-3 py-1 text-[11px] font-medium rounded-md transition-colors",
              mode === 'leads'
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            Leads
          </button>
          <button
            onClick={() => setMode('traffic')}
            className={cn(
              "px-3 py-1 text-[11px] font-medium rounded-md transition-colors",
              mode === 'traffic'
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            Traffic
          </button>
        </div>
      </div>
      {mode === 'traffic' && isEmpty && (
        <p className="text-[11px] text-muted-foreground/70 mb-3">
          No widget views recorded in the selected date range. A view is counted when an
          embedded widget actually loads on your site — try widening the date range.
        </p>
      )}
      <div className="h-[220px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.3} vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
              axisLine={false}
              tickLine={false}
              interval={Math.max(Math.floor(chartData.length / 7) - 1, 0)}
            />
            <YAxis
              tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
              axisLine={false}
              tickLine={false}
              allowDecimals={false}
              domain={[0, maxValue + 1]}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'hsl(var(--card))',
                border: '1px solid hsl(var(--border))',
                borderRadius: '8px',
                fontSize: '12px',
                color: 'hsl(var(--foreground))',
              }}
              labelStyle={{ color: 'hsl(var(--muted-foreground))', fontWeight: 600 }}
              formatter={(value: number) => [value, dataLabel]}
            />
            <Area
              type="monotone"
              dataKey={dataKey}
              stroke="hsl(var(--primary))"
              strokeWidth={2}
              fill="url(#chartGradient)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
