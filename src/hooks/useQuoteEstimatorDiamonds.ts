import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useQuoteVersion } from '@/lib/quote-estimator-version';
import {
  normalizeGrade,
  quoteShapeToPoolShape,
  quoteSizeToCaratWindow,
  type QuoteEstimatorDiamond,
} from '@/lib/quote-estimator-diamonds';

interface Params {
  clientId: string | null | undefined;
  /** 'natural' | 'lab' from the nature step. */
  stoneType: string | null | undefined;
  /** Quote Estimator shape option value (round, oval, …). */
  shape: string | null | undefined;
  /** Quote Estimator size option value (1ct, 1.5ct, 5ct+ …). */
  size: string | null | undefined;
  enabled?: boolean;
}

export interface QuoteEstimatorDiamondsResult {
  stones: QuoteEstimatorDiamond[];
  /**
   * True when nothing in the configured pool matched the customer's carat
   * window, so the list holds the closest sizes instead (nearest first).
   */
  nearestSizes: boolean;
  /** Start of the customer's carat window, when a size was chosen. */
  targetCarat: number | null;
}

/**
 * Stones the Quote Estimator may offer for the customer's type / shape / carat
 * choice. The account's Diamond Configuration (filter + markup) is applied
 * server-side from the version's settings record; the Colour / Clarity
 * dropdowns and the display limit are applied in the browser on this list,
 * like Ring OS. The carat size is a preference: exact-window stones when
 * there are any, otherwise the configured stones closest to that size, so a
 * configuration that matches stones never shows an empty list.
 */
export function useQuoteEstimatorDiamonds({ clientId, stoneType, shape, size, enabled = true }: Params) {
  const version = useQuoteVersion();
  const type = stoneType === 'lab' ? 'lab' : stoneType === 'natural' ? 'natural' : null;
  const poolShape = quoteShapeToPoolShape(shape);
  const { min, max } = quoteSizeToCaratWindow(size);
  return useQuery<QuoteEstimatorDiamondsResult>({
    queryKey: ['quote-estimator-diamonds', clientId, version, type, poolShape, min, max],
    enabled: enabled && !!clientId,
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 30,
    retry: 1,
    queryFn: async () => {
      const fetchStones = async (caratMin: number | null, caratMax: number | null) => {
        const { data, error } = await supabase.rpc('get_quote_estimator_diamonds', {
          p_client_id: clientId!,
          p_version: version,
          p_stone_type: type ?? undefined,
          p_shape_id: poolShape ?? undefined,
          p_carat_min: caratMin ?? undefined,
          p_carat_max: caratMax ?? undefined,
          p_limit: 300,
        });
        if (error) throw error;
        return ((data ?? []) as QuoteEstimatorDiamond[])
          .map(d => ({
            ...d,
            carat_value: Number(d.carat_value),
            price: Number(d.price),
            color: normalizeGrade(d.color),
            clarity: normalizeGrade(d.clarity),
          }))
          // Belt and braces: a Natural flow never lists lab stones and vice
          // versa, whatever the server returns.
          .filter(d => Number.isFinite(d.price) && d.price > 0 && (!type || d.stone_type === type));
      };

      const exact = await fetchStones(min, max);
      if (exact.length > 0 || min === null) return { stones: exact, nearestSizes: false, targetCarat: min };

      // Nothing in the chosen window: offer the closest sizes from the same
      // configured pool (same type + shape), nearest carat first.
      const target = min;
      const nearest = (await fetchStones(null, null))
        .sort((a, b) => Math.abs(a.carat_value - target) - Math.abs(b.carat_value - target) || a.price - b.price);
      return { stones: nearest, nearestSizes: nearest.length > 0, targetCarat: target };
    },
  });
}
