import { useMemo } from 'react';
import { cn } from '@/lib/utils';
import type { DashboardStats } from '@/hooks/useClientDashboard';

interface TrafficOverviewProps {
  stats: DashboardStats;
  features: Record<string, any>;
  isGlass: boolean;
  animDelay: number;
}

export function TrafficOverview({ stats, features, isGlass, animDelay }: TrafficOverviewProps) {
  const trafficSources = useMemo(() => {
    const allSources = [
      { key: 'aurezo_widget' as const, label: 'Ring OS', color: '#50c878', featureKey: 'product_catalogue' },
      { key: 'ring_builder' as const, label: 'Ring Builder', color: '#93c5fd', featureKey: 'diamond_form' },
      { key: 'grillz_builder' as const, label: 'Grillz Builder', color: '#fbbf24', featureKey: 'grillz_builder' },
      { key: 'custom_enquiry' as const, label: 'Custom Enquiry', color: '#d8b4fe', featureKey: 'custom_enquiry' },
      { key: 'metal_buying' as const, label: 'Metal IQ', color: '#f59e0b', featureKey: 'metal_buying' },
    ];
    return allSources.filter(s => features[s.featureKey]);
  }, [features]);

  if (!stats?.widgetViews || trafficSources.length === 0) return null;

  return (
    <div className={cn(isGlass ? "glass-panel rounded-2xl p-6" : "")}
      style={{ opacity: 0, animation: `fadeUpIn 0.4s ease-out ${animDelay}s forwards` }}
    >
      <p className="text-[11px] font-semibold tracking-[0.1em] uppercase mb-4 text-muted-foreground/60">
        Traffic Overview
      </p>
      <p className="text-xs mb-5 text-muted-foreground">
        Widget views across your active funnels, for the selected date range.
      </p>
      <div className={cn("grid gap-5", trafficSources.length <= 2 ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-2 sm:grid-cols-3")}>
        {trafficSources.map((item) => {
          const data = stats.widgetViews?.[item.key] ?? { total: 0, unique: 0 };
          return (
            <div
              key={item.key}
              className="neu-card p-5"
            >
              <div className="flex items-center gap-2 mb-3">
                <span className="neu-inset w-6 h-6 rounded-full flex items-center justify-center"><span className="w-2 h-2 rounded-full" style={{ backgroundColor: item.color }} /></span>
                <p className="text-xs font-semibold text-muted-foreground">{item.label}</p>
              </div>
              <p className="text-2xl font-bold tracking-tight text-foreground">{data.total.toLocaleString()}</p>
              <p className="text-[11px] font-medium mt-0.5 text-muted-foreground">views</p>
              <p className="text-[11px] mt-1 text-muted-foreground/70">
                {data.unique.toLocaleString()} unique {data.unique === 1 ? 'visitor' : 'visitors'}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
