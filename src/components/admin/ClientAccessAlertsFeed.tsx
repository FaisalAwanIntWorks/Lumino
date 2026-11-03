import { useQuery } from '@tanstack/react-query';
import { ShieldAlert, Circle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { FEATURE_REGISTRY } from '@/lib/feature-registry';
import { Badge } from '@/components/ui/badge';

/**
 * Live audit feed of access state changes (module revoked/granted, account
 * status flip, plan change, billing status flip, manual billing override).
 * Every row here also fired an admin bell notification, and critical rows also
 * emailed the admins. Rows where the client's widgets were actually activated
 * or deactivated additionally alerted the super admins.
 */

interface AccessEventRow {
  id: string;
  client_id: string;
  event_type: string;
  severity: string;
  source: string | null;
  revoked_keys: string[] | null;
  granted_keys: string[] | null;
  before_state: Record<string, unknown> | null;
  after_state: Record<string, unknown> | null;
  created_at: string;
  clients?: { company_name: string | null } | null;
}

const labelFor = (key: string) =>
  FEATURE_REGISTRY.find((f) => f.key === key)?.label ?? key;

const fmtDate = (v: unknown) => {
  if (typeof v !== 'string' || !v) return '—';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString();
};

/**
 * Widget badge for a row. Billing rows carry the gate result before and after
 * the change, so a real flip reads "widgets deactivated/activated" instead of
 * a bare state; other rows just show the current state.
 */
function widgetBadge(e: AccessEventRow): { label: string; variant: 'secondary' | 'destructive' } | null {
  const after = (e.after_state ?? {}) as Record<string, unknown>;
  const before = (e.before_state ?? {}) as Record<string, unknown>;
  if (typeof after.widgets_live !== 'boolean') return null;
  const live = after.widgets_live;
  const flipped = typeof before.widgets_live === 'boolean' && before.widgets_live !== live;
  if (flipped) {
    return live
      ? { label: 'widgets activated', variant: 'secondary' }
      : { label: 'widgets deactivated', variant: 'destructive' };
  }
  return live
    ? { label: 'widgets live', variant: 'secondary' }
    : { label: 'widgets blocked', variant: 'destructive' };
}

function describe(e: AccessEventRow): string {
  const before = (e.before_state ?? {}) as Record<string, unknown>;
  const after = (e.after_state ?? {}) as Record<string, unknown>;

  switch (e.event_type) {
    case 'features_changed': {
      const parts: string[] = [];
      if (e.revoked_keys?.length) parts.push(`revoked ${e.revoked_keys.map(labelFor).join(', ')}`);
      if (e.granted_keys?.length) parts.push(`granted ${e.granted_keys.map(labelFor).join(', ')}`);
      return parts.join(' · ') || 'modules changed';
    }
    case 'client_status_changed':
      return `account status ${String(before.status ?? '—')} → ${String(after.status ?? '—')}`;
    case 'plan_changed':
      return `plan ${String(before.plan_name ?? '—')} → ${String(after.plan_name ?? '—')}`;
    case 'subscription_status_changed':
      return `billing ${String(before.subscription_status ?? '—')} → ${String(after.subscription_status ?? '—')}${
        after.cancel_at_period_end ? ' (cancels at period end)' : ''
      }`;
    case 'billing_override_changed':
      return after.billing_override_until
        ? `billing override set until ${fmtDate(after.billing_override_until)}${
            after.billing_override_reason ? ` — ${String(after.billing_override_reason)}` : ''
          }`
        : 'billing override cleared';
    default:
      return e.event_type;
  }
}

export function ClientAccessAlertsFeed() {
  const { data } = useQuery({
    queryKey: ['client-access-events'],
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('client_access_events')
        .select('id, client_id, event_type, severity, source, revoked_keys, granted_keys, before_state, after_state, created_at, clients(company_name)')
        .order('created_at', { ascending: false })
        .limit(15);
      if (error) throw error;
      return (data ?? []) as unknown as AccessEventRow[];
    },
  });

  if (!data || data.length === 0) return null;

  return (
    <div className="rounded-md border border-border p-4 space-y-3">
      <div className="flex items-start gap-2">
        <ShieldAlert className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
        <div>
          <p className="text-sm font-medium">Recent access changes</p>
          <p className="text-xs text-muted-foreground">
            Every revocation or state flip, whoever made it. Critical rows also emailed the admins.
            Widgets go dark on the first failed Stripe payment (or a cancellation) and come back
            on when the payment goes through; super admins are alerted
            whenever a client&apos;s widgets are deactivated or activated.
          </p>
        </div>
      </div>

      <ul className="space-y-2">
        {data.map((e) => {
          const badge = widgetBadge(e);
          return (
            <li key={e.id} className="text-sm flex flex-wrap items-center gap-x-2 gap-y-1">
              <Circle
                className={`h-2 w-2 shrink-0 fill-current ${
                  e.severity === 'critical' ? 'text-destructive' : 'text-muted-foreground'
                }`}
              />
              <span className="font-medium">{e.clients?.company_name ?? 'Unknown client'}</span>
              <span className="text-muted-foreground">— {describe(e)}</span>
              {badge && (
                <Badge variant={badge.variant} className="text-[10px]">
                  {badge.label}
                </Badge>
              )}
              <span className="text-xs text-muted-foreground ml-auto whitespace-nowrap">
                {new Date(e.created_at).toLocaleString()} · {e.source ?? 'system'}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
