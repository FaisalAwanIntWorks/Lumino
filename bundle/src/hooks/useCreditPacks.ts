import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { CREDIT_PACKS } from '@/lib/credit-utils';

export type CreditPack = {
  amount: number;
  credits: number;
  label: string;
  bonus: number;
  popular: boolean;
};

export function useCreditPacks(): { packs: readonly CreditPack[]; loading: boolean } {
  const [packs, setPacks] = useState<readonly CreditPack[]>([...CREDIT_PACKS]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from('credit_packs' as any)
      .select('amount_usd, bonus_usd, credits, bonus_credits, label, popular, sort_order')
      .eq('active', true)
      .order('sort_order')
      .then(({ data }) => {
        if (data?.length) {
          setPacks(
            (data as any[]).map((p) => ({
              amount: Number(p.amount_usd),
              credits: Number(p.credits),
              label: String(p.label),
              bonus: Number(p.bonus_credits),
              popular: Boolean(p.popular),
            }))
          );
        }
      })
      .finally(() => setLoading(false));
  }, []);

  return { packs, loading };
}
