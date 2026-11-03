import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useAdminImpersonation } from '@/contexts/AdminImpersonationContext';
import {
  DEFAULT_FEATURES,
  GATED_FEATURE_KEYS,
  withFeatureDefaults,
  type ClientFeatures,
} from '@/lib/feature-registry';

// Feature keys, defaults and gating all come from the single registry in
// `src/lib/feature-registry.ts` — never re-declare them here.
export type { ClientFeatures };




export function useClientFeatures() {
  const { user, role, staffInfo } = useAuth();
  const { impersonatedClientId, isImpersonating } = useAdminImpersonation();

  // Determine which client ID to use
  const clientId = isImpersonating
    ? impersonatedClientId
    : role === 'staff'
      ? staffInfo?.clientId
      : null; // For 'client' role, we query by user_id

  const query = useQuery({
    queryKey: ['client-features', user?.id, clientId, isImpersonating],
    queryFn: async (): Promise<ClientFeatures & { __subscriptionActive: boolean; __clientId: string | null }> => {
      let query = supabase
        .from('clients')
        .select('id, enabled_features');

      if (clientId) {
        query = query.eq('id', clientId);
      } else if (user?.id) {
        query = query.eq('user_id', user.id);
      } else {
        return { ...DEFAULT_FEATURES, __subscriptionActive: true, __clientId: null };
      }

      const { data, error } = await query.maybeSingle();

      if (error || !data) {
        return { ...DEFAULT_FEATURES, __subscriptionActive: true, __clientId: null };
      }

      let subscriptionActive = true;
      if (!isImpersonating) {
        try {
          const { data: active } = await supabase.rpc('get_client_subscription_active', {
            client_uuid: (data as any).id,
          });
          if (typeof active === 'boolean') subscriptionActive = active;
        } catch {
          subscriptionActive = true;
        }
      }

      const features = (data as any).enabled_features as Record<string, boolean> | null;
      const base: ClientFeatures = withFeatureDefaults(features);




      return { ...base, __subscriptionActive: subscriptionActive, __clientId: (data as any).id ?? null };
    },
    enabled: !!user || isImpersonating,
    staleTime: 30_000, // Re-fetch every 30s
    refetchOnWindowFocus: true,
  });

  // Widget features that must be disabled when the billing gate says the
  // subscription is inactive (failed payment / cancelled Stripe subscription
  // with no manual override) — sourced from the registry so a newly added module is gated
  // automatically.
  const GATED = GATED_FEATURE_KEYS;



  const raw = query.data ?? { ...DEFAULT_FEATURES, __subscriptionActive: true, __clientId: null };
  const subscriptionActive = raw.__subscriptionActive !== false;
  const resolvedClientId = raw.__clientId ?? null;

  const features: ClientFeatures = { ...raw };
  if (!subscriptionActive) {
    for (const k of GATED) (features as any)[k] = false;
  }

  return {
    features,
    isLoading: query.isLoading,
    subscriptionActive,
    clientId: resolvedClientId,
    isFeatureEnabled: (feature: keyof ClientFeatures) => features[feature],
  };
}
