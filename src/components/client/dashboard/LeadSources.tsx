import { useMemo } from 'react';
import { cn } from '@/lib/utils';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import type { DashboardStats } from '@/hooks/useClientDashboard';

const SOURCE_LABELS: Record<string, string> = {
  widget: 'Saved Designs',
  deposit: 'Deposits',
  ring_builder: 'Ring Builder',
  diamond_form: 'Instant Quote',
  grill_form: 'Grillz',
  custom_enquiry: 'Custom',
  booking: 'Booking',
  metal_iq: 'Metal IQ Leads',
  metal_iq_bookings: 'Metal IQ Bookings',
};

const SOURCE_COLORS: Record<string, string> = {
  widget: '#50c878',
  deposit: '#22c55e',
  ring_builder: '#34d399',
  diamond_form: '#93c5fd',
  grill_form: '#fbbf24',
  custom_enquiry: '#d8b4fe',
  booking: '#3b82f6',
  metal_iq: '#f59e0b',
  metal_iq_bookings: '#8b5cf6',
};

interface LeadSourcesProps {
  stats: DashboardStats;
  hasRingOS: boolean;
  hasCustomX: boolean;
  hasMetalBuying: boolean;
  isGlass: boolean;
  animDelay: number;
}

function PieGroup({ entries, label }: { entries: [string, number][]; label: string }) {
  const total = entries.reduce((s, [, v]) => s + v, 0);
  if (entries.length === 0 || total === 0) return null;

  const data = entries.map(([key, count]) => ({
    name: SOURCE_LABELS[key] || key,
    value: count,
    color: SOURCE_COLORS[key] || '#888',
  }));

  return (
    <div className="mb-6 last:mb-0">
      <p className="text-[10px] font-semibold tracking-[0.08em] uppercase mb-3 text-muted-foreground/40">{label}</p>
      <div className="flex items-center gap-4">
        <div className="w-[100px] h-[100px] flex-shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={28}
                outerRadius={46}
                strokeWidth={1}
                stroke="hsl(var(--background))"
              >
                {data.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  background: 'hsl(var(--popover))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: 8,
                  fontSize: 12,
                  color: 'hsl(var(--foreground))',
                }}
                itemStyle={{ color: 'hsl(var(--foreground))' }}
                labelStyle={{ color: 'hsl(var(--foreground))' }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="flex-1 space-y-1.5">
          {data.map((entry) => (
            <div key={entry.name} className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
                <span className="text-xs font-medium text-foreground">{entry.name}</span>
              </div>
              <span className="text-sm font-bold text-foreground">{entry.value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function LeadSources({ stats, hasRingOS, hasCustomX, hasMetalBuying, isGlass, animDelay }: LeadSourcesProps) {
  const sourceEntries = useMemo(() =>
    Object.entries(stats.leadSources).filter(([, v]) => v > 0),
    [stats.leadSources]
  );

  if (sourceEntries.length === 0) return null;

  const RING_OS_SOURCES = ['widget', 'deposit', 'booking'];
  const CUSTOM_X_SOURCES = ['grill_form', 'custom_enquiry', 'ring_builder', 'diamond_form'];
  const METAL_IQ_SOURCES = ['metal_iq', 'metal_iq_bookings'];
  const ringOSEntries = sourceEntries.filter(([key]) => RING_OS_SOURCES.includes(key)) as [string, number][];
  const customXEntries = sourceEntries.filter(([key]) => CUSTOM_X_SOURCES.includes(key)) as [string, number][];
  const metalIQEntries = sourceEntries.filter(([key]) => METAL_IQ_SOURCES.includes(key)) as [string, number][];

  return (
    <div className={cn(isGlass ? "glass-panel rounded-2xl p-6" : "")}
      style={{ opacity: 0, animation: `fadeUpIn 0.4s ease-out ${animDelay}s forwards` }}
    >
      <p className="text-[11px] font-semibold tracking-[0.1em] uppercase mb-4 text-muted-foreground/60">Lead Sources</p>

      {hasRingOS && <PieGroup entries={ringOSEntries} label="Ring OS" />}
      {hasCustomX && <PieGroup entries={customXEntries} label="Custom X" />}
      {hasMetalBuying && <PieGroup entries={metalIQEntries} label="Metal IQ" />}
    </div>
  );
}
