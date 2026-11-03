import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Loader2, Save } from 'lucide-react';
import { toast } from 'sonner';
import type { SettingRow } from './types';
import { useSaveSetting } from './useHealthData';
import { useAdminAccess } from '@/hooks/useAdminAccess';

interface FieldDef {
  key: string;
  label: string;
  /** `limit` is a number that may be left empty, meaning "not set". */
  type: 'number' | 'limit' | 'boolean' | 'emails';
  unit?: string;
  help?: string;
  group: string;
}

const FIELDS: FieldDef[] = [
  { key: 'alerts_enabled', label: 'Email alerts enabled', type: 'boolean', group: 'Alert delivery' },
  { key: 'alert_emails', label: 'Extra alert recipients', type: 'emails', help: 'Active super admins always receive alerts.', group: 'Alert delivery' },
  { key: 'incident_confirm_failures', label: 'Failed checks in a row before an outage email', type: 'number', unit: 'checks', help: 'Checks run once a day, so 2 means the email is sent a day after the first failure.', group: 'Alert delivery' },
  { key: 'quota_alert_cooldown_hours', label: 'Repeat the same usage alert at most every', type: 'number', unit: 'hours', group: 'Alert delivery' },

  { key: 'plan_limits_verified', label: 'Plan limits verified', type: 'boolean', help: 'Switch on only after the limits below match what your Resend and hosting plans really allow. Until then every percentage is marked as unverified.', group: 'Plan limits' },
  { key: 'resend_daily_limit', label: 'Resend: emails per day', type: 'limit', unit: 'emails', help: 'Free plan: 100. Paid plans have no daily limit: leave empty. Every recipient counts as one email.', group: 'Plan limits' },
  { key: 'resend_monthly_limit', label: 'Resend: emails per month', type: 'limit', unit: 'emails', help: 'Free plan: 3000. Every recipient counts as one email.', group: 'Plan limits' },
  { key: 'db_size_limit_mb', label: 'Database size limit', type: 'limit', unit: 'MB', help: 'Leave empty if you do not know the limit of your plan.', group: 'Plan limits' },
  { key: 'storage_limit_mb', label: 'File storage limit', type: 'limit', unit: 'MB', help: 'Leave empty if you do not know the limit of your plan.', group: 'Plan limits' },

  { key: 'warning_pct', label: 'Warning at', type: 'number', unit: '% of limit', group: 'Alert thresholds' },
  { key: 'critical_pct', label: 'Critical at', type: 'number', unit: '% of limit', group: 'Alert thresholds' },
  { key: 'latency_degraded_ms', label: 'Mark a service degraded when a check is slower than', type: 'number', unit: 'ms', group: 'Alert thresholds' },
  { key: 'edge_errors_per_day', label: 'Edge Functions degraded at', type: 'number', unit: 'logged errors / 24h', group: 'Alert thresholds' },
  { key: 'stripe_failed_webhooks_24h', label: 'Stripe webhook alert at', type: 'number', unit: 'failed events / 24h', group: 'Alert thresholds' },
  { key: 'email_failure_rate_pct', label: 'Email alert when Resend rejects', type: 'number', unit: '% of sends (24h)', group: 'Alert thresholds' },
];

const toDraft = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) return (value as string[]).join(', ');
  return String(value);
};

interface Props {
  settings: SettingRow[];
  loading: boolean;
}

export function SettingsTab({ settings, loading }: Props) {
  const { isSuperAdmin, readOnlyMessage } = useAdminAccess();
  const save = useSaveSetting();
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState<Set<string>>(new Set());

  useEffect(() => {
    const next: Record<string, string> = {};
    for (const s of settings) next[s.key] = toDraft(s.value);
    setDraft(next);
    setDirty(new Set());
  }, [settings]);

  const setValue = (key: string, v: string) => {
    setDraft(d => ({ ...d, [key]: v }));
    setDirty(s => new Set(s).add(key));
  };

  const saveKey = async (f: FieldDef) => {
    const raw = (draft[f.key] ?? '').trim();
    let value: unknown;
    if (f.type === 'boolean') value = raw === 'true';
    else if (f.type === 'emails') {
      const list = raw.split(/[,\s;]+/).map(s => s.trim().toLowerCase()).filter(Boolean);
      const bad = list.filter(e => !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e));
      if (bad.length) { toast.error(`Invalid email: ${bad.join(', ')}`); return; }
      value = list;
    } else if (f.type === 'limit' && raw === '') {
      value = null;
    } else {
      const n = Number(raw);
      if (raw === '' || !Number.isFinite(n) || n < 0) { toast.error('Enter a number of 0 or more'); return; }
      if (f.type === 'limit' && n === 0) { toast.error('A limit of 0 is not possible. Leave the field empty if the limit is unknown.'); return; }
      value = n;
    }
    try {
      await save.mutateAsync({ key: f.key, value });
      setDirty(s => { const n = new Set(s); n.delete(f.key); return n; });
      toast.success(`${f.label} saved. It applies from the next check.`);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const groups = Array.from(new Set(FIELDS.map(f => f.group)));
  const known = new Set(settings.map(s => s.key));

  return (
    <div className="space-y-6">
      {!isSuperAdmin && (
        <p className="text-xs text-muted-foreground">{readOnlyMessage}</p>
      )}
      <p className="text-xs text-muted-foreground">
        Changes apply from the next check. Figures already on the dashboard were measured with the previous values until you run a check.
      </p>
      {groups.map(group => (
        <Card key={group}>
          <CardHeader className="pb-2"><CardTitle className="text-base">{group}</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {FIELDS.filter(f => f.group === group).map(f => {
              const value = draft[f.key] ?? '';
              const isDirty = dirty.has(f.key);
              const missing = !loading && settings.length > 0 && !known.has(f.key);
              return (
                <div key={f.key} className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                  <div className="sm:w-1/2">
                    <Label htmlFor={f.key} className="text-sm">{f.label}</Label>
                    {f.help && <p className="text-[11px] text-muted-foreground">{f.help}</p>}
                    {missing && <p className="text-[11px] text-yellow-500">Not available until the latest database migration is applied.</p>}
                  </div>
                  <div className="flex items-center gap-2 flex-1">
                    {f.type === 'boolean' ? (
                      <Switch id={f.key} checked={value === 'true'} disabled={!isSuperAdmin || loading || missing} onCheckedChange={c => setValue(f.key, String(c))} />
                    ) : (
                      <Input
                        id={f.key}
                        type={f.type === 'emails' ? 'text' : 'number'}
                        min={f.type === 'emails' ? undefined : 0}
                        value={value}
                        disabled={!isSuperAdmin || loading || missing}
                        placeholder={f.type === 'emails' ? 'ops@example.com, cto@example.com' : f.type === 'limit' ? 'not set' : ''}
                        onChange={e => setValue(f.key, e.target.value)}
                        className="h-9 max-w-xs"
                      />
                    )}
                    {f.unit && <span className="text-xs text-muted-foreground whitespace-nowrap">{f.unit}</span>}
                    <Button size="sm" variant={isDirty ? 'default' : 'outline'} disabled={!isSuperAdmin || !isDirty || save.isPending || missing} onClick={() => saveKey(f)} aria-label={`Save ${f.label}`}>
                      {save.isPending && save.variables?.key === f.key ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                    </Button>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
