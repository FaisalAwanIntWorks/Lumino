import { cn } from '@/lib/utils';
import type { DashboardStats } from '@/hooks/useClientDashboard';

interface AIActivityCardProps {
  stats: DashboardStats;
  rangeLabel: string;
  isGlass: boolean;
  animDelay: number;
}

export function AIActivityCard({ stats, rangeLabel, isGlass, animDelay }: AIActivityCardProps) {
  if (stats.totalAIConfigurations === 0 && stats.totalChatSessions === 0) return null;

  return (
    <div className={cn(isGlass ? "glass-panel rounded-2xl p-6" : "")}
      style={{ opacity: 0, animation: `fadeUpIn 0.4s ease-out ${animDelay}s forwards` }}
    >
      <p className="text-[11px] font-semibold tracking-[0.1em] uppercase mb-4 text-muted-foreground/60">
        AI Activity
      </p>
      <div className="grid grid-cols-2 gap-5">
        <div className="neu-card p-5">
          <p className="text-xs font-semibold text-muted-foreground">AI Renders</p>
          <p className="text-2xl font-bold tracking-tight text-foreground mt-1">{stats.totalAIConfigurations}</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">image generations</p>
        </div>
        <div className="neu-card p-5">
          <p className="text-xs font-semibold text-muted-foreground">Chat Sessions</p>
          <p className="text-2xl font-bold tracking-tight text-foreground mt-1">{stats.totalChatSessions}</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">{rangeLabel}</p>
        </div>
      </div>
    </div>
  );
}
