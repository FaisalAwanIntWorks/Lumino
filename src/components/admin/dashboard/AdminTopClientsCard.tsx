import { cn } from '@/lib/utils';

interface ClientEntry {
  id: string;
  name: string;
  count: number;
}

interface AdminTopClientsCardProps {
  title: string;
  entries: ClientEntry[];
  animDelay?: number;
}

export function AdminTopClientsCard({ title, entries, animDelay = 0 }: AdminTopClientsCardProps) {
  if (entries.length === 0) return null;

  const max = entries[0]?.count || 1;

  return (
    <div
      className="neu-card neu-static p-5 sm:p-6"
      style={{ opacity: 0, animation: `fadeUpIn 0.4s ease-out ${animDelay}s forwards` }}
    >
      <p className="text-[11px] font-semibold tracking-[0.1em] uppercase mb-4 text-muted-foreground/60">
        {title}
      </p>
      <div className="space-y-3">
        {entries.map((e, i) => (
          <div key={e.id} className="flex items-center gap-3">
            <span className="text-xs font-medium text-muted-foreground w-5 text-right">{i + 1}</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium text-foreground truncate">{e.name}</span>
                <span className="text-sm font-bold text-foreground ml-2">{e.count}</span>
              </div>
              <div className="neu-inset h-2 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full bg-primary transition-all duration-500"
                  style={{ width: `${(e.count / max) * 100}%` }}
                />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
