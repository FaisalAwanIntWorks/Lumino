import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useQuoteVersion } from '@/lib/quote-estimator-version';
import { gemstoneTypeKey, type QuoteEstimatorGemstone, type QuoteGemstoneSort } from '@/lib/quote-estimator-gemstones';
import { quoteSizeToCaratWindow } from '@/lib/quote-estimator-diamonds';

interface Params {
  clientId: string | null | undefined;
  /** V3 gemstone card value ("sapphire", "lapis-lazuli"). */
  gemstone: string | null | undefined;
  /** Quote Estimator size option ("1ct", "1.5ct", "5ct+"); null / unknown lists every carat. */
  size?: string | null;
  sort: QuoteGemstoneSort;
  pageSize: number;
  /** 1-based page. */
  page: number;
  enabled?: boolean;
}

export interface QuoteEstimatorGemstonesResult {
  stones: QuoteEstimatorGemstone[];
  /** Stones of this gemstone in the pool (all pages). */
  total: number;
}

/**
 * One page of the gemstone pool for the customer's gemstone (inside the carat
 * window of the size card when one is given), sorted by price,
 * priced with the V3 settings record's markup (server-side). Keeps the
 * previous page on screen while the next one loads.
 */
export function useQuoteEstimatorGemstones({ clientId, gemstone, size: sizeOption, sort, pageSize, page, enabled = true }: Params) {
  const version = useQuoteVersion();
  const key = gemstoneTypeKey(gemstone);
  const size = Math.max(1, Math.min(100, Math.round(pageSize) || 10));
  const offset = Math.max(0, (Math.max(1, page) - 1) * size);
  // Same half-carat window the diamond picker uses for the size card.
  const { min: caratMin, max: caratMax } = quoteSizeToCaratWindow(sizeOption);
  return useQuery<QuoteEstimatorGemstonesResult>({
    queryKey: ['quote-estimator-gemstones', clientId, version, key, caratMin, caratMax, sort, size, offset],
    enabled: enabled && !!clientId && !!key,
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 30,
    retry: 1,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_quote_estimator_gemstones', {
        p_client_id: clientId!,
        p_gem_key: key,
        p_version: version,
        p_sort: sort,
        p_page_size: size,
        p_offset: offset,
        p_carat_min: caratMin ?? undefined,
        p_carat_max: caratMax ?? undefined,
      });
      if (error) throw error;
      const rows = ((data ?? []) as QuoteEstimatorGemstone[])
        .map(g => ({
          ...g,
          carats: g.carats === null || g.carats === undefined ? null : Number(g.carats),
          length: g.length === null || g.length === undefined ? null : Number(g.length),
          width: g.width === null || g.width === undefined ? null : Number(g.width),
          price: Number(g.price),
          price_per_carat: g.price_per_carat === null || g.price_per_carat === undefined ? null : Number(g.price_per_carat),
          total_count: Number(g.total_count) || 0,
        }))
        .filter(g => Number.isFinite(g.price) && g.price > 0);
      return { stones: rows, total: rows[0]?.total_count ?? 0 };
    },
  });
}
