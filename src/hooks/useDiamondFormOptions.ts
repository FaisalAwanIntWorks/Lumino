import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  getDiamondFormImageUrl,
  usesLegacyDiamondImages,
  usesZaiwarDiamondImages,
  toTransparentDiamondCdn,
  toWebpDiamondCdn,
  getZaiwarDiamondImageUrl,
} from '@/lib/diamond-form-cdn';
import { queueImagePreload, prioritizeImagePreload } from '@/lib/diamond-form-image-preload';
import { toWebpImageUrl } from '@/lib/webp-image-fallback';
import { isQuoteV3OnlyOption, usesV3StockImages, withV3StockImage } from '@/lib/quote-v3-assets';
import { isGlassQuoteEstimator } from '@/lib/quote-estimator-theme';
import { getQuoteStorage, useQuoteVersion, type QuoteVersion } from '@/lib/quote-estimator-version';

export interface DiamondOption {
  id: string;
  option_value: string;
  name: string;
  price: number;
  display_order: number;
  image_url: string | null;
}

type TableName =
  | 'diamond_nature_options'
  | 'diamond_shape_options'
  | 'diamond_size_options'
  | 'diamond_quality_options'
  | 'ring_setting_options'
  | 'diamond_holder_options'
  | 'band_type_options'
  | 'band_width_options'
  | 'ring_metal_options'
  | 'personalization_options';

const TABLE_TO_STEP: Record<TableName, string> = {
  diamond_nature_options: 'nature',
  diamond_shape_options: 'shape',
  diamond_size_options: 'size',
  diamond_quality_options: 'quality',
  ring_setting_options: 'setting',
  diamond_holder_options: 'holder',
  band_type_options: 'band',
  band_width_options: 'band_width',
  ring_metal_options: 'metal',
  personalization_options: 'personalization',
};

const STEP_TO_TABLE = Object.fromEntries(
  Object.entries(TABLE_TO_STEP).map(([table, step]) => [step, table])
) as Record<string, TableName>;

/** Step order used to warm images — matches the default order of the form. */
const PRELOAD_STEP_ORDER = [
  'nature', 'shape', 'size', 'quality', 'setting',
  'holder', 'band', 'band_width', 'metal', 'personalization',
];

/** Row shape returned by `get_client_diamond_form_options`. */
interface ClientOptionRow {
  id: string;
  step_type: string;
  option_value: string;
  name: string;
  price: number | string | null;
  display_order: number;
  image_url: string | null;
  is_enabled?: boolean | null;
}

type OptionsByStep = Record<string, DiamondOption[]>;

const EMPTY_OPTIONS: DiamondOption[] = [];

/**
 * One RPC for the whole form.
 *
 * `get_client_diamond_form_options` already returns every step's rows, but each
 * step used to hold its own query key, so a 12-step run fired the same RPC a
 * dozen times (and the summary screen fired ten at once). All steps now share
 * this single cache entry and slice it with `select`, so navigating forward is
 * a cache read instead of a round trip.
 */
async function fetchClientOptions(clientId: string, version: QuoteVersion): Promise<OptionsByStep> {
  const rpcName = getQuoteStorage(clientId, version).options;
  const { data, error } = await supabase.rpc(rpcName, {
    client_uuid: clientId,
  });
  if (error) throw error;

  // DTT keeps the original images and Zaiwar has its own set; every other
  // (and every new) client gets the transparent CDN set.
  const legacy = usesLegacyDiamondImages(clientId);
  const zaiwar = usesZaiwarDiamondImages(clientId);
  // V2 of the accounts that share the V3 stock set (Sandbox first) shows the
  // same pictures as the V3 form; jeweler uploads and V1 stay as they are.
  const v3Stock = version === 'v2' && usesV3StockImages(clientId);
  const grouped: OptionsByStep = {};

  for (const row of (data ?? []) as ClientOptionRow[]) {
    if (row.is_enabled === false) continue;
    // Cuts added for the V3 form stay off V1 / V2.
    if (version !== 'v3' && isQuoteV3OnlyOption(row.step_type, row.option_value)) continue;
    const table = STEP_TO_TABLE[row.step_type as string];
    if (!table) continue;

    // Resolve the DB image (incl. any per-client custom override) or fall
    // back to the code CDN map. DTT then gets the WebP twin of its legacy
    // artwork, Zaiwar the same file from its own set, and every other client
    // gets it from the transparent CDN. Custom uploads / local paths are
    // untouched either way.
    const resolved = row.image_url || getDiamondFormImageUrl(table, row.option_value);

    // Stock CDN artwork is then requested as WebP; `DiamondOptionImage`
    // falls back to the .png original if the WebP cannot load.
    const stock = toWebpImageUrl(
      legacy
        ? toWebpDiamondCdn(resolved)
        : zaiwar
          ? getZaiwarDiamondImageUrl(table, row.option_value, resolved)
          : toTransparentDiamondCdn(resolved)
    );

    (grouped[row.step_type] ??= []).push({
      id: row.id,
      option_value: row.option_value,
      name: row.name,
      price: Number(row.price || 0),
      display_order: row.display_order,
      image_url: v3Stock ? withV3StockImage(row.step_type, row.option_value, stock) : stock,
    });
  }

  // Warm every step's images in form order while the visitor is still on the
  // welcome/first screen, so later steps render from the HTTP cache.
  queueImagePreload(
    PRELOAD_STEP_ORDER.flatMap((step) => (grouped[step] ?? []).map((o) => o.image_url))
  );

  return grouped;
}

/** Shared cache entry for every step of one client's form. */
function clientOptionsQuery(clientId?: string | null, version: QuoteVersion = 'v2') {
  return {
    queryKey: ['diamond-form-client-options', clientId, version] as const,
    queryFn: () => fetchClientOptions(clientId as string, version),
    enabled: !!clientId,
    staleTime: 1000 * 60 * 10, // cache for 10 minutes
    gcTime: 1000 * 60 * 30,
  };
}

/**
 * Kick the shared fetch off from the form shell so the RPC and the image
 * warm-up both run while the visitor is still on the welcome screen, instead
 * of starting only once the first option step mounts.
 */
export function usePrefetchDiamondFormOptions(clientId?: string | null) {
  const version = useQuoteVersion();
  useQuery<OptionsByStep>(clientOptionsQuery(clientId, version));
}

export function useDiamondFormOptions(table: TableName, clientId?: string | null) {
  const version = useQuoteVersion();
  const step = TABLE_TO_STEP[table];

  const clientQuery = useQuery<OptionsByStep, Error, DiamondOption[]>({
    ...clientOptionsQuery(clientId, version),
    select: (grouped) => grouped[step] ?? EMPTY_OPTIONS,
  });

  const globalQuery = useQuery<DiamondOption[]>({
    queryKey: ['diamond-form-options', table, 'global'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from(table)
        .select('id, option_value, name, price, display_order, image_url')
        .order('display_order', { ascending: true });

      if (error) throw error;
      return ((data ?? []) as DiamondOption[])
        .filter((o) => !isQuoteV3OnlyOption(step, o.option_value))
        .map((o) => ({
          ...o,
          image_url: toWebpImageUrl(o.image_url),
        }));
    },
    enabled: !clientId,
    staleTime: 1000 * 60 * 10,
    gcTime: 1000 * 60 * 30,
  });

  const query = clientId ? clientQuery : globalQuery;
  const options = query.data;

  // The step that is mounted right now jumps the preload queue.
  useEffect(() => {
    if (options && options.length > 0) {
      prioritizeImagePreload(options.map((o) => o.image_url));
    }
  }, [options]);

  return query;
}
