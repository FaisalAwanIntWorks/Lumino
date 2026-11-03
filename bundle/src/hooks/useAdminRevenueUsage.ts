import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface UsageOverviewRow {
  client_id: string;
  company_name: string;
  plan_name: string;
  wallet_balance: number;
  free_credits_remaining: number;
  purchased_expires_at: string | null;
  revenue_dollars: number;
  cost_dollars: number;
  chat_count: number;
  image_count: number;
  estimate_count: number;
  profit_dollars: number;
  margin_pct: number | null;
}

export interface SubscriptionOverviewRow {
  client_id: string;
  company_name: string;
  plan_name: string;
  plan_price_monthly: number;
  status: string;
  current_period_end: string | null;
  trial_end: string | null;
  cancel_at_period_end: boolean;
  started_at: string | null;
  mrr: number;
  lifetime_revenue: number;
}

export function useUsageOverview(start: Date, end: Date, resoldOnly: boolean) {
  return useQuery({
    queryKey: ['admin-usage-overview', start.toISOString(), end.toISOString(), resoldOnly],
    queryFn: async (): Promise<UsageOverviewRow[]> => {
      const { data, error } = await supabase.rpc('admin_get_usage_overview' as never, {
        p_start: start.toISOString(),
        p_end: end.toISOString(),
        p_resold_only: resoldOnly,
      } as never);
      if (error) throw error;
      return (data ?? []) as UsageOverviewRow[];
    },
    staleTime: 60_000,
  });
}

export function useSubscriptionOverview(start: Date, end: Date) {
  return useQuery({
    queryKey: ['admin-subscription-overview', start.toISOString(), end.toISOString()],
    queryFn: async (): Promise<SubscriptionOverviewRow[]> => {
      const { data, error } = await supabase.rpc('admin_get_subscription_overview' as never, {
        p_start: start.toISOString(),
        p_end: end.toISOString(),
      } as never);
      if (error) throw error;
      return (data ?? []) as SubscriptionOverviewRow[];
    },
    staleTime: 60_000,
  });
}
