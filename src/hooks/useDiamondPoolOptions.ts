import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { DiamondPoolDistinctValues } from '@/lib/diamond-pool-normalize';

const EMPTY: DiamondPoolDistinctValues = {
  shapes: [], colors: [], clarities: [], cuts: [],
  polish: [], symmetry: [], fluorescence: [], labs: [],
};

/**
 * Returns the distinct option values currently present in
 * `diamond_inventory_pool`. Used by the Diamond Catalog wizard to union
 * pool-discovered values with its hardcoded option lists.
 */
export function useDiamondPoolOptions() {
  return useQuery<DiamondPoolDistinctValues>({
    queryKey: ['diamond-pool-distinct-values'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_diamond_pool_distinct_values');
      if (error) {
        console.warn('[useDiamondPoolOptions] RPC failed, falling back to empty:', error.message);
        return EMPTY;
      }
      const v = (data ?? {}) as Partial<DiamondPoolDistinctValues>;
      return {
        shapes:       v.shapes       ?? [],
        colors:       v.colors       ?? [],
        clarities:    v.clarities    ?? [],
        cuts:         v.cuts         ?? [],
        polish:       v.polish       ?? [],
        symmetry:     v.symmetry     ?? [],
        fluorescence: v.fluorescence ?? [],
        labs:         v.labs         ?? [],
      };
    },
    staleTime: 1000 * 60 * 30,
    gcTime: 1000 * 60 * 60,
  });
}
