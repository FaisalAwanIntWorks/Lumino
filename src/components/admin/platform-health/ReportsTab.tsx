import { stickyHeaderTableClass } from "@/components/ui/table";
import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Mail, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import {
  fmtDuration, fmtDurationRange, fmtNumber, fmtPassed, passColor,
  type AlertRow, type MonthlyReport, type ReportComponent, type ReportIncident,
} from './types';
import { useReportPreview, useReports, useSendMonthlyReport } from './useHealthData';
import { useAdminAccess } from '@/hooks/useAdminAccess';

function monthOptions(): Array<{ value: string; label: string }> {
  const out: Array<{ value: string; label: string }> = [];
  const now = new Date();
  for (let i = 0; i < 13; i++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const value = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    const label = d.toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }) + (i === 0 ? ' (month to date)' : '');
    out.push({ value, label });
  }
  return out;
}

// Reports stored before the accuracy pass carry a single duration and no pass
// counts. They are shown as they were recorded, flagged as the older format.
const componentPassed = (c: ReportComponent) =>
  c.checks_ok != null ? c.checks_ok : c.checks_total - c.checks_down - c.checks_degraded;

const componentUnhealthy = (c: ReportComponent) =>
  !c.incidents ? '—'
    : c.downtime_max_seconds != null ? fmtDurationRange(c.downtime_min_seconds, c.downtime_max_seconds)
    : `${fmtDuration(c.downtime_seconds)} (older estimate)`;

const incidentUnhealthy = (i: ReportIncident) =>
  i.duration_max_seconds != null ? fmtDurationRange(i.duration_min_seconds, i.duration_max_seconds)
    : `${fmtDuration(i.duration_seconds)} (older estimate)`;

function ReportView({ report }: { report: MonthlyReport }) {
  const u = report.usage;
  const legacy = report.checks_passed == null;
  const passed = legacy ? report.components.reduce((s, c) => s + componentPassed(c), 0) : Number(report.checks_passed);
  const rejected = u.emails_rejected ?? u.emails_failed ?? null;

  return (
    <div className="space-y-4">
      {legacy && (
        <p className="text-xs text-yellow-500">
          This report was stored before the accuracy fixes. Its email figures were counted per send instead of per recipient and did not detect rejected sends, and its durations are single estimates. It is shown exactly as recorded.
        </p>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">Checks passed</p><p className={`text-xl font-bold ${passColor(passed, report.total_checks)}`}>{fmtPassed(passed, report.total_checks)}</p></CardContent></Card>
        <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">Days with a check</p><p className="text-xl font-bold">{report.days_with_checks != null ? `${report.days_with_checks} of ${report.days_in_period}` : '—'}</p></CardContent></Card>
        <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">Incidents</p><p className="text-xl font-bold">{report.incidents.length}</p></CardContent></Card>
        <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">Alerts sent</p><p className="text-xl font-bold">{u.alerts_sent}</p></CardContent></Card>
        <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">Emails accepted by Resend</p><p className="text-xl font-bold">{fmtNumber(u.emails_sent)}</p><p className="text-[11px] text-muted-foreground">{u.email_api_calls != null ? `${fmtNumber(u.email_api_calls)} sends, counted per recipient` : 'counted per send'}</p></CardContent></Card>
        <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">Emails rejected by Resend</p><p className={`text-xl font-bold ${rejected ? 'text-red-500' : ''}`}>{fmtNumber(rejected)}</p></CardContent></Card>
        <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">AI requests</p><p className="text-xl font-bold">{fmtNumber(u.ai_requests)}</p>{u.ai_requests_cached != null && <p className="text-[11px] text-muted-foreground">{fmtNumber(u.ai_requests_cached)} served from cache</p>}</CardContent></Card>
        <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">Stripe webhooks received</p><p className="text-xl font-bold">{fmtNumber(u.stripe_webhooks)}</p><p className="text-[11px] text-muted-foreground">{u.stripe_webhooks_failed} failed processing</p></CardContent></Card>
        <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">Logged system errors</p><p className="text-xl font-bold">{fmtNumber(u.system_errors)}</p><p className="text-[11px] text-muted-foreground">{u.critical_errors} critical · {u.high_errors} high</p></CardContent></Card>
      </div>

      <p className="text-xs text-muted-foreground">
        Check figures are samples taken once a day and on demand, not continuous uptime. Email, AI, webhook and error figures come from the platform's own logs: email sent outside the platform and errors that were never logged are not included.
      </p>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Service checks</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <Table containerClassName={stickyHeaderTableClass}>
            <TableHeader>
              <TableRow>
                <TableHead>Service</TableHead>
                <TableHead className="text-right">Checks passed</TableHead>
                <TableHead className="text-right">Degraded</TableHead>
                <TableHead className="text-right">Down</TableHead>
                <TableHead className="text-right">Avg response</TableHead>
                <TableHead className="text-right">Incidents</TableHead>
                <TableHead className="text-right">Time unhealthy (range)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {report.components.length === 0 && (
                <TableRow><TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-6">No checks were recorded in this month.</TableCell></TableRow>
              )}
              {report.components.map(c => (
                <TableRow key={c.component}>
                  <TableCell className="font-medium">{c.component}</TableCell>
                  <TableCell className={`text-right font-semibold ${passColor(componentPassed(c), c.checks_total)}`}>{fmtPassed(componentPassed(c), c.checks_total)}</TableCell>
                  <TableCell className="text-right">{c.checks_degraded}</TableCell>
                  <TableCell className="text-right">{c.checks_down}</TableCell>
                  <TableCell className="text-right">{c.avg_latency_ms != null ? `${c.avg_latency_ms} ms` : '—'}</TableCell>
                  <TableCell className="text-right">{c.incidents}</TableCell>
                  <TableCell className="text-right">{componentUnhealthy(c)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {report.quotas.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Usage measurements</CardTitle></CardHeader>
          <CardContent className="overflow-x-auto">
            <Table containerClassName={stickyHeaderTableClass}>
              <TableHeader>
                <TableRow>
                  <TableHead>Metric</TableHead>
                  <TableHead className="text-right">First measurement</TableHead>
                  <TableHead className="text-right">Last measurement</TableHead>
                  <TableHead className="text-right">Highest</TableHead>
                  <TableHead className="text-right">Limit / threshold</TableHead>
                  <TableHead className="text-right">Measurements</TableHead>
                  <TableHead>Worst level</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.quotas.map(q => (
                  <TableRow key={`${q.service}:${q.metric}`}>
                    <TableCell className="font-medium">{q.label}</TableCell>
                    <TableCell className="text-right">{fmtNumber(q.first, 2)} {q.unit}</TableCell>
                    <TableCell className="text-right">{fmtNumber(q.last, 2)} {q.unit}</TableCell>
                    <TableCell className="text-right">{fmtNumber(q.peak, 2)} {q.unit}</TableCell>
                    <TableCell className="text-right">{q.limit != null ? `${fmtNumber(q.limit, 2)} ${q.unit}` : 'not set'}</TableCell>
                    <TableCell className="text-right">{q.samples ?? '—'}</TableCell>
                    <TableCell><Badge variant={q.worst_level === 'critical' ? 'destructive' : q.worst_level === 'warning' ? 'warning' : 'success'} className="text-[10px]">{q.worst_level}</Badge></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {report.incidents.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Incidents</CardTitle></CardHeader>
          <CardContent className="overflow-x-auto">
            <Table containerClassName={stickyHeaderTableClass}>
              <TableHeader>
                <TableRow>
                  <TableHead>Service</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>First failed check</TableHead>
                  <TableHead>First passing check</TableHead>
                  <TableHead className="text-right">Unhealthy for</TableHead>
                  <TableHead>Reason</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.incidents.map((i, idx) => (
                  <TableRow key={idx}>
                    <TableCell className="font-medium">{i.component}</TableCell>
                    <TableCell><Badge variant={i.status === 'down' ? 'destructive' : 'warning'} className="text-[10px]">{i.resolved_at ? i.status : `${i.status} · ongoing`}</Badge></TableCell>
                    <TableCell className="text-xs whitespace-nowrap">{format(new Date(i.started_at), 'MMM d, HH:mm')}</TableCell>
                    <TableCell className="text-xs whitespace-nowrap">{i.resolved_at ? format(new Date(i.resolved_at), 'MMM d, HH:mm') : 'not yet'}</TableCell>
                    <TableCell className="text-right text-xs whitespace-nowrap">{incidentUnhealthy(i)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-[320px]" title={i.message ?? ''}>{i.message}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export function ReportsTab() {
  const options = useMemo(monthOptions, []);
  const [month, setMonth] = useState(options[1]?.value ?? options[0].value);
  const preview = useReportPreview(month);
  const reports = useReports();
  const send = useSendMonthlyReport();
  const { isSuperAdmin, readOnlyMessage } = useAdminAccess();
  const [viewing, setViewing] = useState<AlertRow | null>(null);

  const onSend = async () => {
    try {
      const r = await send.mutateAsync(month);
      if (r.email_sent) toast.success('Monthly report emailed to the alert recipients');
      else toast.error(`Report stored but the email was not sent: ${r.email_error ?? 'unknown error'}`);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2 justify-between">
        <div>
          <h2 className="text-lg font-semibold">Monthly report</h2>
          <p className="text-xs text-muted-foreground">Emailed automatically on the 1st of each month (08:00 UTC) for the previous month. Any month can be generated here.</p>
        </div>
        <div className="flex gap-2">
          <Select value={month} onValueChange={v => { setMonth(v); setViewing(null); }}>
            <SelectTrigger className="w-[230px] h-9 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>{options.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
          </Select>
          <Button size="sm" onClick={onSend} disabled={!isSuperAdmin || send.isPending} title={!isSuperAdmin ? readOnlyMessage : undefined}>
            {send.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Mail className="h-4 w-4 mr-1" />}
            Email this report
          </Button>
        </div>
      </div>

      {viewing ? (
        <>
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">Stored report, generated {format(new Date(viewing.created_at), 'MMM d, yyyy HH:mm')} · email {viewing.email_status}</p>
            <Button size="sm" variant="ghost" onClick={() => setViewing(null)}>Back to current figures</Button>
          </div>
          <ReportView report={viewing.details as unknown as MonthlyReport} />
        </>
      ) : preview.isLoading ? (
        <p className="text-sm text-muted-foreground">Building report…</p>
      ) : preview.error ? (
        <p className="text-sm text-red-500">{(preview.error as Error).message}</p>
      ) : preview.data ? (
        <>
          <p className="text-xs text-muted-foreground">Calculated just now from stored data ({format(new Date(preview.data.generated_at), 'MMM d, HH:mm')}).</p>
          <ReportView report={preview.data} />
        </>
      ) : null}

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Sent reports</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <Table containerClassName={stickyHeaderTableClass}>
            <TableHeader>
              <TableRow>
                <TableHead>Period</TableHead>
                <TableHead>Generated</TableHead>
                <TableHead className="text-right">Checks passed</TableHead>
                <TableHead className="text-right">Incidents</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Recipients</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(reports.data ?? []).length === 0 && (
                <TableRow><TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-6">No report has been sent yet.</TableCell></TableRow>
              )}
              {(reports.data ?? []).map(r => {
                const d = r.details as unknown as MonthlyReport;
                const passed = d?.checks_passed != null ? Number(d.checks_passed) : (d?.components ?? []).reduce((s, c) => s + componentPassed(c), 0);
                return (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{d?.period_label ?? r.alert_key}</TableCell>
                    <TableCell className="text-xs">{format(new Date(r.created_at), 'MMM d, yyyy HH:mm')}</TableCell>
                    <TableCell className={`text-right font-semibold ${passColor(passed, d?.total_checks)}`}>{fmtPassed(passed, d?.total_checks)}</TableCell>
                    <TableCell className="text-right">{d?.incidents?.length ?? '—'}</TableCell>
                    <TableCell>
                      <Badge variant={r.email_status === 'sent' ? 'success' : r.email_status === 'failed' ? 'destructive' : 'outline'} className="text-[10px]">{r.email_status}</Badge>
                      {r.email_error && <p className="text-[10px] text-red-500 max-w-[180px]">{r.email_error}</p>}
                    </TableCell>
                    <TableCell className="text-[11px] text-muted-foreground max-w-[200px] truncate" title={r.recipients.join(', ')}>{r.recipients.join(', ') || '—'}</TableCell>
                    <TableCell className="text-right"><Button size="sm" variant="ghost" onClick={() => setViewing(r)}>View</Button></TableCell>
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
