import { useQuery } from '@tanstack/react-query';
import { AlertTriangle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { FEATURE_REGISTRY, missingFeatureKeys } from '@/lib/feature-registry';

/**
 * Passive drift warning: lists plans whose `feature_set` does not mention every
 * module in the feature registry. A newly added module (e.g. Quote Estimator)
 * can therefore never be silently absent from a tier again.
 */
export function PlanFeatureDriftReport() {
  const { data } = useQuery({
    queryKey: ['plan-feature-drift'],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('subscription_plans')
        .select('id, name, feature_set, auto_created')
        .order('display_order');
      if (error) throw error;

      return (data || [])
        .map((p: any) => ({
          id: p.id as string,
          name: p.name as string,
          missing: missingFeatureKeys(p.feature_set as Record<string, unknown> | null),
        }))
        .filter((p) => p.missing.length > 0);
    },
  });

  if (!data || data.length === 0) return null;

  const labelFor = (key: string) =>
    FEATURE_REGISTRY.find((f) => f.key === key)?.label ?? key;

  return (
    <div className="rounded-md border border-border bg-muted/40 p-4">
      <div className="flex items-start gap-2">
        <AlertTriangle className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
        <div className="space-y-2 text-sm">
          <p className="font-medium">Plan feature drift detected</p>
          <p className="text-muted-foreground">
            These plans don&apos;t say anything about some modules. Clients on them keep whatever
            an admin granted manually, but the plan itself won&apos;t turn the module on.
          </p>
          <ul className="space-y-1">
            {data.map((p) => (
              <li key={p.id}>
                <span className="font-medium">{p.name}</span>
                <span className="text-muted-foreground">
                  {' '}
                  — missing: {p.missing.map(labelFor).join(', ')}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
