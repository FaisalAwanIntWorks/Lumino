import { CLOUDFRONT_CDN_BASE } from './cdn-utils';

type OrderConfiguration = Record<string, unknown>;
type OrderLineItem = {
  image?: string;
  properties?: Record<string, unknown>;
};

export interface OrderRingAssetLookup {
  style: string;
  shank: string;
  shape: string;
  metal: string;
  color: string;
  combinationId: string | null;
  folderPath: string | null;
}

const slugifyOrderValue = (value: string): string =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const getColorFamilyFromValue = (value: string | null | undefined): string | null => {
  if (!value) return null;

  const normalized = value.toLowerCase();
  if (normalized.includes('yellow')) return 'yellow';
  if (normalized.includes('rose') || normalized.includes('pink')) return 'rose';
  if (normalized.includes('white') || normalized.includes('platinum')) return 'white';
  if (normalized.includes('gold')) return 'yellow';

  return null;
};

const getConfigurationSources = (configuration: OrderConfiguration): OrderConfiguration[] => {
  const lineItems = (configuration.line_items as OrderLineItem[] | undefined) ?? [];
  const lineItemProperties = lineItems
    .map((item) => item.properties)
    .filter((value): value is Record<string, unknown> => Boolean(value) && typeof value === 'object');

  return [configuration, ...lineItemProperties];
};

const getFirstStringValue = (sources: OrderConfiguration[], keys: string[]): string => {
  for (const source of sources) {
    for (const key of keys) {
      const value = source[key];
      if (typeof value === 'string' && value.trim()) {
        return value.trim();
      }
    }
  }

  return '';
};

export const getOrderRingAssetLookup = (configuration: Record<string, unknown> | null): OrderRingAssetLookup | null => {
  if (!configuration) return null;

  const sources = getConfigurationSources(configuration);
  const style = getFirstStringValue(sources, ['style_name', 'style', 'Style']);
  const shank = getFirstStringValue(sources, ['shank_name', 'shank', 'Shank']);
  const shape = getFirstStringValue(sources, ['shape_name', 'shape', 'Shape']);
  const metal = getFirstStringValue(sources, ['metal', 'Metal']);
  const explicitColor = getFirstStringValue(sources, ['visual_color_name', 'metal_color', 'color', 'Color']);
  const color = getColorFamilyFromValue(explicitColor) || getColorFamilyFromValue(metal) || slugifyOrderValue(explicitColor);

  const styleSlug = style ? slugifyOrderValue(style) : '';
  const shankSlug = shank ? slugifyOrderValue(shank) : '';
  const shapeSlug = shape ? slugifyOrderValue(shape) : '';
  const hasFullSelection = Boolean(styleSlug && shankSlug && color && shapeSlug);

  return {
    style,
    shank,
    shape,
    metal,
    color,
    combinationId: hasFullSelection ? `${styleSlug}-${shankSlug}-${color}-${shapeSlug}` : null,
    folderPath: hasFullSelection ? `rings/${styleSlug}/${shankSlug}/${color}/${shapeSlug}` : null,
  };
};

/**
 * Build a ring preview thumbnail URL from order configuration.
 * Maps config fields to the CDN folder structure:
 *   {style}/{shank}/{color}/{shape}
 */
export const getOrderRingPreviewUrl = (configuration: Record<string, unknown> | null): string | null => {
  const assetLookup = getOrderRingAssetLookup(configuration);

  if (assetLookup?.folderPath) {
    const cdnPath = assetLookup.folderPath
      .replace(/^rings\//, '')
      .replace(/^solitaire\//, 'Solitaire/');

    return `${CLOUDFRONT_CDN_BASE}/${cdnPath}/image-0.png`;
  }

  const lineItems = configuration?.line_items as OrderLineItem[] | undefined;
  if (lineItems?.[0]?.image) return lineItems[0].image;

  return null;
};

/**
 * Build a compact configuration summary string.
 */
export const getConfigSummary = (configuration: Record<string, unknown> | null): string | null => {
  if (!configuration) return null;

  const sources = getConfigurationSources(configuration);
  const parts = [
    getFirstStringValue(sources, ['style_name', 'style', 'Style']),
    getFirstStringValue(sources, ['shape_name', 'shape', 'Shape']),
    getFirstStringValue(sources, ['carat_value', 'caratRange', 'Carat Range']),
    getFirstStringValue(sources, ['metal', 'Metal', 'visual_color_name', 'metal_color', 'color', 'Color']),
  ].filter(Boolean);

  const unique = [...new Set(parts)];
  return unique.length > 0 ? unique.join(' · ') : null;
};

/**
 * Export an array of orders to a CSV file and trigger download.
 */
export const exportOrdersCsv = (
  orders: Array<{
    id: string;
    customer_name: string;
    customer_email: string;
    total_amount: number;
    status: string;
    created_at: string;
    configuration?: Record<string, unknown> | null;
    shopify_order_id?: string | null;
  }>,
  filename = 'orders-export.csv'
) => {
  const header = ['Order #', 'Customer', 'Email', 'Amount', 'Status', 'Date', 'Configuration'];
  const rows = orders.map(o => {
    const num = (o.configuration as any)?.shopify_order_number || o.shopify_order_id || o.id.slice(0, 8);
    return [
      num,
      o.customer_name,
      o.customer_email,
      o.total_amount,
      o.status,
      new Date(o.created_at).toLocaleDateString(),
      getConfigSummary(o.configuration ?? null) || '',
    ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(',');
  });

  const csv = [header.join(','), ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};
