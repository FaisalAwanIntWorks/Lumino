import { stickyHeaderTableClass } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Send, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import type { AlertRow } from './types';
import { useSendTestAlert } from './useHealthData';
import { useAdminAccess } from '@/hooks/useAdminAccess';

const TYPE_LABEL: Record<AlertRow['alert_type'], string> = {
  incident_open: 'Check failed',
  incident_resolved: 'Recovered',
  quota_warning: 'Usage warning',
  quota_critical: 'Usage critical',
  monthly_report: 'Monthly report',
  test_alert: 'Test',
};

const severityBadge: Record<AlertRow['severity'], 'secondary' | 'warning' | 'destructive'> = {
  info: 'secondary', warning: 'warning', critical: 'destructive',
};

const emailBadge: Record<AlertRow['email_status'], 'success' | 'destructive' | 'outline'> = {
  sent: 'success', failed: 'destructive', skipped: 'outline',
};

const EMAIL_LABEL: Record<AlertRow['email_status'], string> = {
  sent: 'accepted by Resend',
  failed: 'not sent',
  skipped: 'not attempted',
};

const isFalsePositive = (a: AlertRow) => a.details?.false_positive === true;

interface Props {
  alerts: AlertRow[];
  loading: boolean;
}

export function AlertsTab({ alerts, loading }: Props) {
  const { isSuperAdmin, readOnlyMessage } = useAdminAccess();
  const test = useSendTestAlert();

  const onTest = async () => {
    try {
      const r = await test.mutateAsync();
      if (r.sent) toast.success(`Resend accepted the test alert for ${r.recipients.join(', ')}. Check the inbox to confirm delivery.`);
      else toast.error(`Test alert not sent: ${r.error ?? 'unknown error'}`);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const real = alerts.filter(a => !isFalsePositive(a) && a.alert_type !== 'test_alert');
  const last30 = real.filter(a => new Date(a.created_at).getTime() >= Date.now() - 30 * 86_400_000);
  const notSent = alerts.filter(a => a.email_status !== 'sent').length;
  const falsePositives = alerts.filter(isFalsePositive).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3 justify-between">
        <div className="grid grid-cols-3 gap-3 flex-1">
          <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">Alerts, 30 days</p><p className="text-xl font-bold">{last30.length}</p></CardContent></Card>
          <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">Critical, 30 days</p><p className="text-xl font-bold text-red-500">{last30.filter(a => a.severity === 'critical').length}</p></CardContent></Card>
          <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">Emails not sent</p><p className={`text-xl font-bold ${notSent ? 'text-red-500' : ''}`}>{notSent}</p></CardContent></Card>
        </div>
        <Button size="sm" variant="outline" onClick={onTest} disabled={!isSuperAdmin || test.isPending} title={!isSuperAdmin ? readOnlyMessage : undefined}>
          {test.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Send className="h-4 w-4 mr-1" />}
          Send test alert
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Alert log</CardTitle>
          <p className="text-xs text-muted-foreground">
            An email goes out when a check fails, when usage crosses a warning or critical threshold, and when a failed service passes a check again. Recipients are the active super admins plus any extra addresses in Settings. “Accepted by Resend” means Resend took the message; whether it reached the inbox is not known to the platform.
            {falsePositives > 0 && ` ${falsePositives} alert(s) below were caused by a bug in the checks, not by a real problem. They are marked and left out of the counts above.`}
          </p>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table containerClassName={stickyHeaderTableClass}>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Severity</TableHead>
                <TableHead>Title</TableHead>
                <TableHead>Detail</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Recipients</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {alerts.length === 0 && (
                <TableRow><TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-6">{loading ? 'Loading…' : 'No alerts have been sent.'}</TableCell></TableRow>
              )}
              {alerts.map(a => (
                <TableRow key={a.id} className={isFalsePositive(a) ? 'opacity-60' : ''}>
                  <TableCell className="text-xs whitespace-nowrap">{format(new Date(a.created_at), 'MMM d, HH:mm')}</TableCell>
                  <TableCell className="text-xs whitespace-nowrap">{TYPE_LABEL[a.alert_type] ?? a.alert_type}</TableCell>
                  <TableCell>
                    <Badge variant={severityBadge[a.severity]} className="text-[10px]">{a.severity}</Badge>
                    {isFalsePositive(a) && <Badge variant="outline" className="text-[10px] ml-1">false alarm</Badge>}
                  </TableCell>
                  <TableCell className="text-sm font-medium max-w-[260px]">{a.title}</TableCell>
                  <TableCell className="text-xs text-muted-foreground max-w-[320px]">
                    {a.message}
                    {isFalsePositive(a) && <span className="block text-yellow-500">{String(a.details?.false_positive_reason ?? 'Caused by a bug in the check.')}</span>}
                  </TableCell>
                  <TableCell>
                    <Badge variant={emailBadge[a.email_status]} className="text-[10px]">{EMAIL_LABEL[a.email_status]}</Badge>
                    {a.email_error && <p className="text-[10px] text-red-500 max-w-[180px]">{a.email_error}</p>}
                  </TableCell>
                  <TableCell className="text-[11px] text-muted-foreground max-w-[220px]">{a.recipients.join(', ') || '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
