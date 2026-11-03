import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, AlertTriangle, XCircle, Clock } from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import {
  CATEGORY_ORDER, fmtDurationRange, fmtPassed, passColor,
  type HealthCheckRow, type HealthStatus, type OverviewRow,
} from './types';

const statusConfig: Record<HealthStatus, { label: string; icon: typeof CheckCircle2; color: string; bg: string; badge: 'success' | 'warning' | 'destructive' }> = {
  operational: { label: 'Operational', icon: CheckCircle2, color: 'text-emerald-500', bg: 'bg-emerald-500/10', badge: 'success' },
  degraded: { label: 'Degraded', icon: AlertTriangle, color: 'text-yellow-500', bg: 'bg-yellow-500/10', badge: 'warning' },
  down: { label: 'Down', icon: XCircle, color: 'text-red-500', bg: 'bg-red-500/10', badge: 'destructive' },
};

interface Props {
  checks: HealthCheckRow[];
  overview7: OverviewRow[];
  overview30: OverviewRow[];
  loading: boolean;
}

// One scheduled check a day plus a margin before calling the data stale.
const STALE_AFTER_MS = 26 * 60 * 60 * 1000;

export function StatusTab({ checks, overview7, overview30, loading }: Props) {
  const newest = checks.reduce<string | null>((m, c) => (m === null || c.checked_at > m ? c.checked_at : m), null);
  // Only the most recent run describes "now". A component missing from it is
  // shown with the age of its own last check instead of being passed off as current.
  const newestMs = newest ? new Date(newest).getTime() : 0;
  const isFromLatestRun = (c: HealthCheckRow) => newestMs - new Date(c.checked_at).getTime() < 10 * 60 * 1000;

  const grouped = CATEGORY_ORDER.map(cat => ({
    category: cat,
    services: checks.filter(s => s.category === cat).sort((a, b) => a.component.localeCompare(b.component)),
  })).filter(g => g.services.length > 0);

  const ov7 = new Map(overview7.map(o => [o.component, o]));
  const ov30 = new Map(overview30.map(o => [o.component, o]));

  const current = checks.filter(isFromLatestRun);
  const allOperational = current.length > 0 && current.every(s => s.status === 'operational');
  const hasDown = current.some(s => s.status === 'down');
  const issues = current.filter(s => s.status !== 'operational');
  const stale = newest ? Date.now() - newestMs > STALE_AFTER_MS : false;
  const latestSource = current[0]?.source;

  return (
    <div className="space-y-6">
      {checks.length > 0 && (
        <Card className={`border-2 ${stale ? 'border-yellow-500/30 bg-yellow-500/5' : allOperational ? 'border-emerald-500/30 bg-emerald-500/5' : hasDown ? 'border-red-500/30 bg-red-500/5' : 'border-yellow-500/30 bg-yellow-500/5'}`}>
          <CardContent className="py-4 flex flex-col sm:flex-row sm:items-center gap-3">
            {stale ? (
              <>
                <AlertTriangle className="h-6 w-6 text-yellow-500 shrink-0" />
                <div>
                  <p className="font-semibold text-yellow-700 dark:text-yellow-400">These results are out of date</p>
                  <p className="text-sm text-muted-foreground">
                    The last check ran {formatDistanceToNow(new Date(newest!), { addSuffix: true })}. The daily check has not run since, so the status below may no longer be true. Run a check now.
                  </p>
                </div>
              </>
            ) : allOperational ? (
              <>
                <CheckCircle2 className="h-6 w-6 text-emerald-500 shrink-0" />
                <div>
                  <p className="font-semibold text-emerald-700 dark:text-emerald-400">All checks passed</p>
                  <p className="text-sm text-muted-foreground">All {current.length} services passed the last check</p>
                </div>
              </>
            ) : (
              <>
                {hasDown ? <XCircle className="h-6 w-6 text-red-500 shrink-0" /> : <AlertTriangle className="h-6 w-6 text-yellow-500 shrink-0" />}
                <div>
                  <p className={`font-semibold ${hasDown ? 'text-red-700 dark:text-red-400' : 'text-yellow-700 dark:text-yellow-400'}`}>
                    {issues.length} of {current.length} services failed the last check
                  </p>
                  <p className="text-sm text-muted-foreground">{issues.map(i => i.component).join(' · ')}</p>
                </div>
              </>
            )}
            {newest && (
              <span className="sm:ml-auto text-xs flex items-center gap-1 text-muted-foreground whitespace-nowrap">
                <Clock className="h-3 w-3" />
                {format(new Date(newest), 'MMM d, HH:mm')} · {latestSource === 'cron' ? 'scheduled check' : 'manual check'}
              </span>
            )}
          </CardContent>
        </Card>
      )}

      {checks.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Each card shows the result of one check at the time above. Services are checked once a day (06:00 UTC) and whenever you run a check, not watched continuously.
        </p>
      )}

      {grouped.map(({ category, services }) => (
        <div key={category}>
          <h2 className="text-lg font-semibold mb-3 text-foreground">{category}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {services.map(svc => {
              const cfg = statusConfig[svc.status];
              const Icon = cfg.icon;
              const o7 = ov7.get(svc.component);
              const o30 = ov30.get(svc.component);
              const fresh = isFromLatestRun(svc);
              const coverage = (svc.details as { coverage_note?: string })?.coverage_note;
              return (
                <Card key={svc.component} className={`hover:shadow-md transition-shadow ${fresh ? '' : 'opacity-70'}`}>
                  <CardContent className="p-4 flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-sm truncate">{svc.component}</span>
                      <div className={`p-1.5 rounded-full ${cfg.bg}`}>
                        <Icon className={`h-4 w-4 ${cfg.color}`} />
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <Badge variant={cfg.badge} className="text-[10px]">{cfg.label}</Badge>
                      {svc.latency_ms != null && svc.latency_ms > 0 && (
                        <span className="text-xs text-muted-foreground" title="Response time of this one check">{svc.latency_ms}ms</span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">{svc.message}</p>
                    {coverage && <p className="text-[10px] text-muted-foreground/70">{coverage}</p>}
                    {!fresh && (
                      <p className="text-[11px] text-yellow-500">
                        Not part of the last run. Last checked {formatDistanceToNow(new Date(svc.checked_at), { addSuffix: true })}.
                      </p>
                    )}
                    <div className="flex items-center justify-between text-[11px] pt-1 border-t border-border/60">
                      <span className="text-muted-foreground">Checks passed, 7 days</span>
                      <span className={`font-medium ${passColor(o7?.checks_ok, o7?.checks_total)}`}>{fmtPassed(o7?.checks_ok, o7?.checks_total)}</span>
                    </div>
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-muted-foreground">Checks passed, 30 days</span>
                      <span className={`font-medium ${passColor(o30?.checks_ok, o30?.checks_total)}`}>{fmtPassed(o30?.checks_ok, o30?.checks_total)}</span>
                    </div>
                    {o30 && Number(o30.incidents) > 0 && (
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-muted-foreground">Incidents, 30 days</span>
                        <span className="font-medium" title="Shortest and longest the problem can have lasted, given when checks ran">
                          {o30.incidents} · {fmtDurationRange(o30.downtime_min_seconds, o30.downtime_max_seconds)}
                        </span>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      ))}

      {loading && checks.length === 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-4 space-y-3">
                <div className="h-4 bg-muted rounded animate-pulse w-3/4" />
                <div className="h-6 bg-muted rounded animate-pulse w-1/2" />
                <div className="h-3 bg-muted rounded animate-pulse w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {!loading && checks.length === 0 && (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No health checks recorded in the last 7 days. Click <strong>Run check now</strong> to check every service.
          </CardContent>
        </Card>
      )}
    </div>
  );
}
