import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { DiamondOption } from './useDiamondFormOptions';
import { isGlassQuoteEstimator } from '@/lib/quote-estimator-theme';
import { getQuoteStorage, type QuoteVersion } from '@/lib/quote-estimator-version';
import { isQuoteV3OnlyOption } from '@/lib/quote-v3-assets';

type StepType = 'nature' | 'shape' | 'size' | 'quality' | 'setting' | 'holder' | 'band' | 'band_width' | 'metal' | 'personalization';

export type AllDiamondFormOptions = Record<StepType, DiamondOption[]>;

/**
 * Fetches ALL diamond form option tables in a single RPC call
 * using the existing `get_client_diamond_form_options` DB function.
 * Falls back to a batched Promise.all if no client ID is provided.
 */
export function useAllDiamondFormOptions(clientId?: string, version: QuoteVersion = 'v2', includeDisabled = true, enabled = true) {
  return useQuery<AllDiamondFormOptions>({
    queryKey: ['all-diamond-form-options', clientId, version, includeDisabled],
    enabled,
    queryFn: async () => {
      if (clientId) {
        // Use the single RPC that unions all 10 tables
        const { data, error } = await supabase.rpc(getQuoteStorage(clientId, version).options, {
          client_uuid: clientId,
        });
        if (error) throw error;

        const grouped: AllDiamondFormOptions = {
          nature: [], shape: [], size: [], quality: [], setting: [],
          holder: [], band: [], band_width: [], metal: [], personalization: [],
        };

        for (const row of (data ?? [])) {
          const key = row.step_type as StepType;
          // Cuts added for the V3 form stay off V1 / V2 / Ring Builder and their editors.
          if (version !== 'v3' && isQuoteV3OnlyOption(key, row.option_value)) continue;
          // Editor must retain disabled choices so they can be switched back on.
          if (key in grouped && (includeDisabled || row.is_enabled !== false)) {
            grouped[key].push({
              id: row.id,
              option_value: row.option_value,
              name: row.name,
              price: Number(row.price || 0),
              display_order: row.display_order,
              image_url: row.image_url,
            });
          }
        }
        return grouped;
      }

      // Fallback: batch all 10 queries in parallel (no client overrides)
      const tables = [
        ['nature', 'diamond_nature_options'],
        ['shape', 'diamond_shape_options'],
        ['size', 'diamond_size_options'],
        ['quality', 'diamond_quality_options'],
        ['setting', 'ring_setting_options'],
        ['holder', 'diamond_holder_options'],
        ['band', 'band_type_options'],
        ['band_width', 'band_width_options'],
        ['metal', 'ring_metal_options'],
        ['personalization', 'personalization_options'],
      ] as const;

      const results = await Promise.all(
        tables.map(([, table]) =>
          supabase
            .from(table)
            .select('id, option_value, name, price, display_order, image_url')
            .order('display_order', { ascending: true })
        )
      );

      const grouped = {} as AllDiamondFormOptions;
      tables.forEach(([key], i) => {
        const { data, error } = results[i];
        if (error) throw error;
        grouped[key] = ((data ?? []) as DiamondOption[]).filter(
          (o) => version === 'v3' || !isQuoteV3OnlyOption(key, o.option_value)
        );
      });
      return grouped;
    },
    staleTime: 1000 * 60 * 30, // 30 minutes
    gcTime: 1000 * 60 * 60,    // 1 hour
  });
}
