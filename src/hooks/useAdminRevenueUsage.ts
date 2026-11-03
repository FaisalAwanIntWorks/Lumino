import { useQuery } from '@tanstack/react-query';
import { endOfDay, startOfDay } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';

export interface UsageOverviewRow {
  client_id: string;
  company_name: string;
  plan_name: string;
  is_internal: boolean;
  wallet_balance: number;
  free_credits_remaining: number;
  purchased_expires_at: string | null;
  /** Paid top-ups (+ admin-granted credits unless "paid only") − refunds */
  revenue_dollars: number;
  /** Stripe top-ups + auto-recharges only */
  paid_dollars: number;
  /** Credits granted manually by an admin (not money) */
  admin_credit_dollars: number;
  /** Refund claw-backs (already subtracted from revenue_dollars) */
  refund_dollars: number;
  /** AI-usage debits only (chat + image + estimate) */
  cost_dollars: number;
  chat_cost_dollars: number;
  image_cost_dollars: number;
  estimate_cost_dollars: number;
  /** Portion of cost_dollars that was paid with free monthly credits */
  free_credit_cost_dollars: number;
  /** Debits that are NOT usage: credit expiry, admin reset / pause. Not in cost. */
  other_debit_dollars: number;
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
  is_internal: boolean;
  plan_price_monthly: number;
  status: string;
  current_period_end: string | null;
  trial_end: string | null;
  cancel_at_period_end: boolean;
  started_at: string | null;
  paid_since: string | null;
  billed_periods: number;
  mrr: number;
  lifetime_revenue: number;
}

/**
 * The date pickers return local midnight. Send the whole of both edge days
 * so the chosen end date is included and "Refresh" picks up today's rows.
 */
function rangeBounds(start: Date, end: Date) {
  return { p_start: startOfDay(start).toISOString(), p_end: endOfDay(end).toISOString() };
}

export function useUsageOverview(start: Date, end: Date, resoldOnly: boolean, includeInternal = false) {
  const bounds = rangeBounds(start, end);
  return useQuery({
    queryKey: ['admin-usage-overview', bounds.p_start, bounds.p_end, resoldOnly, includeInternal],
    queryFn: async (): Promise<UsageOverviewRow[]> => {
      const { data, error } = await supabase.rpc('admin_get_usage_overview' as never, {
        ...bounds,
        p_resold_only: resoldOnly,
        p_include_internal: includeInternal,
      } as never);
      if (error) throw error;
      return (data ?? []) as UsageOverviewRow[];
    },
    staleTime: 60_000,
  });
}

export function useSubscriptionOverview(includeInternal = false) {
  return useQuery({
    queryKey: ['admin-subscription-overview', includeInternal],
    queryFn: async (): Promise<SubscriptionOverviewRow[]> => {
      const { data, error } = await supabase.rpc('admin_get_subscription_overview' as never, {
        p_include_internal: includeInternal,
      } as never);
      if (error) throw error;
      return (data ?? []) as SubscriptionOverviewRow[];
    },
    staleTime: 60_000,
  });
}
