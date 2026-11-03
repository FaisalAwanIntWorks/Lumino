/**
 * DiamondCatalogLive
 * ------------------
 * Pool-driven Diamond Catalog (replaces the 6-step DiamondCatalogWizard).
 *
 * Behavior:
 *  - Reads master `diamond_inventory_pool` live.
 *  - Left sidebar exposes the same option groups the wizard used to ask for.
 *  - As the user toggles filters, the right grid + total count update via
 *    the `get_diamond_pool_preview` RPC.
 *  - Markup % (Natural / Lab) recomputes displayed price live.
 *  - "Confirm Catalog" upserts `client_diamond_catalog_filter` with
 *    is_confirmed=true. From that moment the widget — which reads via
 *    `get_diamond_presets_filtered` — receives this filtered, marked-up
 *    view from the pool.
 *
 * Widget compatibility: NOTHING in the widget needs to change. The RPC
 * keeps its existing return shape; when no confirmed filter exists, it
 * falls back to the legacy `client_diamond_presets` table.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { toast } from 'sonner';
import { Check, Loader2, RotateCcw, Gem, Sparkles } from 'lucide-react';
import { Slider } from '@/components/ui/slider';
import { DiamondProductCard } from '@/components/catalog/DiamondProductCard';
import { DiamondPagination } from '@/components/catalog/DiamondPagination';
import { ShapeIcon } from '@/components/common/ShapeIcon';
import { filterRingOsCatalogShapeValues, isRingOsCatalogShape } from '@/lib/ring-os-catalog-shapes';
import { cn } from '@/lib/utils';
import { formatCurrency, getCurrencySymbol } from '@/lib/pricing-utils';
import { RING_OS_CURRENCY_META, type RingOsCurrency } from '@/lib/ring-os-currency';

interface Props {
  clientId: string;
  shapeNameLookup?: Record<string, string>;
  currency?: string;
  /** Ring OS catalogue currency (Sandbox only, src/lib/ring-os-currency.ts); one setting for ring and diamonds. */
  ringCurrency?: RingOsCurrency;
  /** Published effective USD -> GBP / CAD rates (get_diamond_fx_published_rates). */
  fxRates?: { GBP: number; CAD: number } | null;
  /** Opens the Ring OS catalogue currency dialog (the only place the currency is chosen). */
  onChangeCurrency?: () => void;
}

interface CatalogFilter {
  stoneTypes: string[];
  shapes: string[];
  caratMin: string;
  caratMax: string;
  caratRanges: number[];
  colors: string[];
  clarities: string[];
  cuts: string[];
  polish: string[];
  symmetry: string[];
  fluorescence: string[];
  labs: string[];
  canadianOnly: boolean;
  lengthMin: string;
  lengthMax: string;
  priceMinNatural: number;
  priceMaxNatural: number;
  priceMinLab: number;
  priceMaxLab: number;
  priceSort: 'high_to_low' | 'low_to_high';
  limitPerType: number; // 0 = no cap (show all)
}

interface PriceBounds {
  minNatural: number;
  maxNatural: number;
  minLab: number;
  maxLab: number;
}

const EMPTY_FILTER: CatalogFilter = {
  stoneTypes: [],
  shapes: [],
  caratMin: '',
  caratMax: '',
  caratRanges: [],
  colors: [],
  clarities: [],
  cuts: [],
  polish: [],
  symmetry: [],
  fluorescence: [],
  labs: [],
  canadianOnly: false,
  lengthMin: '',
  lengthMax: '',
  priceMinNatural: 0,
  priceMaxNatural: 0,
  priceMinLab: 0,
  priceMaxLab: 0,
  priceSort: 'high_to_low',
  limitPerType: 0,
};

const LIMIT_PER_TYPE_OPTIONS: ReadonlyArray<{ value: number; label: string }> = [
  { value: 2,  label: '2' },
  { value: 5,  label: '5' },
  { value: 10, label: '10' },
  { value: 20, label: '20' },
  { value: 50, label: '50' },
  { value: 100, label: '100' },
  { value: 0,  label: 'All' },
] as const;

const EMPTY_PRICE_BOUNDS: PriceBounds = {
  minNatural: 0, maxNatural: 0,
  minLab: 0, maxLab: 0,
};

const CARAT_RANGE_OPTIONS: ReadonlyArray<{ value: number; label: string }> = [
  { value: 0.5, label: '0.50 - 0.99 ct' },
  { value: 1.0, label: '1.00 - 1.49 ct' },
  { value: 1.5, label: '1.50 - 1.99 ct' },
  { value: 2.0, label: '2.00 - 2.49 ct' },
  { value: 2.5, label: '2.50 - 2.99 ct' },
  { value: 3.0, label: '3.00 - 3.49 ct' },
  { value: 3.5, label: '3.50 - 3.99 ct' },
  { value: 4.0, label: '4.00 - 4.49 ct' },
  { value: 4.5, label: '4.50 - 4.99 ct' },
  { value: 5.0, label: '5.00 - 5.49 ct' },
  { value: 5.5, label: '5.50 - 5.99 ct' },
  { value: 6.0, label: '6.00 - 6.49 ct' },
  { value: 6.5, label: '6.50 - 6.99 ct' },
  { value: 7.0, label: '7.00 - 7.49 ct' },
  { value: 7.5, label: '7.50 - 7.99 ct' },
  { value: 8.0, label: '8.00 - 8.49 ct' },
] as const;

const PAGE_SIZE = 25;

interface PoolDistinct {
  shapes: string[];
  colors: string[];
  clarities: string[];
  cuts: string[];
  polish: string[];
  symmetry: string[];
  fluorescence: string[];
  labs: string[];
}

const EMPTY_DISTINCT: PoolDistinct = {
  shapes: [], colors: [], clarities: [], cuts: [],
  polish: [], symmetry: [], fluorescence: [], labs: [],
};

interface PreviewRow {
  id: string;
  stone_type: string;
  shape_id: string;
  carat_value: number;
  color: string;
  clarity: string;
  base_price: number;
  total_count: number;
}

const NONE_SELECTED_SENTINEL = '__none_selected__';

const uniqueValues = (values: string[]) => Array.from(new Set(values.filter(Boolean)));

// Colors permanently hidden from the customer-facing catalog filter UI.
// Matched case-insensitively against normalized pool values.
const EXCLUDED_COLORS = new Set([
  'K FAINT',
  'K FAINT BROWN',
  'K FAINT PINKISH BROWN',
  'L FAINT BROWN',
  'M FAINT BROWN',
]);
const filterExcludedColors = (values: string[]) =>
  values.filter((v) => !EXCLUDED_COLORS.has(String(v).trim().toUpperCase()));

const shapeIdsFromDistinct = (d: PoolDistinct) => uniqueValues(d.shapes.map((s) => s.toLowerCase().split(' ')[0]));

const allOptionValues = (d: PoolDistinct): Record<keyof Pick<CatalogFilter, 'stoneTypes' | 'shapes' | 'colors' | 'clarities' | 'cuts' | 'polish' | 'symmetry' | 'fluorescence' | 'labs'>, string[]> => ({
  stoneTypes: ['natural', 'lab'],
  shapes: shapeIdsFromDistinct(d),
  colors: filterExcludedColors(uniqueValues(d.colors)),
  clarities: uniqueValues(d.clarities),
  cuts: uniqueValues(d.cuts),
  polish: uniqueValues(d.polish),
  symmetry: uniqueValues(d.symmetry),
  fluorescence: uniqueValues(d.fluorescence),
  labs: uniqueValues(d.labs),
});

const createDefaultFilter = (d: PoolDistinct): CatalogFilter => ({
  ...EMPTY_FILTER,
  ...allOptionValues(d),
});

const hydrateFilterFromServer = (saved: Partial<CatalogFilter>, d: PoolDistinct): CatalogFilter => {
  const defaults = createDefaultFilter(d);
  const hydrated: CatalogFilter = { ...defaults, ...saved };
  Object.keys(allOptionValues(d)).forEach((key) => {
    const k = key as keyof ReturnType<typeof allOptionValues>;
    const selected = saved[k];
    if (!Array.isArray(selected)) {
      hydrated[k] = defaults[k];
      return;
    }
    hydrated[k] = selected.includes(NONE_SELECTED_SENTINEL) ? [] : uniqueValues(selected);
  });
  hydrated.caratRanges = Array.isArray(saved.caratRanges)
    ? Array.from(new Set(saved.caratRanges.map(Number).filter((v) => Number.isFinite(v)))).sort((a, b) => a - b)
    : [];
  hydrated.priceMinNatural = typeof saved.priceMinNatural === 'number' ? saved.priceMinNatural : 0;
  hydrated.priceMaxNatural = typeof saved.priceMaxNatural === 'number' ? saved.priceMaxNatural : 0;
  hydrated.priceMinLab = typeof saved.priceMinLab === 'number' ? saved.priceMinLab : 0;
  hydrated.priceMaxLab = typeof saved.priceMaxLab === 'number' ? saved.priceMaxLab : 0;
  hydrated.priceSort = saved.priceSort === 'low_to_high' ? 'low_to_high' : 'high_to_low';
  hydrated.limitPerType = typeof saved.limitPerType === 'number' && Number.isFinite(saved.limitPerType) && saved.limitPerType > 0
    ? Math.floor(saved.limitPerType)
    : 0;
  return hydrated;
};

const isSameSelection = (selected: string[], allValues: string[]) => {
  const selectedSet = new Set(selected);
  const allSet = new Set(allValues);
  return selectedSet.size === allSet.size && allValues.every((value) => selectedSet.has(value));
};

const cleanFilterForServer = (f: CatalogFilter, d: PoolDistinct): Record<string, unknown> => {
  const out: Record<string, unknown> = {};
  const allValues = allOptionValues(d);
  const setArr = (k: keyof typeof allValues) => {
    const available = allValues[k];
    const selected = uniqueValues(f[k]);
    // Empty selection = no restriction on this filter (treat as "all")
    if (available.length === 0 || selected.length === 0 || isSameSelection(selected, available)) return;
    out[k] = selected;
  };
  setArr('stoneTypes');
  // Shapes are always sent explicitly (never "no restriction"): the pool holds
  // shapes Ring OS does not support, and an open shape filter would let them
  // into the catalogue listing, the saved filter and the Ring OS widget.
  {
    const available = allValues.shapes.filter(isRingOsCatalogShape);
    const selected = uniqueValues(f.shapes).filter(isRingOsCatalogShape);
    if (available.length > 0) out.shapes = selected.length > 0 ? selected : available;
  }
  setArr('colors');
  setArr('clarities');
  setArr('cuts');
  setArr('polish');
  setArr('symmetry');
  setArr('fluorescence');
  setArr('labs');
  if (f.caratMin) out.caratMin = f.caratMin;
  if (f.caratMax) out.caratMax = f.caratMax;
  if (Array.isArray(f.caratRanges) && f.caratRanges.length > 0) {
    out.caratRanges = f.caratRanges;
  }
  if (f.lengthMin) out.lengthMin = f.lengthMin;
  if (f.lengthMax) out.lengthMax = f.lengthMax;
  if (f.canadianOnly) out.canadianOnly = true;
  if (f.priceMinNatural > 0) out.priceMinNatural = f.priceMinNatural;
  if (f.priceMaxNatural > 0) out.priceMaxNatural = f.priceMaxNatural;
  if (f.priceMinLab > 0) out.priceMinLab = f.priceMinLab;
  if (f.priceMaxLab > 0) out.priceMaxLab = f.priceMaxLab;
  if (f.priceSort === 'low_to_high') out.priceSort = 'low_to_high';
  if (f.limitPerType && f.limitPerType > 0) out.limitPerType = Math.floor(f.limitPerType);
  return out;
};

const toggleInArray = (arr: string[], value: string) =>
  arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value];

export function DiamondCatalogLive({ clientId, shapeNameLookup, ringCurrency, fxRates, onChangeCurrency }: Props) {
  // Diamond inventory prices come from the shared pool sheets, which are always USD,
  // and are never shown in the account currency. Exception: a Sandbox GBP / CAD
  // Ring OS catalogue — the diamonds follow that one currency. Filters and the saved
  // filter stay on the USD sheet price; labels and preview cards show the published
  // FX rate applied, as a preview only. Ring OS reads the stored per-diamond prices.
  const fxRate = ringCurrency && ringCurrency !== 'USD' ? fxRates?.[ringCurrency] ?? null : null;
  const showConverted = !!fxRate && fxRate > 0;
  const currency = showConverted ? (ringCurrency as RingOsCurrency) : 'USD';
  const currencySymbol = getCurrencySymbol(currency);
  const toDisplay = (usd: number) => (showConverted ? Math.round(usd * (fxRate as number) * 100) / 100 : usd);
  const [filter, setFilter] = useState<CatalogFilter>(EMPTY_FILTER);
  const [markupNatural, setMarkupNatural] = useState<number>(0);
  const [markupLab, setMarkupLab] = useState<number>(0);
  const [isConfirmed, setIsConfirmed] = useState(false);
  const [confirmedAt, setConfirmedAt] = useState<string | null>(null);

  const [priceBounds, setPriceBounds] = useState<PriceBounds>(EMPTY_PRICE_BOUNDS);
  const [distinct, setDistinct] = useState<PoolDistinct>(EMPTY_DISTINCT);
  const [rows, setRows] = useState<PreviewRow[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const previewRequestId = useRef(0);
  const lastNonPriceKeyRef = useRef<string>('');
  const priceBoundsInitRef = useRef(false);
  const [shapeCounts, setShapeCounts] = useState<Record<string, number>>({});
  const shapeCountsRequestId = useRef(0);

  // ----- Load saved filter (if any) + pool distinct values -----
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [savedRes, distinctRes, priceRangeRes] = await Promise.all([
        supabase
          .from('client_diamond_catalog_filter')
          .select('filter, markup_natural, markup_lab, is_confirmed, confirmed_at')
          .eq('client_id', clientId)
          .maybeSingle(),
        supabase.rpc('get_diamond_pool_distinct_values'),
        supabase.rpc('get_diamond_pool_price_range'),
      ]);
      if (cancelled) return;
      const rawDistinct: PoolDistinct = distinctRes.data
        ? { ...EMPTY_DISTINCT, ...(distinctRes.data as Partial<PoolDistinct>) }
        : EMPTY_DISTINCT;
      // Ring OS stays on its eight shapes: the new pool shapes are never offered here.
      const d: PoolDistinct = { ...rawDistinct, shapes: filterRingOsCatalogShapeValues(rawDistinct.shapes), colors: filterExcludedColors(rawDistinct.colors) };
      setDistinct(d);
      if (priceRangeRes.data) {
        const pr = priceRangeRes.data as { minNatural: number; maxNatural: number; minLab: number; maxLab: number };
        setPriceBounds({
          minNatural: Number(pr.minNatural) || 0,
          maxNatural: Number(pr.maxNatural) || 0,
          minLab: Number(pr.minLab) || 0,
          maxLab: Number(pr.maxLab) || 0,
        });
      }
      if (savedRes.data) {
        const f = (savedRes.data.filter as Partial<CatalogFilter>) ?? {};
        setFilter(hydrateFilterFromServer(f, d));
        setMarkupNatural(Number(savedRes.data.markup_natural) || 0);
        setMarkupLab(Number(savedRes.data.markup_lab) || 0);
        setIsConfirmed(!!savedRes.data.is_confirmed);
        setConfirmedAt(savedRes.data.confirmed_at ?? null);
      } else {
        // First-time default: ALL options checked → entire pool visible
        setFilter(createDefaultFilter(d));
      }
    })();
    return () => { cancelled = true; };
  }, [clientId]);

  // ----- Fetch preview rows whenever filter / markup / page changes -----
  const fetchPreview = useCallback(async () => {
    const requestId = previewRequestId.current + 1;
    previewRequestId.current = requestId;
    setLoading(true);
    const { data, error } = await supabase.rpc('get_diamond_pool_preview', {
      p_filter: cleanFilterForServer(filter, distinct) as never,
      p_markup_natural: markupNatural,
      p_markup_lab: markupLab,
      p_page_size: PAGE_SIZE,
      p_offset: page * PAGE_SIZE,
    });
    if (requestId !== previewRequestId.current) return;
    if (error) {
      console.error('[DiamondCatalogLive] preview error', error);
      toast.error('Failed to load diamonds');
      setRows([]);
      setTotalCount(0);
    } else {
      const list = (data ?? []) as PreviewRow[];
      setRows(list);
      setTotalCount(Number(list[0]?.total_count ?? 0));
    }
    setLoading(false);
  }, [filter, distinct, markupNatural, markupLab, page]);

  // GBP / CAD cards: the stored per-diamond price of the published FX version
  // (the number Ring OS uses), not a re-conversion of the USD card price.
  const [fxCardPrices, setFxCardPrices] = useState<Record<string, number> | null>(null);
  useEffect(() => {
    if (!showConverted || rows.length === 0) { setFxCardPrices(null); return; }
    let cancelled = false;
    setFxCardPrices(null);
    (async () => {
      const { data, error } = await (supabase as any).rpc('get_diamond_fx_prices_for_pool_ids', {
        p_pool_ids: rows.map((r) => r.id),
        p_currency: currency,
      });
      if (cancelled) return;
      if (error) {
        console.error('[DiamondCatalogLive] fx prices error', error);
        setFxCardPrices({});
        return;
      }
      const map: Record<string, number> = {};
      for (const r of (data ?? []) as { pool_id: string; price: number }[]) map[r.pool_id] = Number(r.price);
      setFxCardPrices(map);
    })();
    return () => { cancelled = true; };
  }, [rows, showConverted, currency]);

  // Same formula as get_diamond_presets_filtered: stored price, then the markup, 2 dp.
  const cardPrice = (row: PreviewRow): { price: number; currency: string } | null => {
    if (!showConverted) return { price: Number(row.base_price), currency };
    if (!fxCardPrices) return null;
    const stored = fxCardPrices[row.id];
    if (stored === undefined) return { price: Number(row.base_price), currency: 'USD' };
    const markup = row.stone_type === 'lab' ? markupLab : markupNatural;
    return { price: Math.round(stored * (1 + (Number(markup) || 0) / 100) * 100) / 100, currency };
  };
  const missingFxCount = showConverted && fxCardPrices
    ? rows.filter((r) => fxCardPrices[r.id] === undefined).length
    : 0;

  useEffect(() => { fetchPreview(); }, [fetchPreview]);

  // Reset to first page on any filter/markup change
  useEffect(() => { setPage(0); }, [filter, markupNatural, markupLab]);

  // Per-shape availability under the current (non-shape) filters
  useEffect(() => {
    if (distinct.shapes.length === 0) return;
    const requestId = shapeCountsRequestId.current + 1;
    shapeCountsRequestId.current = requestId;
    const timer = setTimeout(async () => {
      const { data, error } = await (supabase.rpc as any)('get_diamond_pool_shape_counts', {
        p_filter: cleanFilterForServer(filter, distinct),
      });
      if (requestId !== shapeCountsRequestId.current) return;
      if (error) {
        console.error('[DiamondCatalogLive] shape counts error', error);
        return;
      }
      const raw = (data ?? {}) as Record<string, number>;
      const normalized: Record<string, number> = {};
      Object.entries(raw).forEach(([k, v]) => { normalized[k.toLowerCase()] = Number(v) || 0; });
      setShapeCounts(normalized);
    }, 400);
    return () => clearTimeout(timer);
  }, [filter, distinct]);

  // Dynamic price bounds: re-fetch whenever a non-price filter changes
  useEffect(() => {
    const poolEmpty = distinct.shapes.length === 0 && distinct.colors.length === 0 && distinct.labs.length === 0;
    if (poolEmpty) return;

    // Serialize only non-price fields to detect relevant changes
    const key = JSON.stringify([
      filter.stoneTypes, filter.shapes, filter.caratMin, filter.caratMax, filter.caratRanges,
      filter.colors, filter.clarities, filter.cuts, filter.polish, filter.symmetry,
      filter.fluorescence, filter.labs, filter.canadianOnly, filter.lengthMin, filter.lengthMax,
    ]);
    if (key === lastNonPriceKeyRef.current) return;
    lastNonPriceKeyRef.current = key;

    let cancelled = false;
    (async () => {
      const { data } = await supabase.rpc('get_diamond_pool_price_range_for_filter', {
        p_filter: cleanFilterForServer(
          { ...filter, priceMinNatural: 0, priceMaxNatural: 0, priceMinLab: 0, priceMaxLab: 0 },
          distinct
        ) as never,
      });
      if (cancelled || !data) return;
      const pr = data as { minNatural: number; maxNatural: number; minLab: number; maxLab: number };
      setPriceBounds({
        minNatural: Number(pr.minNatural) || 0,
        maxNatural: Number(pr.maxNatural) || 0,
        minLab: Number(pr.minLab) || 0,
        maxLab: Number(pr.maxLab) || 0,
      });
      // After initial load, reset price selection whenever filters change
      if (priceBoundsInitRef.current) {
        setFilter(prev => ({ ...prev, priceMinNatural: 0, priceMaxNatural: 0, priceMinLab: 0, priceMaxLab: 0 }));
      }
      priceBoundsInitRef.current = true;
    })();
    return () => { cancelled = true; };
  }, [filter, distinct]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleConfirm = async () => {
    setSaving(true);
    const payload = {
      client_id: clientId,
      filter: cleanFilterForServer(filter, distinct) as never,
      markup_natural: markupNatural,
      markup_lab: markupLab,
      is_confirmed: true,
      confirmed_at: new Date().toISOString(),
    };
    const { error } = await supabase
      .from('client_diamond_catalog_filter')
      .upsert(payload, { onConflict: 'client_id' });
    if (error) {
      setSaving(false);
      console.error('[DiamondCatalogLive] confirm error', error);
      toast.error('Failed to save catalog');
      return;
    }
    setIsConfirmed(true);
    setConfirmedAt(payload.confirmed_at);
    // Rebuild this client's "what is in stock" cache now. This is the only
    // moment it is recomputed for a catalogue change (no polling cron any more;
    // the diamond scoring job refreshes every confirmed client after a pool upload).
    const { error: availError } = await (supabase.rpc as unknown as (
      fn: string,
      args: Record<string, unknown>,
    ) => PromiseLike<{ error: { message: string } | null }>)('refresh_client_diamond_availability', { p_client_id: clientId });
    setSaving(false);
    if (availError) {
      console.warn('[DiamondCatalogLive] availability refresh failed; the next scoring run will rebuild it', availError);
      toast.success('Catalog confirmed — your widget is now live with these diamonds');
      toast.info('Widget availability will finish updating in the background.');
      return;
    }
    toast.success('Catalog confirmed — your widget is now live with these diamonds');
  };

  const emptySelectedShapes = useMemo(
    () => filter.shapes.filter((id) => shapeCounts[id] === 0),
    [filter.shapes, shapeCounts],
  );

  const handleResetFilters = () => {
    setFilter({ ...createDefaultFilter(distinct), priceMinNatural: 0, priceMaxNatural: 0, priceMinLab: 0, priceMaxLab: 0 });
    setMarkupNatural(0);
    setMarkupLab(0);
  };

  const filterSummary = useMemo(() => {
    const parts: string[] = [];
    if (filter.stoneTypes.length) parts.push(`${filter.stoneTypes.length} type(s)`);
    if (filter.shapes.length) parts.push(`${filter.shapes.length} shape(s)`);
    if (filter.colors.length) parts.push(`${filter.colors.length} color(s)`);
    if (filter.clarities.length) parts.push(`${filter.clarities.length} clarity`);
    if (filter.cuts.length) parts.push(`${filter.cuts.length} cut`);
    if (filter.caratRanges && filter.caratRanges.length) parts.push(`${filter.caratRanges.length} carat range(s)`);
    else if (filter.caratMin || filter.caratMax) parts.push(`carat ${filter.caratMin || '0'}–${filter.caratMax || '∞'}`);
    return parts.length ? parts.join(' · ') : 'No filters · all pool diamonds';
  }, [filter]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[400px_1fr] gap-4">
      {/* ===== Sidebar ===== */}
      <aside className="space-y-4 border border-border rounded-2xl p-3 bg-card h-fit lg:sticky lg:top-4">
        {ringCurrency && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold tracking-wide">
                Currency: {RING_OS_CURRENCY_META[ringCurrency].symbol} {ringCurrency}
              </h3>
              {onChangeCurrency && (
                <Button variant="outline" size="sm" onClick={onChangeCurrency} className="h-7 px-2 text-xs">
                  Change
                </Button>
              )}
            </div>
            <p className="text-[10px] leading-snug text-muted-foreground">
              {ringCurrency !== 'USD' && !showConverted
                ? `No ${ringCurrency} diamond prices are published yet: Ring OS shows no diamonds in ${ringCurrency} until the JewlX admin applies exchange rates. Prices below are USD.`
                : 'Set once for Ring OS: your ring steps and these diamonds use the same currency.'}
            </p>
          </div>
        )}

        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold tracking-wide">Filters</h3>
          <Button variant="ghost" size="sm" onClick={handleResetFilters} className="h-7 px-2 text-xs">
            <RotateCcw className="w-3 h-3 mr-1" /> Reset
          </Button>
        </div>

        <Accordion type="multiple" defaultValue={['stoneType', 'shapes', 'carat']} className="space-y-1">
          <FilterGroup id="stoneType" label="Stone Type">
            <SelectClearBar
              allValues={['natural', 'lab']}
              current={filter.stoneTypes}
              onChange={(next) => setFilter({ ...filter, stoneTypes: next })}
            />
            <div className="grid grid-cols-2 gap-2">
              {[
                { id: 'natural', label: 'Natural', Icon: Gem },
                { id: 'lab', label: 'Lab-Grown', Icon: Sparkles },
              ].map(({ id, label, Icon }) => {
                const selected = filter.stoneTypes.includes(id);
                return (
                  <OptionTile
                    key={id}
                    selected={selected}
                    onClick={() => setFilter({ ...filter, stoneTypes: toggleInArray(filter.stoneTypes, id) })}
                  >
                    <Icon className="w-5 h-5 mb-1.5 opacity-80" />
                    <span className="text-[11px] font-medium">{label}</span>
                  </OptionTile>
                );
              })}
            </div>
          </FilterGroup>

          <FilterGroup id="shapes" label={`Shapes${distinct.shapes.length ? ` (${distinct.shapes.length})` : ''}`}>
            {distinct.shapes.length >= 2 && (
              <SelectClearBar
                allValues={distinct.shapes.map((s) => s.toLowerCase().split(' ')[0])}
                current={filter.shapes}
                onChange={(next) => setFilter({ ...filter, shapes: next })}
              />
            )}
            <div className="grid grid-cols-3 gap-2">
              {distinct.shapes.map((s) => {
                const id = s.toLowerCase().split(' ')[0];
                const selected = filter.shapes.includes(id);
                const count = shapeCounts[id];
                const isEmpty = count === 0;
                return (
                  <OptionTile
                    key={s}
                    selected={selected}
                    onClick={() => setFilter({ ...filter, shapes: toggleInArray(filter.shapes, id) })}
                    className="aspect-square"
                  >
                    <ShapeIcon shapeId={id} size="sm" />
                    <span className="text-[10px] font-medium mt-1 capitalize truncate w-full text-center">
                      {shapeNameLookup?.[id] ?? s}
                    </span>
                    {count !== undefined && (
                      <span className={`text-[9px] tabular-nums ${isEmpty ? 'text-destructive' : 'text-muted-foreground'}`}>
                        {count.toLocaleString()}
                      </span>
                    )}
                  </OptionTile>
                );
              })}
            </div>
            {emptySelectedShapes.length > 0 && (
              <p className="mt-2 text-[11px] leading-snug text-destructive">
                Your quality filters (cut, colour, clarity, carat, price) leave 0 diamonds for:{' '}
                <span className="capitalize font-medium">{emptySelectedShapes.join(', ')}</span>. These shapes will not
                appear in your widget until you widen those filters.
              </p>
            )}
          </FilterGroup>


          <FilterGroup id="carat" label={`Carat Range${filter.caratRanges.length ? ` (${filter.caratRanges.length})` : ''}`}>
            <SelectClearBar
              allValues={CARAT_RANGE_OPTIONS.map((r) => String(r.value))}
              current={filter.caratRanges.map((v) => String(v))}
              onChange={(next) =>
                setFilter({
                  ...filter,
                  caratRanges: next.map(Number).filter((v) => Number.isFinite(v)).sort((a, b) => a - b),
                  caratMin: '',
                  caratMax: '',
                })
              }
            />
            <div className="grid grid-cols-2 gap-2">
              {CARAT_RANGE_OPTIONS.map((r) => {
                const selected = filter.caratRanges.includes(r.value);
                return (
                  <OptionTile
                    key={r.value}
                    selected={selected}
                    onClick={() => {
                      const exists = filter.caratRanges.includes(r.value);
                      const next = exists
                        ? filter.caratRanges.filter((v) => v !== r.value)
                        : [...filter.caratRanges, r.value].sort((a, b) => a - b);
                      setFilter({ ...filter, caratRanges: next, caratMin: '', caratMax: '' });
                    }}
                    compact
                  >
                    <span className="text-[11px] font-semibold tabular-nums">{r.label}</span>
                  </OptionTile>
                );
              })}
            </div>
          </FilterGroup>

          <FilterGroup id="colors" label={`Color${distinct.colors.length ? ` (${distinct.colors.length})` : ''}`}>
            {distinct.colors.length >= 2 && (
              <SelectClearBar
                allValues={distinct.colors}
                current={filter.colors}
                onChange={(next) => setFilter({ ...filter, colors: next })}
              />
            )}
            <div className="grid grid-cols-4 gap-1.5">
              {distinct.colors.map((c) => (
                <ChipButton
                  key={c}
                  selected={filter.colors.includes(c)}
                  onClick={() => setFilter({ ...filter, colors: toggleInArray(filter.colors, c) })}
                >{c}</ChipButton>
              ))}
            </div>
          </FilterGroup>

          <FilterGroup id="clarities" label={`Clarity${distinct.clarities.length ? ` (${distinct.clarities.length})` : ''}`}>
            {distinct.clarities.length >= 2 && (
              <SelectClearBar
                allValues={distinct.clarities}
                current={filter.clarities}
                onChange={(next) => setFilter({ ...filter, clarities: next })}
              />
            )}
            <div className="grid grid-cols-4 gap-1.5">
              {distinct.clarities.map((c) => (
                <ChipButton
                  key={c}
                  selected={filter.clarities.includes(c)}
                  onClick={() => setFilter({ ...filter, clarities: toggleInArray(filter.clarities, c) })}
                >{c}</ChipButton>
              ))}
            </div>
          </FilterGroup>

          <FilterGroup id="cuts" label={`Cut${distinct.cuts.length ? ` (${distinct.cuts.length})` : ''}`}>
            {distinct.cuts.length >= 2 && (
              <SelectClearBar
                allValues={distinct.cuts}
                current={filter.cuts}
                onChange={(next) => setFilter({ ...filter, cuts: next })}
              />
            )}
            <div className="grid grid-cols-2 gap-1.5">
              {distinct.cuts.map((c) => (
                <ChipButton
                  key={c}
                  selected={filter.cuts.includes(c)}
                  onClick={() => setFilter({ ...filter, cuts: toggleInArray(filter.cuts, c) })}
                >{c}</ChipButton>
              ))}
            </div>
          </FilterGroup>

          <FilterGroup id="polish" label={`Polish${distinct.polish.length ? ` (${distinct.polish.length})` : ''}`}>
            {distinct.polish.length >= 2 && (
              <SelectClearBar
                allValues={distinct.polish}
                current={filter.polish}
                onChange={(next) => setFilter({ ...filter, polish: next })}
              />
            )}
            <div className="grid grid-cols-2 gap-1.5">
              {distinct.polish.map((c) => (
                <ChipButton
                  key={c}
                  selected={filter.polish.includes(c)}
                  onClick={() => setFilter({ ...filter, polish: toggleInArray(filter.polish, c) })}
                >{c}</ChipButton>
              ))}
            </div>
          </FilterGroup>

          <FilterGroup id="symmetry" label={`Symmetry${distinct.symmetry.length ? ` (${distinct.symmetry.length})` : ''}`}>
            {distinct.symmetry.length >= 2 && (
              <SelectClearBar
                allValues={distinct.symmetry}
                current={filter.symmetry}
                onChange={(next) => setFilter({ ...filter, symmetry: next })}
              />
            )}
            <div className="grid grid-cols-2 gap-1.5">
              {distinct.symmetry.map((c) => (
                <ChipButton
                  key={c}
                  selected={filter.symmetry.includes(c)}
                  onClick={() => setFilter({ ...filter, symmetry: toggleInArray(filter.symmetry, c) })}
                >{c}</ChipButton>
              ))}
            </div>
          </FilterGroup>

          <FilterGroup id="fluorescence" label={`Fluorescence${distinct.fluorescence.length ? ` (${distinct.fluorescence.length})` : ''}`}>
            {distinct.fluorescence.length >= 2 && (
              <SelectClearBar
                allValues={distinct.fluorescence}
                current={filter.fluorescence}
                onChange={(next) => setFilter({ ...filter, fluorescence: next })}
              />
            )}
            <div className="grid grid-cols-2 gap-1.5">
              {distinct.fluorescence.map((c) => (
                <ChipButton
                  key={c}
                  selected={filter.fluorescence.includes(c)}
                  onClick={() => setFilter({ ...filter, fluorescence: toggleInArray(filter.fluorescence, c) })}
                >{c}</ChipButton>
              ))}
            </div>
          </FilterGroup>

          <FilterGroup id="labs" label={`Lab / Certification${distinct.labs.length ? ` (${distinct.labs.length})` : ''}`}>
            {distinct.labs.length >= 2 && (
              <SelectClearBar
                allValues={distinct.labs}
                current={filter.labs}
                onChange={(next) => setFilter({ ...filter, labs: next })}
              />
            )}
            <div className="grid grid-cols-3 gap-1.5">
              {distinct.labs.map((c) => (
                <ChipButton
                  key={c}
                  selected={filter.labs.includes(c)}
                  onClick={() => setFilter({ ...filter, labs: toggleInArray(filter.labs, c) })}
                >{c}</ChipButton>
              ))}
            </div>
          </FilterGroup>

          <FilterGroup id="measurements" label="Measurements (length mm)">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Min</Label>
                <Input
                  type="number" step="0.1" min="0"
                  value={filter.lengthMin}
                  onChange={(e) => setFilter({ ...filter, lengthMin: e.target.value })}
                  className="h-8"
                />
              </div>
              <div>
                <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Max</Label>
                <Input
                  type="number" step="0.1" min="0"
                  value={filter.lengthMax}
                  onChange={(e) => setFilter({ ...filter, lengthMax: e.target.value })}
                  className="h-8"
                />
              </div>
            </div>
          </FilterGroup>

          {(priceBounds.maxNatural > 0 || priceBounds.maxLab > 0) && (
            <p className="px-1 pb-2 text-[10px] leading-snug text-muted-foreground">
              {showConverted
                ? `Diamond sheet prices are USD; shown here in ${currency} at the published rate (preview).`
                : 'Diamond prices come from the shared inventory sheet and are listed in USD.'}
            </p>
          )}

          {priceBounds.maxNatural > 0 && (
             <FilterGroup id="priceNatural" label={`Natural Diamond Price (${currencySymbol})`}>
              <p className="text-[11px] text-muted-foreground text-center tabular-nums mb-3">
                {formatCurrency(toDisplay(filter.priceMinNatural || priceBounds.minNatural), currency)}
                {' – '}
                {formatCurrency(toDisplay(filter.priceMaxNatural || priceBounds.maxNatural), currency)}
              </p>
              <Slider
                min={priceBounds.minNatural}
                max={priceBounds.maxNatural}
                step={Math.max(1, Math.round((priceBounds.maxNatural - priceBounds.minNatural) / 500) * 10)}
                value={[
                  filter.priceMinNatural || priceBounds.minNatural,
                  filter.priceMaxNatural || priceBounds.maxNatural,
                ]}
                onValueChange={([lo, hi]) => {
                  setFilter({
                    ...filter,
                    priceMinNatural: lo === priceBounds.minNatural ? 0 : lo,
                    priceMaxNatural: hi === priceBounds.maxNatural ? 0 : hi,
                  });
                }}
                className="mt-1"
              />
              <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
                <span>{formatCurrency(toDisplay(priceBounds.minNatural), currency)}</span>
                <span>{formatCurrency(toDisplay(priceBounds.maxNatural), currency)}</span>
              </div>
            </FilterGroup>
          )}

          {priceBounds.maxLab > 0 && (
             <FilterGroup id="priceLab" label={`Lab Diamond Price (${currencySymbol})`}>
              <p className="text-[11px] text-muted-foreground text-center tabular-nums mb-3">
                {formatCurrency(toDisplay(filter.priceMinLab || priceBounds.minLab), currency)}
                {' – '}
                {formatCurrency(toDisplay(filter.priceMaxLab || priceBounds.maxLab), currency)}
              </p>
              <Slider
                min={priceBounds.minLab}
                max={priceBounds.maxLab}
                step={Math.max(1, Math.round((priceBounds.maxLab - priceBounds.minLab) / 500) * 10)}
                value={[
                  filter.priceMinLab || priceBounds.minLab,
                  filter.priceMaxLab || priceBounds.maxLab,
                ]}
                onValueChange={([lo, hi]) => {
                  setFilter({
                    ...filter,
                    priceMinLab: lo === priceBounds.minLab ? 0 : lo,
                    priceMaxLab: hi === priceBounds.maxLab ? 0 : hi,
                  });
                }}
                className="mt-1"
              />
              <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
                <span>{formatCurrency(toDisplay(priceBounds.minLab), currency)}</span>
                <span>{formatCurrency(toDisplay(priceBounds.maxLab), currency)}</span>
              </div>
            </FilterGroup>
          )}
        </Accordion>

        {/* Price Sort Order */}
        <div className="space-y-2 border-t border-border pt-4">
          <h4 className="text-sm font-semibold">Price Order</h4>
          <div className="grid grid-cols-2 gap-2">
            {(['high_to_low', 'low_to_high'] as const).map((dir) => (
              <ChipButton
                key={dir}
                selected={filter.priceSort === dir}
                onClick={() => setFilter({ ...filter, priceSort: dir })}
              >
                {dir === 'high_to_low' ? 'High → Low' : 'Low → High'}
              </ChipButton>
            ))}
          </div>
        </div>

        {/* Markup */}
        <div className="space-y-3 border-t border-border pt-4">
          <h4 className="text-sm font-semibold">Markup (%)</h4>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Natural</Label>
              <Input
                type="number" step="0.5" min="0" max="500"
                value={markupNatural}
                onChange={(e) => setMarkupNatural(Number(e.target.value) || 0)}
                className="h-8"
              />
            </div>
            <div>
              <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Lab-Grown</Label>
              <Input
                type="number" step="0.5" min="0" max="500"
                value={markupLab}
                onChange={(e) => setMarkupLab(Number(e.target.value) || 0)}
                className="h-8"
              />
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Displayed price = pool base price × (1 + markup ÷ 100). Set to 0 to show base.
          </p>
        </div>

        {/* Display Limit (per stone type) */}
        <div className="space-y-2 border-t border-border pt-4">
          <h4 className="text-sm font-semibold">Display Limit (per stone type)</h4>
          <div className="grid grid-cols-4 gap-2">
            {LIMIT_PER_TYPE_OPTIONS.map((opt) => (
              <ChipButton
                key={opt.value}
                selected={(filter.limitPerType || 0) === opt.value}
                onClick={() => setFilter({ ...filter, limitPerType: opt.value })}
              >
                {opt.label}
              </ChipButton>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground">
            Caps how many Natural and Lab diamonds appear on the Ring OS widget (top-N by your Price Order). "All" removes the cap.
          </p>
        </div>




        <Button
          onClick={handleConfirm}
          disabled={saving || totalCount === 0}
          className="w-full"
        >
          {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Check className="w-4 h-4 mr-2" />}
          {isConfirmed ? 'Update Confirmed Catalog' : 'Confirm Catalog'}
        </Button>
        {isConfirmed && confirmedAt && (
          <p className="text-[11px] text-muted-foreground text-center">
            Last confirmed {new Date(confirmedAt).toLocaleString()}
          </p>
        )}
      </aside>

      {/* ===== Main grid ===== */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-lg sm:text-xl font-semibold">Available Diamonds</h2>
            <p className="text-xs text-muted-foreground">{filterSummary}</p>
          </div>
          <Badge variant="secondary" className="text-xs">
            {totalCount.toLocaleString()} matching
          </Badge>
        </div>

        {missingFxCount > 0 && (
          <p className="text-xs text-amber-600 dark:text-amber-400">
            {missingFxCount} diamond(s) on this page have no published {currency} price yet (shown in USD). Ring OS hides
            them until the JewlX admin applies exchange rates again.
          </p>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
          {loading || (showConverted && rows.length > 0 && !fxCardPrices)
            ? Array.from({ length: PAGE_SIZE }).map((_, i) => <Skeleton key={i} className="aspect-square rounded-xl" />)
            : rows.map((row) => {
                const shown = cardPrice(row);
                return (
                <DiamondProductCard
                  key={row.id}
                  shapeId={row.shape_id}
                  shapeName={shapeNameLookup?.[row.shape_id] ?? row.shape_id}
                  carat={Number(row.carat_value)}
                  color={row.color}
                  clarity={row.clarity}
                  price={shown?.price ?? 0}
                  stoneType={(row.stone_type as 'natural' | 'lab') || 'natural'}
                  currency={shown?.currency ?? currency}
                />
                );
              })}
        </div>

        {!loading && rows.length === 0 && (
          <div className="text-center py-8">
            <p className="text-muted-foreground">
              No diamonds match your filters. Loosen filters or wait for the next inventory upload.
            </p>
          </div>
        )}

        <DiamondPagination
          currentPage={page}
          totalCount={totalCount}
          pageSize={PAGE_SIZE}
          loading={loading}
          onPageChange={setPage}
        />
      </section>
    </div>
  );
}

// ---------- helpers ----------

function FilterGroup({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <AccordionItem value={id} className="border-b border-border/40">
      <AccordionTrigger className="text-xs font-medium py-2 hover:no-underline">{label}</AccordionTrigger>
      <AccordionContent className="pb-2 space-y-1.5">{children}</AccordionContent>
    </AccordionItem>
  );
}

function CheckboxRow({ checked, onChange, label }: { checked: boolean; onChange: () => void; label: string }) {
  return (
    <label className="flex items-center gap-2 text-xs cursor-pointer py-1 hover:text-foreground">
      <Checkbox checked={checked} onCheckedChange={onChange} className="h-3.5 w-3.5" />
      <span>{label}</span>
    </label>
  );
}

function OptionTile({
  selected,
  onClick,
  children,
  className,
  compact,
  disabled,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
  compact?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'relative flex flex-col items-center justify-center rounded-xl border transition-all',
        'disabled:cursor-not-allowed disabled:opacity-40',
        'bg-background hover:bg-accent/30',
        compact ? 'px-2 py-2' : 'px-2 py-3',
        selected
          ? 'border-primary bg-primary/5 ring-1 ring-primary/30 text-foreground'
          : 'border-border text-muted-foreground hover:text-foreground',
        className,
      )}
    >
      {selected && (
        <span className="absolute top-1 right-1 w-3.5 h-3.5 rounded-full bg-primary flex items-center justify-center">
          <Check className="w-2.5 h-2.5 text-primary-foreground" strokeWidth={3} />
        </span>
      )}
      {children}
    </button>
  );
}

function ChipButton({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'min-h-8 px-2 py-1 rounded-md text-[11px] font-semibold tabular-nums tracking-tight leading-tight transition-all border flex items-center justify-center text-center break-words hyphens-auto',
        selected
          ? 'bg-primary text-primary-foreground border-primary shadow-sm'
          : 'bg-background border-border text-muted-foreground hover:text-foreground hover:border-primary/40',
      )}
    >
      {children}
    </button>
  );
}

function SelectClearBar({
  allValues,
  current,
  onChange,
}: {
  allValues: string[];
  current: string[];
  onChange: (next: string[]) => void;
}) {
  const allSelected = allValues.length > 0 && allValues.every((v) => current.includes(v));
  const noneSelected = current.length === 0;
  return (
    <div className="flex items-center gap-1 mb-1.5">
      <Button
        type="button" variant="ghost" size="sm"
        className="h-6 px-2 text-[10px] uppercase tracking-wide"
        disabled={allSelected}
        onClick={() => onChange(allValues)}
      >Select all</Button>
      <span className="text-muted-foreground text-[10px]">·</span>
      <Button
        type="button" variant="ghost" size="sm"
        className="h-6 px-2 text-[10px] uppercase tracking-wide"
        disabled={noneSelected}
        onClick={() => onChange([])}
      >Clear all</Button>
    </div>
  );
}
