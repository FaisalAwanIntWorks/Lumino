import { stickyHeaderTableClass } from "@/components/ui/table";
import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { format } from 'date-fns';
import {
  fmtDurationRange, fmtNumber, fmtPassed, incidentBounds, passColor,
  type IncidentRow, type OverviewRow, type TrendRow,
} from './types';

interface Props {
  days: number;
  onDaysChange: (d: number) => void;
  overview: OverviewRow[];
  trend: TrendRow[];
  incidents: IncidentRow[];
  loading: boolean;
}

const when = (iso: string | null | undefined) => (iso ? format(new Date(iso), 'MMM d, HH:mm') : '—');

export function HistoryTab({ days, onDaysChange, overview, trend, incidents, loading }: Props) {
  const [component, setComponent] = useState<string>('all');

  const components = useMemo(() => Array.from(new Set(trend.map(t => t.component))).sort(), [trend]);

  const chartData = useMemo(() => {
    const byDay = new Map<string, { total: number; down: number; degraded: number; latW: number; latN: number }>();
    for (const t of trend) {
      if (component !== 'all' && t.component !== component) continue;
      const e = byDay.get(t.day) ?? { total: 0, down: 0, degraded: 0, latW: 0, latN: 0 };
      e.total += t.checks_total; e.down += t.checks_down; e.degraded += t.checks_degraded;
      if (t.avg_latency_ms != null) { e.latW += t.avg_latency_ms * t.checks_total; e.latN += t.checks_total; }
      byDay.set(t.day, e);
    }
    return Array.from(byDay.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([day, e]) => ({
      day: format(new Date(day + 'T00:00:00Z'), 'MMM d'),
      passed: e.total - e.down - e.degraded,
      degraded: e.degraded,
      down: e.down,
      latency: e.latN ? Math.round(e.latW / e.latN) : null,
    }));
  }, [trend, component]);

  const rows = component === 'all' ? overview : overview.filter(o => o.component === component);

  const totals = useMemo(() => {
    const t = rows.reduce((s, o) => s + Number(o.checks_total), 0);
    const ok = rows.reduce((s, o) => s + Number(o.checks_ok), 0);
    const inc = rows.reduce((s, o) => s + Number(o.incidents), 0);
    const min = rows.reduce((s, o) => s + Number(o.downtime_min_seconds), 0);
    const max = rows.reduce((s, o) => s + Number(o.downtime_max_seconds), 0);
    return { checks: t, ok, incidents: inc, min, max };
  }, [rows]);

  const daysWithChecks = chartData.length;

  const visibleIncidents = incidents.filter(i =>
    new Date(i.started_at).getTime() >= Date.now() - days * 86_400_000 &&
    (component === 'all' || i.component === component));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2 justify-between">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 flex-1">
          <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">Checks passed</p><p className={`text-xl font-bold ${passColor(totals.ok, totals.checks)}`}>{fmtPassed(totals.ok, totals.checks)}</p></CardContent></Card>
          <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">Days with a check</p><p className="text-xl font-bold">{daysWithChecks} of {days}</p></CardContent></Card>
          <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">Incidents</p><p className="text-xl font-bold">{totals.incidents}</p></CardContent></Card>
          <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">Time unhealthy (range)</p><p className="text-xl font-bold">{totals.incidents ? fmtDurationRange(totals.min, totals.max) : '—'}</p></CardContent></Card>
        </div>
        <div className="flex gap-2">
          <Select value={component} onValueChange={setComponent}>
            <SelectTrigger className="w-[180px] h-9 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All services</SelectItem>
              {components.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={String(days)} onValueChange={v => onDaysChange(Number(v))}>
            <SelectTrigger className="w-[130px] h-9 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Last 7 days</SelectItem>
              <SelectItem value="30">Last 30 days</SelectItem>
              <SelectItem value="90">Last 90 days</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        These figures count health checks, not continuous uptime. Services are checked once a day and on demand, so a problem that starts and ends between two checks is not recorded, and the length of a recorded problem is only known as a range.
      </p>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Check results per day</CardTitle></CardHeader>
        <CardContent>
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <ComposedChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="day" tick={{ fontSize: 10 }} minTickGap={16} className="text-muted-foreground" />
                <YAxis yAxisId="left" allowDecimals={false} tick={{ fontSize: 10 }} className="text-muted-foreground" />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} unit="ms" className="text-muted-foreground" />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar yAxisId="left" stackId="checks" dataKey="passed" name="Passed" fill="#10b981" />
                <Bar yAxisId="left" stackId="checks" dataKey="degraded" name="Degraded" fill="#eab308" />
                <Bar yAxisId="left" stackId="checks" dataKey="down" name="Down" fill="#ef4444" radius={[2, 2, 0, 0]} />
                <Line yAxisId="right" type="linear" dataKey="latency" name="Avg response (ms)" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 2 }} connectNulls={false} />
              </ComposedChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8">{loading ? 'Loading…' : 'No checks recorded in this period.'}</p>
          )}
          <p className="text-[11px] text-muted-foreground mt-2">Days without a bar had no check. They are not counted as healthy or unhealthy.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Per service, last {days} days</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <Table containerClassName={stickyHeaderTableClass}>
            <TableHeader>
              <TableRow>
                <TableHead>Service</TableHead>
                <TableHead>Category</TableHead>
                <TableHead className="text-right">Checks passed</TableHead>
                <TableHead className="text-right">Degraded</TableHead>
                <TableHead className="text-right">Down</TableHead>
                <TableHead className="text-right">Avg response</TableHead>
                <TableHead className="text-right">Slowest 5%</TableHead>
                <TableHead className="text-right">Incidents</TableHead>
                <TableHead className="text-right">Time unhealthy (range)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 && (
                <TableRow><TableCell colSpan={9} className="text-center text-sm text-muted-foreground py-6">No checks recorded in this period.</TableCell></TableRow>
              )}
              {rows.map(o => (
                <TableRow key={o.component}>
                  <TableCell className="font-medium">{o.component}</TableCell>
                  <TableCell className="text-muted-foreground text-xs">{o.category}</TableCell>
                  <TableCell className={`text-right font-semibold ${passColor(o.checks_ok, o.checks_total)}`}>{fmtPassed(o.checks_ok, o.checks_total)}</TableCell>
                  <TableCell className="text-right">{fmtNumber(o.checks_degraded)}</TableCell>
                  <TableCell className="text-right">{fmtNumber(o.checks_down)}</TableCell>
                  <TableCell className="text-right">{o.avg_latency_ms != null ? `${o.avg_latency_ms} ms` : '—'}</TableCell>
                  <TableCell className="text-right">{o.p95_latency_ms != null ? `${o.p95_latency_ms} ms` : '—'}</TableCell>
                  <TableCell className="text-right">{fmtNumber(o.incidents)}</TableCell>
                  <TableCell className="text-right">{Number(o.incidents) ? fmtDurationRange(o.downtime_min_seconds, o.downtime_max_seconds) : '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Incidents ({visibleIncidents.length})</CardTitle>
          <p className="text-xs text-muted-foreground">
            The problem began between “last seen healthy” and “first failed check”, and ended between “last failed check” and “first passing check”.
          </p>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table containerClassName={stickyHeaderTableClass}>
            <TableHeader>
              <TableRow>
                <TableHead>Service</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Last seen healthy</TableHead>
                <TableHead>First failed check</TableHead>
                <TableHead>Last failed check</TableHead>
                <TableHead>First passing check</TableHead>
                <TableHead className="text-right">Unhealthy for</TableHead>
                <TableHead className="text-right">Failed checks</TableHead>
                <TableHead>Email sent</TableHead>
                <TableHead>Reason</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleIncidents.length === 0 && (
                <TableRow><TableCell colSpan={10} className="text-center text-sm text-muted-foreground py-6">No check failed in this period.</TableCell></TableRow>
              )}
              {visibleIncidents.map(i => {
                const b = incidentBounds(i);
                return (
                  <TableRow key={i.id}>
                    <TableCell className="font-medium">{i.component}</TableCell>
                    <TableCell><Badge variant={i.status === 'down' ? 'destructive' : 'warning'} className="text-[10px]">{i.resolved_at ? i.status : `${i.status} · ongoing`}</Badge></TableCell>
                    <TableCell className="text-xs whitespace-nowrap">{i.prev_ok_at ? when(i.prev_ok_at) : <span className="text-muted-foreground">none on record</span>}</TableCell>
                    <TableCell className="text-xs whitespace-nowrap">{when(i.started_at)}</TableCell>
                    <TableCell className="text-xs whitespace-nowrap">{when(i.last_failed_at ?? i.started_at)}</TableCell>
                    <TableCell className="text-xs whitespace-nowrap">{i.resolved_at ? when(i.resolved_at) : <span className="text-red-500">not yet</span>}</TableCell>
                    <TableCell className="text-right text-xs whitespace-nowrap">{fmtDurationRange(b.min, b.max)}{i.resolved_at ? '' : ' so far'}</TableCell>
                    <TableCell className="text-right text-xs">{i.checks_failed}</TableCell>
                    <TableCell className="text-xs whitespace-nowrap">{i.notified_at ? when(i.notified_at) : <span className="text-muted-foreground">no</span>}</TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-[320px]" title={i.last_message ?? ''}>{i.last_message}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
