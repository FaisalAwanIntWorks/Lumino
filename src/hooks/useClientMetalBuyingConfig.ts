import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useAdminImpersonation } from '@/contexts/AdminImpersonationContext';
import { toast } from 'sonner';

export interface MetalKaratConfig {
  buy_pct: number;
  competitor_pct: number;
}

export interface MetalConfig {
  enabled: boolean;
  karats: Record<string, MetalKaratConfig>;
  /** Refinery sell rate (%) — what this refinery pays for pure metal. Per-metal. */
  refinery_sell_pct?: number;
}

export interface MetalsConfig {
  gold: MetalConfig;
  silver: MetalConfig;
  platinum: MetalConfig;
}

export interface CtaConfig {
  book_url: string;
  call_number: string;
  text_number: string;
}

export interface MetalBuyingConfig {
  id: string;
  client_id: string;
  submission_mode: string;
  deposit_amount: number;
  metals_config: MetalsConfig;
  refinery_sell_pct: number;
  dont_know_enabled: boolean;
  step_order: string[];
  step_labels: Record<string, any>;
  required_contact_fields: Record<string, boolean>;
  form_colors: Record<string, any>;
  onboarding_completed: boolean;
  cta_config: CtaConfig;
  /** Opt-in volume tiers; null/disabled = original pricing. */
  volume_tier_config?: import('@/lib/metal-offer-tiers').VolumeTierConfig | null;
}

const DEFAULT_METALS_CONFIG: MetalsConfig = {
  gold: {
    enabled: true,
    refinery_sell_pct: 99,
    karats: {
      '24K': { buy_pct: 75, competitor_pct: 50 },
      '22K': { buy_pct: 70, competitor_pct: 45 },
      '21K': { buy_pct: 68, competitor_pct: 43 },
      '20K': { buy_pct: 67, competitor_pct: 42 },
      '18K': { buy_pct: 65, competitor_pct: 40 },
      '16K': { buy_pct: 62, competitor_pct: 38 },
      '14K': { buy_pct: 60, competitor_pct: 35 },
      '12K': { buy_pct: 57, competitor_pct: 33 },
      '10K': { buy_pct: 55, competitor_pct: 30 },
      '9K': { buy_pct: 53, competitor_pct: 28 },
      '8K': { buy_pct: 50, competitor_pct: 25 },
    },
  },
  silver: {
    enabled: true,
    refinery_sell_pct: 92,
    karats: {
      '999': { buy_pct: 85, competitor_pct: 60 },
      '958': { buy_pct: 82, competitor_pct: 57 },
      '950': { buy_pct: 80, competitor_pct: 55 },
      '925': { buy_pct: 75, competitor_pct: 50 },
      '900': { buy_pct: 72, competitor_pct: 47 },
      '835': { buy_pct: 68, competitor_pct: 43 },
      '800': { buy_pct: 65, competitor_pct: 40 },
    },
  },
  platinum: {
    enabled: true,
    refinery_sell_pct: 95,
    karats: {
      '999': { buy_pct: 85, competitor_pct: 60 },
      '950': { buy_pct: 80, competitor_pct: 55 },
      '900': { buy_pct: 75, competitor_pct: 50 },
      '850': { buy_pct: 70, competitor_pct: 45 },
    },
  },
};

const DEFAULT_CTA_CONFIG: CtaConfig = {
  book_url: '',
  call_number: '',
  text_number: '',
};

export function useClientMetalBuyingConfig(clientIdOverride?: string) {
  const { user, role, staffInfo } = useAuth();
  const { impersonatedClientId, isImpersonating } = useAdminImpersonation();
  const queryClient = useQueryClient();

  const clientId = clientIdOverride
    ?? (isImpersonating ? impersonatedClientId : null)
    ?? (role === 'staff' ? staffInfo?.clientId : null);

  const query = useQuery({
    queryKey: ['metal-buying-config', clientId, user?.id],
    queryFn: async (): Promise<MetalBuyingConfig | null> => {
      let q = supabase.from('client_metal_buying_config').select('*');

      if (clientId) {
        q = q.eq('client_id', clientId);
      } else if (user?.id) {
        const { data: client } = await supabase
          .from('clients')
          .select('id')
          .eq('user_id', user.id)
          .maybeSingle();
        if (!client) return null;
        q = q.eq('client_id', client.id);
      } else {
        return null;
      }

      const { data, error } = await q.maybeSingle();
      if (error) throw error;
      if (!data) return null;

      return {
        ...data,
        metals_config: (data.metals_config as any) ?? DEFAULT_METALS_CONFIG,
        step_labels: (data.step_labels as any) ?? {},
        required_contact_fields: (data.required_contact_fields as any) ?? { name: true, email: true, phone: true },
        form_colors: (data.form_colors as any) ?? {},
        cta_config: (data.cta_config as any) ?? DEFAULT_CTA_CONFIG,
      } as unknown as MetalBuyingConfig;
    },
    enabled: !!(user || clientIdOverride),
  });

  const saveMutation = useMutation({
    mutationFn: async (updates: Partial<MetalBuyingConfig>) => {
      let targetClientId = clientId;
      if (!targetClientId && user?.id) {
        const { data: client } = await supabase
          .from('clients')
          .select('id')
          .eq('user_id', user.id)
          .maybeSingle();
        targetClientId = client?.id ?? null;
      }
      if (!targetClientId) throw new Error('No client ID');

      const { data: existing } = await supabase
        .from('client_metal_buying_config')
        .select('id')
        .eq('client_id', targetClientId)
        .maybeSingle();

      const payload: Record<string, any> = {
        metals_config: updates.metals_config as any,
        refinery_sell_pct: updates.refinery_sell_pct,
        dont_know_enabled: updates.dont_know_enabled,
        onboarding_completed: updates.onboarding_completed,
      };
      if (updates.cta_config !== undefined) payload.cta_config = updates.cta_config as any;
      if (updates.volume_tier_config !== undefined) payload.volume_tier_config = updates.volume_tier_config as any;
      if (updates.form_colors !== undefined) payload.form_colors = updates.form_colors as any;

      if (existing) {
        const { error } = await supabase
          .from('client_metal_buying_config')
          .update(payload)
          .eq('client_id', targetClientId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('client_metal_buying_config')
          .insert({ client_id: targetClientId, ...payload });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['metal-buying-config'] });
      toast.success('Metal IQ config saved');
    },
    onError: (err: any) => {
      toast.error(`Failed to save: ${err.message}`);
    },
  });

  return {
    config: query.data,
    isLoading: query.isLoading,
    save: saveMutation.mutate,
    isSaving: saveMutation.isPending,
    defaultMetalsConfig: DEFAULT_METALS_CONFIG,
    defaultCtaConfig: DEFAULT_CTA_CONFIG,
  };
}
