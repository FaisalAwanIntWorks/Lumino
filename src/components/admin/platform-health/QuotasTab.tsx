import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { AlertTriangle } from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { fmtNumber, type QuotaLevel, type QuotaRow } from './types';
import { useQuotaHistory } from './useHealthData';

const SERVICE_LABEL: Record<string, string> = {
  resend: 'Resend (Email)',
  ai: 'AI Usage',
  supabase: 'Database & Storage',
  stripe: 'Stripe',
  errors: 'System Errors',
  edge: 'Edge Functions',
};

const SERVICE_ORDER = ['resend', 'ai', 'supabase', 'stripe', 'edge', 'errors'];

const SOURCE_LABEL: Record<string, string> = {
  resend: 'Reported by Resend',
  email_log: 'Counted from platform email log',
  ai_usage_log: 'Counted from platform AI log',
  postgres: 'Measured in the database',
  storage: 'Measured in file storage',
  stripe_webhook_events: 'Counted from platform webhook log',
  system_errors: 'Counted from System Errors log',
};

const levelCfg: Record<QuotaLevel, { badge: 'success' | 'warning' | 'destructive' | 'secondary'; label: string; bar: string }> = {
  ok: { badge: 'success', label: 'OK', bar: '[&>div]:bg-emerald-500' },
  warning: { badge: 'warning', label: 'Warning', bar: '[&>div]:bg-yellow-500' },
  critical: { badge: 'destructive', label: 'Critical', bar: '[&>div]:bg-red-500' },
  info: { badge: 'secondary', label: 'No limit', bar: '[&>div]:bg-primary' },
};

const STALE_AFTER_MS = 26 * 60 * 60 * 1000;

const digitsFor = (unit: string) => (unit === 'USD' || unit === '%' || unit === 'MB' ? 2 : 0);

interface Props {
  quotas: QuotaRow[];
  loading: boolean;
}

export function QuotasTab({ quotas, loading }: Props) {
  const [selected, setSelected] = useState<string>('resend:emails_month');
  const [days, setDays] = useState(30);

  const grouped = useMemo(() => {
    const map = new Map<string, QuotaRow[]>();
    for (const q of quotas) {
      const arr = map.get(q.service) ?? [];
      arr.push(q);
      map.set(q.service, arr);
    }
    const known = SERVICE_ORDER.filter(s => map.has(s));
    const extra = Array.from(map.keys()).filter(s => !SERVICE_ORDER.includes(s));
    return [...known, ...extra].map(s => ({ service: s, rows: map.get(s)! }));
  }, [quotas]);

  const [selService, selMetric] = selected.split(':');
  const selectedRow = quotas.find(q => q.service === selService && q.metric === selMetric);
  const history = useQuotaHistory(selService || null, selMetric || null, days);

  const chartData = useMemo(() => (history.data ?? []).map(h => ({
    t: format(new Date(h.captured_at), days <= 7 ? 'EEE HH:mm' : 'MMM d'),
    used: Number(h.used),
  })), [history.data, days]);

  const attention = quotas.filter(q => q.level === 'warning' || q.level === 'critical');
  const unverified = quotas.filter(q => q.details?.limit_source === 'settings (unverified)');
  const notSet = quotas.filter(q => q.details?.limit_source === 'not set');

  return (
    <div className="space-y-6">
      {(unverified.length > 0 || notSet.length > 0) && (
        <Card className="border-2 border-yellow-500/30 bg-yellow-500/5">
          <CardContent className="py-3 text-sm flex gap-3">
            <AlertTriangle className="h-5 w-5 text-yellow-500 shrink-0 mt-0.5" />
            <div className="space-y-1">
              {unverified.length > 0 && (
                <p>
                  <span className="font-semibold">Limits not verified:</span>{' '}
                  {unverified.map(u => u.label).join(', ')}. The percentages for these use limits typed into Settings, not limits read from your account. Enter your real plan limits in Settings and switch on “Plan limits verified”.
                </p>
              )}
              {notSet.length > 0 && (
                <p>
                  <span className="font-semibold">No limit set:</span>{' '}
                  {notSet.map(u => u.label).join(', ')}. The measured value is shown, but no percentage or alert is possible until you enter the limit in Settings.
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {attention.length > 0 && (
        <Card className="border-2 border-red-500/30 bg-red-500/5">
          <CardContent className="py-3 text-sm">
            <span className="font-semibold">{attention.length} metric(s) need attention:</span>{' '}
            {attention.map(a => `${a.label} (${fmtNumber(a.used, digitsFor(a.unit))} ${a.unit})`).join(' · ')}
          </CardContent>
        </Card>
      )}

      {grouped.map(({ service, rows }) => (
        <div key={service}>
          <h2 className="text-lg font-semibold mb-3">{SERVICE_LABEL[service] ?? service}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {rows.map(q => {
              const cfg = levelCfg[q.level] ?? levelCfg.info;
              const key = `${q.service}:${q.metric}`;
              const d = q.details ?? {};
              const isThreshold = d.limit_source === 'alert threshold';
              const isUnverified = d.limit_source === 'settings (unverified)';
              const stale = Date.now() - new Date(q.captured_at).getTime() > STALE_AFTER_MS;
              return (
                <Card
                  key={key}
                  className={`cursor-pointer transition-shadow hover:shadow-md ${selected === key ? 'ring-2 ring-primary' : ''}`}
                  onClick={() => setSelected(key)}
                >
                  <CardContent className="p-4 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium">{q.label}</span>
                      <Badge variant={cfg.badge} className="text-[10px] shrink-0">{cfg.label}</Badge>
                    </div>
                    <div className="flex items-baseline gap-1 flex-wrap">
                      <span className="text-2xl font-bold">{fmtNumber(q.used, digitsFor(q.unit))}</span>
                      <span className="text-xs text-muted-foreground">
                        {!isThreshold && q.quota_limit != null ? `/ ${fmtNumber(q.quota_limit, digitsFor(q.unit))} ` : ''}{q.unit}
                      </span>
                    </div>

                    {q.pct != null && q.quota_limit != null && !isThreshold && (
                      <>
                        <Progress value={Math.min(100, Number(q.pct))} className={`h-2 ${cfg.bar}`} />
                        <p className="text-[11px] text-muted-foreground">
                          {fmtNumber(q.pct, 1)}% of {isUnverified ? 'the unverified limit' : 'limit'}
                        </p>
                      </>
                    )}
                    {isThreshold && q.quota_limit != null && (
                      <p className="text-[11px] text-muted-foreground">Alert threshold: {fmtNumber(q.quota_limit, digitsFor(q.unit))} {q.unit}</p>
                    )}
                    {d.limit_source === 'not set' && (
                      <p className="text-[11px] text-yellow-500">Limit not set</p>
                    )}
                    {d.limit_source === 'paid plan: no daily limit' && (
                      <p className="text-[11px] text-muted-foreground">Paid Resend plan: no daily limit</p>
                    )}

                    {d.remaining_usd != null && (
                      <p className="text-[11px] text-muted-foreground">${fmtNumber(Number(d.remaining_usd), 2)} remaining</p>
                    )}
                    {d.attempted != null && (
                      <p className="text-[11px] text-muted-foreground">{fmtNumber(Number(d.failed ?? 0))} rejected of {fmtNumber(Number(d.attempted))} attempted</p>
                    )}
                    {d.cached != null && (
                      <p className="text-[11px] text-muted-foreground">{fmtNumber(Number(d.live ?? 0))} sent to an AI provider · {fmtNumber(Number(d.cached))} served from cache</p>
                    )}
                    {d.api_calls != null && d.source === 'email_log' && (
                      <p className="text-[11px] text-muted-foreground">{fmtNumber(Number(d.api_calls))} sends, counted per recipient</p>
                    )}

                    <p className="text-[10px] text-muted-foreground/80" title={d.source_note ?? ''}>
                      {SOURCE_LABEL[String(d.source ?? '')] ?? 'Platform data'}
                    </p>
                    {d.source_note && <p className="text-[10px] text-muted-foreground/60">{d.source_note}</p>}
                    <p className={`text-[10px] ${stale ? 'text-yellow-500' : 'text-muted-foreground/70'}`}>
                      Measured {formatDistanceToNow(new Date(q.captured_at), { addSuffix: true })}{stale ? ' · out of date' : ''}
                    </p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      ))}

      {loading && quotas.length === 0 && (
        <p className="text-sm text-muted-foreground">Loading usage…</p>
      )}
      {!loading && quotas.length === 0 && (
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">No usage measured yet. Run a check to take the first measurement.</CardContent></Card>
      )}

      {selectedRow && (
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between flex-wrap gap-2">
            <CardTitle className="text-base">{selectedRow.label}: measurements over time</CardTitle>
            <Select value={String(days)} onValueChange={v => setDays(Number(v))}>
              <SelectTrigger className="w-[130px] h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="7">Last 7 days</SelectItem>
                <SelectItem value="30">Last 30 days</SelectItem>
                <SelectItem value="90">Last 90 days</SelectItem>
                <SelectItem value="365">Last 12 months</SelectItem>
              </SelectContent>
            </Select>
          </CardHeader>
          <CardContent>
            {chartData.length > 1 ? (
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="t" tick={{ fontSize: 10 }} minTickGap={24} className="text-muted-foreground" />
                  <YAxis tick={{ fontSize: 10 }} className="text-muted-foreground" />
                  <Tooltip formatter={(v: number) => [`${fmtNumber(v, 2)} ${selectedRow.unit}`, 'Measured']} />
                  {selectedRow.quota_limit != null && (
                    <ReferenceLine
                      y={Number(selectedRow.quota_limit)}
                      stroke="hsl(var(--destructive))"
                      strokeDasharray="4 4"
                      label={{ value: selectedRow.details?.limit_source === 'alert threshold' ? 'Alert threshold' : 'Limit', fontSize: 10, position: 'insideTopRight' }}
                    />
                  )}
                  <Line type="linear" dataKey="used" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 2 }} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">
                {chartData.length === 1 ? 'Only one measurement so far. ' : 'No measurements in this period. '}
                One point is recorded per check.
              </p>
            )}
            <p className="text-[11px] text-muted-foreground mt-2">Each dot is one measurement. The line between dots is not measured data.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
