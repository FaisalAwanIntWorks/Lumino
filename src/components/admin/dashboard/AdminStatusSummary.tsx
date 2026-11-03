import { cn } from '@/lib/utils';

interface AdminStatusSummaryProps {
  title: string;
  counts: Record<string, number>;
  animDelay?: number;
}

const statusColors: Record<string, string> = {
  pending: 'bg-yellow-500/20 text-yellow-700 dark:text-yellow-400',
  new: 'bg-blue-500/20 text-blue-700 dark:text-blue-400',
  confirmed: 'bg-green-500/20 text-green-700 dark:text-green-400',
  in_progress: 'bg-blue-500/20 text-blue-700 dark:text-blue-400',
  completed: 'bg-green-500/20 text-green-700 dark:text-green-400',
  approved: 'bg-green-500/20 text-green-700 dark:text-green-400',
  cancelled: 'bg-red-500/20 text-red-700 dark:text-red-400',
  revision_requested: 'bg-orange-500/20 text-orange-700 dark:text-orange-400',
  shipped: 'bg-cyan-500/20 text-cyan-700 dark:text-cyan-400',
  delivered: 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-400',
  paid: 'bg-green-500/20 text-green-700 dark:text-green-400',
  refunded: 'bg-red-500/20 text-red-700 dark:text-red-400',
};

function formatStatus(s: string) {
  return s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

export function AdminStatusSummary({ title, counts, animDelay = 0 }: AdminStatusSummaryProps) {
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  if (entries.length === 0) return null;

  return (
    <div className="neu-card neu-static p-5 sm:p-6" style={{ opacity: 0, animation: `fadeUpIn 0.4s ease-out ${animDelay}s forwards` }}>
      <p className="text-[11px] font-semibold tracking-[0.1em] uppercase mb-3 text-muted-foreground/60">
        {title}
      </p>
      <div className="flex flex-wrap gap-3">
        {entries.map(([status, count]) => (
          <span
            key={status}
            className={cn(
              'neu-pill inline-flex items-center gap-2 pl-3 pr-1.5 py-1.5 text-xs font-medium text-foreground'
            )}
          >
            {formatStatus(status)}
            <span className={cn('min-w-[1.5rem] text-center rounded-full px-1.5 py-0.5 font-bold', statusColors[status] || 'bg-muted text-muted-foreground')}>
              {count}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}
