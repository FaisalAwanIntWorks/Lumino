import { Fragment } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import {
  DEFAULT_FEATURES,
  FEATURE_REGISTRY,
  keysForGroup,
  GATED_FEATURE_KEYS,
} from '@/lib/feature-registry';
import { PlanFeatureDriftReport } from './PlanFeatureDriftReport';
import { ClientAccessAlertsFeed } from './ClientAccessAlertsFeed';

interface ClientRow {
  id: string;
  company_name: string;
  email: string;
  status: string | null;
  enabled_features: Record<string, boolean>;
  /** False when billing blocks the widgets (failed payment / cancelled sub). */
  widgets_live: boolean;
}

interface FeatureColumn {
  label: string;
  keys: string[];
}

interface FeatureGroup extends FeatureColumn {
  // When present, the group toggle cascades to these forms and each one also
  // gets its own column so a client can be granted a single form on its own.
  children?: FeatureColumn[];
}

// Product groups are derived from the feature registry
// (`src/lib/feature-registry.ts`) so a newly added module automatically shows
// up here instead of being silently missing from the admin matrix.
const FEATURE_GROUPS: FeatureGroup[] = [
  { label: 'RingOS', keys: keysForGroup('RingOS') },
  {
    label: 'CustomX',
    keys: keysForGroup('CustomX'),
    children: keysForGroup('CustomX').map((key) => ({
      label: FEATURE_REGISTRY.find((f) => f.key === key)?.label ?? key,
      keys: [key],
    })),
  },
  { label: 'Metal IQ', keys: keysForGroup('Metal IQ') },
];

// Each group spans its own "All" toggle plus one column per child form.
const groupSpan = (group: FeatureGroup) => (group.children ? group.children.length + 1 : 1);

function isGroupEnabled(features: Record<string, boolean>, keys: string[]): boolean {
  return keys.every(k => features[k] !== false);
}

function enabledCount(features: Record<string, boolean>, keys: string[]): number {
  return keys.filter(k => features[k] !== false).length;
}

export function ClientFeatureMatrix() {
  const queryClient = useQueryClient();

  const { data: clients, isLoading } = useQuery({
    queryKey: ['admin-client-features'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('clients')
        .select('id, company_name, email, status, enabled_features')
        .order('company_name');

      if (error) throw error;

      // The toggles below are the admin's module permissions; billing never
      // changes them. Whether the widgets are actually live also depends on
      // the billing gate, so read it from the same RPC the embeds use.
      const live = await Promise.all(
        (data || []).map(async (c: any) => {
          const { data: active } = await supabase.rpc('get_client_subscription_active', {
            client_uuid: c.id,
          });
          return active !== false;
        }),
      );

      return (data || []).map((c: any, i: number) => ({
        ...c,
        enabled_features: {
          ...DEFAULT_FEATURES,
          ...(c.enabled_features || {}),
        },
        widgets_live: live[i],
      })) as ClientRow[];
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async ({
      clientId,
      keys,
      enabled,
      currentFeatures,
    }: {
      clientId: string;
      keys: string[];
      enabled: boolean;
      currentFeatures: Record<string, boolean>;
    }) => {
      const updatedFeatures = { ...currentFeatures };
      keys.forEach(k => { updatedFeatures[k] = enabled; });

      const { error } = await supabase
        .from('clients')
        .update({ enabled_features: updatedFeatures } as any)
        .eq('id', clientId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-client-features'] });
      toast.success('Feature access updated');
    },
    onError: () => {
      toast.error('Failed to update feature access');
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!clients || clients.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        No clients found.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PlanFeatureDriftReport />
      <ClientAccessAlertsFeed />
      <div>
        <h3 className="font-semibold text-lg mb-1">Client Feature Access</h3>
        <p className="text-sm text-muted-foreground">
          Enable or disable product access for each client. Changes take effect immediately.
        </p>
      </div>

      <div className="overflow-auto max-h-[calc(100vh-10rem)]">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-20 bg-background">
            <tr className="border-b border-border/40">
              <th
                rowSpan={2}
                className="text-left py-3 px-3 font-semibold min-w-[180px] sticky left-0 bg-background z-10 align-bottom"
              >
                Client
              </th>
              {FEATURE_GROUPS.map(group => (
                <th
                  key={group.label}
                  colSpan={groupSpan(group)}
                  rowSpan={group.children ? 1 : 2}
                  className={`text-center py-3 px-4 font-semibold text-sm whitespace-nowrap ${
                    group.children ? 'border-x border-border/60' : 'align-bottom'
                  }`}
                >
                  {group.label}
                </th>
              ))}
            </tr>
            <tr className="border-b border-border">
              {FEATURE_GROUPS.filter(g => g.children).map(group => (
                <Fragment key={group.label}>
                  <th className="text-center py-2 px-4 text-xs font-medium text-muted-foreground border-l border-border/60 whitespace-nowrap">
                    All
                  </th>
                  {group.children!.map((child, i) => (
                    <th
                      key={child.label}
                      className={`text-center py-2 px-4 text-xs font-medium text-muted-foreground whitespace-nowrap ${
                        i === group.children!.length - 1 ? 'border-r border-border/60' : ''
                      }`}
                    >
                      {child.label}
                    </th>
                  ))}
                </Fragment>
              ))}
            </tr>
          </thead>
          <tbody>
            {clients.map((client) => (
              <tr key={client.id} className="border-b border-border/30 hover:bg-muted/30 transition-colors">
                <td className="py-3 px-3 sticky left-0 bg-background z-10">
                  <div>
                    <p className="font-medium text-sm">{client.company_name}</p>
                    <p className="text-xs text-muted-foreground truncate max-w-[220px]">{client.email}</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className={`w-1.5 h-1.5 rounded-full ${client.status === 'active' ? 'bg-green-500' : 'bg-muted-foreground/40'}`} />
                      <p className="text-xs text-muted-foreground capitalize">{client.status || 'unknown'}</p>
                    </div>
                    {!client.widgets_live && (
                      <p
                        className="text-xs font-medium text-destructive mt-0.5"
                        title="Payment failed or Stripe subscription cancelled — modules are off until the payment goes through, then the same modules turn back on."
                      >
                        Widgets off — billing
                      </p>
                    )}
                  </div>
                </td>
                {FEATURE_GROUPS.map((group) => {
                  // While billing blocks the client (failed payment / cancelled
                  // subscription) the widget modules show OFF and are locked.
                  // The admin's saved permissions are kept untouched, so the
                  // same modules show ON again as soon as the payment goes
                  // through.
                  const billingLocked = !client.widgets_live;
                  const shown: Record<string, boolean> = billingLocked
                    ? {
                        ...client.enabled_features,
                        ...Object.fromEntries(GATED_FEATURE_KEYS.map((k) => [k, false])),
                      }
                    : client.enabled_features;
                  const lockTitle = billingLocked
                    ? 'Off because of billing (failed payment / cancelled subscription). Turns back on automatically when the payment goes through.'
                    : undefined;
                  const toggle = (keys: string[], enabled: boolean) =>
                    toggleMutation.mutate({
                      clientId: client.id,
                      keys,
                      enabled,
                      currentFeatures: client.enabled_features,
                    });

                  const groupCell = (
                    <td
                      key={group.label}
                      className={`text-center py-3 px-4 ${group.children ? 'border-l border-border/60' : ''}`}
                    >
                      <Switch
                        checked={isGroupEnabled(shown, group.keys)}
                        onCheckedChange={(checked) => toggle(group.keys, checked)}
                        disabled={toggleMutation.isPending || billingLocked}
                        title={lockTitle}
                        aria-label={`${group.label} access for ${client.company_name}`}
                      />
                      {group.children && (
                        <p className="text-[11px] text-muted-foreground mt-1 tabular-nums">
                          {enabledCount(shown, group.keys)}/{group.keys.length}
                        </p>
                      )}
                    </td>
                  );

                  if (!group.children) return groupCell;

                  return (
                    <Fragment key={group.label}>
                      {groupCell}
                      {group.children.map((child, i) => (
                        <td
                          key={child.label}
                          className={`text-center py-3 px-4 ${
                            i === group.children!.length - 1 ? 'border-r border-border/60' : ''
                          }`}
                        >
                          <Switch
                            checked={isGroupEnabled(shown, child.keys)}
                            onCheckedChange={(checked) => toggle(child.keys, checked)}
                            disabled={toggleMutation.isPending || billingLocked}
                            title={lockTitle}
                            aria-label={`${child.label} access for ${client.company_name}`}
                          />
                        </td>
                      ))}
                    </Fragment>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
