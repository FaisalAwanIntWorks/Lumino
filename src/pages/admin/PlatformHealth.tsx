import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { RefreshCw, Activity, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { StatusTab } from '@/components/admin/platform-health/StatusTab';
import { QuotasTab } from '@/components/admin/platform-health/QuotasTab';
import { HistoryTab } from '@/components/admin/platform-health/HistoryTab';
import { AlertsTab } from '@/components/admin/platform-health/AlertsTab';
import { ReportsTab } from '@/components/admin/platform-health/ReportsTab';
import { SettingsTab } from '@/components/admin/platform-health/SettingsTab';
import {
  useAlerts, useIncidents, useLatestChecks, useOverview, useQuotas, useRunMonitor, useSettings, useTrend,
} from '@/components/admin/platform-health/useHealthData';

// The scheduled check runs once a day; only check automatically when the last
// result is older than that.
const STALE_MS = 25 * 60 * 60 * 1000;

const errorText = (e: unknown) => (e instanceof Error ? e.message : typeof e === 'object' && e && 'message' in e ? String((e as { message: unknown }).message) : String(e));

export default function PlatformHealth() {
  const [historyDays, setHistoryDays] = useState(30);

  const latest = useLatestChecks();
  const overview7 = useOverview(7);
  const overview30 = useOverview(30);
  const overviewHistory = useOverview(historyDays);
  const trend = useTrend(historyDays);
  const incidents = useIncidents();
  const quotas = useQuotas();
  const alerts = useAlerts();
  const settings = useSettings();
  const run = useRunMonitor();

  // Check immediately when the page opens with no result or an old one. Once per mount.
  const autoRan = useRef(false);
  useEffect(() => {
    if (autoRan.current || latest.isLoading || latest.isError || run.isPending) return;
    const rows = latest.data ?? [];
    const newest = rows.reduce<number>((m, r) => Math.max(m, new Date(r.checked_at).getTime()), 0);
    if (rows.length === 0 || Date.now() - newest > STALE_MS) {
      autoRan.current = true;
      run.mutate();
    }
  }, [latest.isLoading, latest.isError, latest.data, run]);

  const onRefresh = async () => {
    try {
      const r = await run.mutateAsync();
      const issues = r.statuses.filter(s => s.status !== 'operational').length;
      const emails = r.incidents.alerted + r.quota_alerts_sent;
      const extra = [
        r.incidents.opened ? `${r.incidents.opened} new incident(s)` : null,
        r.incidents.resolved ? `${r.incidents.resolved} recovered` : null,
        emails ? `${emails} alert email(s) sent` : null,
      ].filter(Boolean).join(' · ');
      if (issues === 0) toast.success(`All ${r.statuses.length} services passed the check${extra ? ` · ${extra}` : ''}`);
      else toast.warning(`${issues} of ${r.statuses.length} services failed the check${extra ? ` · ${extra}` : ''}`);
    } catch (e) {
      toast.error(`The check could not run: ${errorText(e)}`);
    }
  };

  const busy = run.isPending;

  // Anything that failed to load is said out loud. An empty table must never
  // be mistaken for "nothing happened".
  const loadErrors = [
    latest.error && `latest results: ${errorText(latest.error)}`,
    overview30.error && `30-day summary: ${errorText(overview30.error)}`,
    trend.error && `daily history: ${errorText(trend.error)}`,
    incidents.error && `incidents: ${errorText(incidents.error)}`,
    quotas.error && `usage: ${errorText(quotas.error)}`,
    alerts.error && `alerts: ${errorText(alerts.error)}`,
    settings.error && `settings: ${errorText(settings.error)}`,
    run.error && `last check run: ${errorText(run.error)}`,
  ].filter(Boolean) as string[];

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Activity className="h-6 w-6 text-primary" />
            Platform Health
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Every service is checked once a day (06:00 UTC) and whenever you run a check. Failed checks, usage limits and a monthly summary are emailed to the super admins.
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={onRefresh} disabled={busy}>
          <RefreshCw className={`h-4 w-4 mr-1 ${busy ? 'animate-spin' : ''}`} />
          {busy ? 'Checking…' : 'Run check now'}
        </Button>
      </div>

      {loadErrors.length > 0 && (
        <Card className="border-2 border-red-500/30 bg-red-500/5">
          <CardContent className="py-3 text-sm flex gap-3">
            <XCircle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-red-700 dark:text-red-400">Some data could not be loaded, so parts of this page are incomplete</p>
              <ul className="text-xs text-muted-foreground list-disc pl-4 mt-1">
                {loadErrors.map(e => <li key={e}>{e}</li>)}
              </ul>
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="status" className="space-y-6">
        <TabsList className="flex flex-wrap h-auto">
          <TabsTrigger value="status">Latest Check</TabsTrigger>
          <TabsTrigger value="quotas">Usage & Limits</TabsTrigger>
          <TabsTrigger value="history">History & Incidents</TabsTrigger>
          <TabsTrigger value="alerts">Alerts</TabsTrigger>
          <TabsTrigger value="reports">Monthly Reports</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="status">
          <StatusTab
            checks={latest.data ?? []}
            overview7={overview7.data ?? []}
            overview30={overview30.data ?? []}
            loading={latest.isLoading || busy}
          />
        </TabsContent>

        <TabsContent value="quotas">
          <QuotasTab quotas={quotas.data ?? []} loading={quotas.isLoading || busy} />
        </TabsContent>

        <TabsContent value="history">
          <HistoryTab
            days={historyDays}
            onDaysChange={setHistoryDays}
            overview={overviewHistory.data ?? []}
            trend={trend.data ?? []}
            incidents={incidents.data ?? []}
            loading={overviewHistory.isLoading || trend.isLoading}
          />
        </TabsContent>

        <TabsContent value="alerts">
          <AlertsTab alerts={alerts.data ?? []} loading={alerts.isLoading} />
        </TabsContent>

        <TabsContent value="reports">
          <ReportsTab />
        </TabsContent>

        <TabsContent value="settings">
          <SettingsTab settings={settings.data ?? []} loading={settings.isLoading} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
