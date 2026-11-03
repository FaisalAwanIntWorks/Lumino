import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Check, Gem, Loader2, RotateCcw, Sparkles } from 'lucide-react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { ShapeIcon } from '@/components/common/ShapeIcon';
import { supabase } from '@/integrations/supabase/client';
import { useDiamondPoolOptions } from '@/hooks/useDiamondPoolOptions';
import type { DiamondPoolDistinctValues } from '@/lib/diamond-pool-normalize';
import { formatCurrency, getCurrencySymbol } from '@/lib/pricing-utils';
import { cn } from '@/lib/utils';
import {
  DIAMOND_CLARITY_ORDER,
  DIAMOND_COLOR_ORDER,
  QUOTE_DIAMOND_LIMIT_MAX,
  QUOTE_DIAMOND_LIMIT_MIN,
  QUOTE_DIAMOND_PICKER_DEFAULTS,
  resolveQuoteDiamondPickerConfig,
  sortByGradeOrder,
  type QuoteDiamondCatalogFilter,
  type QuoteDiamondPickerConfig,
} from '@/lib/quote-estimator-diamonds';

/**
 * Quote Estimator "Diamond Configuration" tab (allowlisted accounts). Offers
 * the same choices as the Ring OS Diamond Catalog screen, but saves into the
 * Quote Estimator's own settings (`form_content.diamondPicker`, per version)
 * with "Save Configuration". The Ring OS catalogue is never read or written.
 */

interface Props {
  clientId: string | null;
  value: QuoteDiamondPickerConfig | undefined;
  onChange: (next: QuoteDiamondPickerConfig) => void;
  currency?: string;
}

/** Full-selection form of the filter used while editing (empty list = nothing chosen). */
interface EditFilter {
  stoneTypes: string[];
  shapes: string[];
  colors: string[];
  clarities: string[];
  cuts: string[];
  polish: string[];
  symmetry: string[];
  fluorescence: string[];
  labs: string[];
  caratMin: string;
  caratMax: string;
  caratRanges: number[];
  lengthMin: string;
  lengthMax: string;
  canadianOnly: boolean;
  priceMinNatural: number;
  priceMaxNatural: number;
  priceMinLab: number;
  priceMaxLab: number;
  priceSort: 'high_to_low' | 'low_to_high';
}
type ListKey = 'stoneTypes' | 'shapes' | 'colors' | 'clarities' | 'cuts' | 'polish' | 'symmetry' | 'fluorescence' | 'labs';
const LIST_KEYS: ListKey[] = ['stoneTypes', 'shapes', 'colors', 'clarities', 'cuts', 'polish', 'symmetry', 'fluorescence', 'labs'];

const CARAT_RANGE_OPTIONS: ReadonlyArray<{ value: number; label: string }> = [
  0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6, 6.5, 7, 7.5, 8,
].map(v => ({ value: v, label: `${v.toFixed(2)} - ${(v + 0.49).toFixed(2)} ct` }));

// Colours hidden from the customer-facing filter UI (same list as the Ring OS catalogue screen).
const EXCLUDED_COLORS = new Set(['K FAINT', 'K FAINT BROWN', 'K FAINT PINKISH BROWN', 'L FAINT BROWN', 'M FAINT BROWN']);
const unique = (values: string[]) => Array.from(new Set(values.filter(Boolean)));
const shapeIds = (d: DiamondPoolDistinctValues) => unique(d.shapes.map(s => s.toLowerCase().split(' ')[0]));

const allValues = (d: DiamondPoolDistinctValues): Record<ListKey, string[]> => ({
  stoneTypes: ['natural', 'lab'],
  shapes: shapeIds(d),
  colors: sortByGradeOrder(unique(d.colors).filter(v => !EXCLUDED_COLORS.has(v.trim().toUpperCase())), DIAMOND_COLOR_ORDER),
  clarities: sortByGradeOrder(unique(d.clarities), DIAMOND_CLARITY_ORDER),
  cuts: unique(d.cuts),
  polish: unique(d.polish),
  symmetry: unique(d.symmetry),
  fluorescence: unique(d.fluorescence),
  labs: unique(d.labs),
});

/** Saved restrictions -> editing form (missing list = every value in stock). */
function hydrate(saved: QuoteDiamondCatalogFilter, d: DiamondPoolDistinctValues): EditFilter {
  const all = allValues(d);
  const list = (k: ListKey) => (Array.isArray(saved[k]) && saved[k]!.length ? unique(saved[k]!) : all[k]);
  return {
    stoneTypes: list('stoneTypes'),
    shapes: list('shapes'),
    colors: list('colors'),
    clarities: list('clarities'),
    cuts: list('cuts'),
    polish: list('polish'),
    symmetry: list('symmetry'),
    fluorescence: list('fluorescence'),
    labs: list('labs'),
    caratMin: saved.caratMin ? String(saved.caratMin) : '',
    caratMax: saved.caratMax ? String(saved.caratMax) : '',
    caratRanges: Array.isArray(saved.caratRanges) ? unique(saved.caratRanges.map(String)).map(Number).filter(Number.isFinite).sort((a, b) => a - b) : [],
    lengthMin: saved.lengthMin ? String(saved.lengthMin) : '',
    lengthMax: saved.lengthMax ? String(saved.lengthMax) : '',
    canadianOnly: saved.canadianOnly === true,
    priceMinNatural: typeof saved.priceMinNatural === 'number' ? saved.priceMinNatural : 0,
    priceMaxNatural: typeof saved.priceMaxNatural === 'number' ? saved.priceMaxNatural : 0,
    priceMinLab: typeof saved.priceMinLab === 'number' ? saved.priceMinLab : 0,
    priceMaxLab: typeof saved.priceMaxLab === 'number' ? saved.priceMaxLab : 0,
    priceSort: saved.priceSort === 'high_to_low' ? 'high_to_low' : 'low_to_high',
  };
}

/** Editing form -> stored restrictions (only what narrows the pool). */
function clean(f: EditFilter, d: DiamondPoolDistinctValues): QuoteDiamondCatalogFilter {
  const all = allValues(d);
  const out: QuoteDiamondCatalogFilter = {};
  for (const k of LIST_KEYS) {
    const selected = unique(f[k]);
    const available = all[k];
    const same = selected.length === available.length && available.every(v => selected.includes(v));
    if (available.length === 0 || selected.length === 0 || same) continue;
    out[k] = selected;
  }
  if (f.caratMin) out.caratMin = f.caratMin;
  if (f.caratMax) out.caratMax = f.caratMax;
  if (f.caratRanges.length) out.caratRanges = f.caratRanges;
  if (f.lengthMin) out.lengthMin = f.lengthMin;
  if (f.lengthMax) out.lengthMax = f.lengthMax;
  if (f.canadianOnly) out.canadianOnly = true;
  if (f.priceMinNatural > 0) out.priceMinNatural = f.priceMinNatural;
  if (f.priceMaxNatural > 0) out.priceMaxNatural = f.priceMaxNatural;
  if (f.priceMinLab > 0) out.priceMinLab = f.priceMinLab;
  if (f.priceMaxLab > 0) out.priceMaxLab = f.priceMaxLab;
  if (f.priceSort === 'high_to_low') out.priceSort = 'high_to_low';
  return out;
}

const toggle = (arr: string[], v: string) => (arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v]);
const stableJson = (v: unknown) => JSON.stringify(v ?? {});

interface PreviewRow { id: string; stone_type: string; shape_id: string; carat_value: number; color: string; clarity: string; base_price: number; total_count: number }

function Group({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <AccordionItem value={id} className="border-b border-border/40">
      <AccordionTrigger className="text-sm font-medium py-2.5 hover:no-underline">{label}</AccordionTrigger>
      <AccordionContent className="pb-3 space-y-2">{children}</AccordionContent>
    </AccordionItem>
  );
}

function Chip({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'min-h-8 px-2 py-1 rounded-md text-[11px] font-semibold tabular-nums tracking-tight leading-tight transition-all border flex items-center justify-center text-center',
        selected ? 'bg-primary text-primary-foreground border-primary shadow-sm' : 'bg-background border-border text-muted-foreground hover:text-foreground hover:border-primary/40',
      )}
    >
      {children}
    </button>
  );
}

function SelectClear({ values, current, onChange }: { values: string[]; current: string[]; onChange: (next: string[]) => void }) {
  const allOn = values.length > 0 && values.every(v => current.includes(v));
  return (
    <div className="flex items-center gap-1 mb-1">
      <Button type="button" variant="ghost" size="sm" className="h-6 px-2 text-[10px] uppercase tracking-wide" disabled={allOn} onClick={() => onChange(values)}>Select all</Button>
      <span className="text-muted-foreground text-[10px]">·</span>
      <Button type="button" variant="ghost" size="sm" className="h-6 px-2 text-[10px] uppercase tracking-wide" disabled={current.length === 0} onClick={() => onChange([])}>Clear all</Button>
    </div>
  );
}

function ChipGroup({ k, label, cols = 'grid-cols-5', filter, all, update }: { k: ListKey; label: string; cols?: string; filter: EditFilter; all: Record<ListKey, string[]>; update: (next: EditFilter) => void }) {
  const values = all[k];
  return (
    <Group id={k} label={`${label}${values.length ? ` (${filter[k].length}/${values.length})` : ''}`}>
      {values.length === 0 ? <p className="text-xs text-muted-foreground">No values in the pool yet.</p> : (
        <>
          <SelectClear values={values} current={filter[k]} onChange={next => update({ ...filter, [k]: next })} />
          <div className={cn('grid gap-1.5', cols)}>
            {values.map(v => <Chip key={v} selected={filter[k].includes(v)} onClick={() => update({ ...filter, [k]: toggle(filter[k], v) })}>{v}</Chip>)}
          </div>
        </>
      )}
    </Group>
  );
}

function PriceGroup({ id, label, min, max, lo, hi, currency, onChangeRange }: { id: string; label: string; min: number; max: number; lo: number; hi: number; currency: string; onChangeRange: (lo: number, hi: number) => void }) {
  return (
    <Group id={id} label={label}>
      <p className="text-[11px] text-muted-foreground text-center tabular-nums mb-2">
        {formatCurrency(lo || min, currency)} – {formatCurrency(hi || max, currency)}
      </p>
      <Slider
        min={min}
        max={max}
        step={Math.max(1, Math.round((max - min) / 500) * 10)}
        value={[lo || min, hi || max]}
        onValueChange={([a, b]) => onChangeRange(a === min ? 0 : a, b === max ? 0 : b)}
      />
      <div className="flex justify-between text-[10px] text-muted-foreground mt-1"><span>{formatCurrency(min, currency)}</span><span>{formatCurrency(max, currency)}</span></div>
    </Group>
  );
}

export function QuoteDiamondConfigurationTab({ clientId, value, onChange, currency = 'USD' }: Props) {
  const resolved = resolveQuoteDiamondPickerConfig({ diamondPicker: value });
  const { data: distinct, isLoading: distinctLoading } = useDiamondPoolOptions();
  const { data: bounds } = useQuery({
    queryKey: ['diamond-pool-price-range'],
    staleTime: 1000 * 60 * 30,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_diamond_pool_price_range');
      if (error) throw error;
      const b = (data ?? {}) as Record<string, number>;
      return { minNatural: Number(b.minNatural) || 0, maxNatural: Number(b.maxNatural) || 0, minLab: Number(b.minLab) || 0, maxLab: Number(b.maxLab) || 0 };
    },
  });

  const patch = (p: Partial<QuoteDiamondPickerConfig>) => onChange({ ...(value || {}), ...p });

  // Editing state. Re-hydrated whenever the saved filter changes from outside
  // (version switch, reload) — but not from our own emits.
  const [filter, setFilter] = useState<EditFilter | null>(null);
  const lastEmitted = useRef<string>('');
  const savedJson = stableJson(resolved.filter);
  useEffect(() => {
    if (!distinct) return;
    if (filter && savedJson === lastEmitted.current) return;
    setFilter(hydrate(resolved.filter, distinct));
    lastEmitted.current = savedJson;
  }, [distinct, savedJson]); // eslint-disable-line react-hooks/exhaustive-deps

  const update = (next: EditFilter) => {
    setFilter(next);
    if (!distinct) return;
    const cleaned = clean(next, distinct);
    lastEmitted.current = stableJson(cleaned);
    // Drop the first-release keys once the new configuration is saved.
    const { colors: _c, clarities: _cl, markupPercent: _m, ...rest } = value || {};
    onChange({ ...rest, filter: cleaned, markupNatural: resolved.markupNatural, markupLab: resolved.markupLab });
  };

  // Live count + sample of the stones this configuration offers (debounced).
  const previewFilter = useMemo(() => (filter && distinct ? clean(filter, distinct) : resolved.filter), [filter, distinct, resolved.filter]);
  const previewKey = stableJson(previewFilter);
  const [debouncedKey, setDebouncedKey] = useState(previewKey);
  useEffect(() => { const t = window.setTimeout(() => setDebouncedKey(previewKey), 450); return () => window.clearTimeout(t); }, [previewKey]);
  const { data: preview, isFetching: previewLoading } = useQuery<PreviewRow[]>({
    queryKey: ['quote-estimator-diamond-preview', debouncedKey, resolved.markupNatural, resolved.markupLab],
    enabled: !!distinct,
    staleTime: 1000 * 60,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_diamond_pool_preview', {
        p_filter: JSON.parse(debouncedKey),
        p_markup_natural: resolved.markupNatural,
        p_markup_lab: resolved.markupLab,
        p_page_size: 8,
        p_offset: 0,
      });
      if (error) throw error;
      return (data ?? []) as PreviewRow[];
    },
  });
  const totalCount = preview?.[0]?.total_count ?? 0;
  const sym = getCurrencySymbol(currency);
  const all = distinct ? allValues(distinct) : null;

  const summary = useMemo(() => {
    const parts: string[] = [];
    const f = previewFilter;
    if (f.stoneTypes?.length) parts.push(f.stoneTypes.join(' + '));
    if (f.shapes?.length) parts.push(`${f.shapes.length} shape${f.shapes.length > 1 ? 's' : ''}`);
    if (f.colors?.length) parts.push(`${f.colors.length} colour${f.colors.length > 1 ? 's' : ''}`);
    if (f.clarities?.length) parts.push(`${f.clarities.length} clarit${f.clarities.length > 1 ? 'ies' : 'y'}`);
    if (f.cuts?.length) parts.push(`${f.cuts.length} cut`);
    if (f.labs?.length) parts.push(f.labs.join('/'));
    if (f.caratRanges?.length) parts.push(`${f.caratRanges.length} carat range${f.caratRanges.length > 1 ? 's' : ''}`);
    else if (f.caratMin || f.caratMax) parts.push(`carat ${f.caratMin || '0'}–${f.caratMax || '∞'}`);
    return parts.length ? parts.join(' · ') : 'No restrictions · the whole diamond pool';
  }, [previewFilter]);

  return (
    <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(340px,0.7fr)]">
      <Card className="p-6 space-y-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold text-foreground">Diamond Configuration</h3>
            <p className="text-xs text-muted-foreground">
              Which stones from the complete JewlX diamond pool the Quote Estimator may offer. After Natural / Lab, shape and size the
              customer filters by colour and clarity and picks an exact diamond; its price, certificate number and certificate PDF go into
              the quote, the lead and both emails. Independent of any Ring OS catalogue. Saved with "Save Configuration".
            </p>
          </div>
          <Switch checked={resolved.enabled} onCheckedChange={v => patch({ enabled: v })} aria-label="Enable diamond picker" />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <Label className="text-sm">Diamonds shown</Label>
            <Input
              type="number"
              min={QUOTE_DIAMOND_LIMIT_MIN}
              max={QUOTE_DIAMOND_LIMIT_MAX}
              value={value?.limit ?? QUOTE_DIAMOND_PICKER_DEFAULTS.limit}
              onChange={e => patch({ limit: e.target.value === '' ? undefined : Number(e.target.value) })}
            />
            <p className="text-[11px] text-muted-foreground">{QUOTE_DIAMOND_LIMIT_MIN}–{QUOTE_DIAMOND_LIMIT_MAX} per list. Default {QUOTE_DIAMOND_PICKER_DEFAULTS.limit}.</p>
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm">Natural markup (%)</Label>
            <Input type="number" min={0} max={500} step="0.5" value={value?.markupNatural ?? value?.markupPercent ?? 0} onChange={e => patch({ markupNatural: e.target.value === '' ? undefined : Math.max(0, Number(e.target.value) || 0) })} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm">Lab-grown markup (%)</Label>
            <Input type="number" min={0} max={500} step="0.5" value={value?.markupLab ?? value?.markupPercent ?? 0} onChange={e => patch({ markupLab: e.target.value === '' ? undefined : Math.max(0, Number(e.target.value) || 0) })} />
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground -mt-2">Displayed price = pool base price × (1 + markup ÷ 100). Pool prices are listed in USD.</p>

        {distinctLoading || !filter || !all ? (
          <p className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Loading pool options…</p>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold">Filters</h4>
              <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => update(hydrate({}, distinct!))}>
                <RotateCcw className="w-3 h-3 mr-1" /> Reset to everything
              </Button>
            </div>
            <Accordion type="multiple" defaultValue={['stoneTypes', 'shapes', 'carat']} className="space-y-1">
              <Group id="stoneTypes" label="Stone Type">
                <SelectClear values={all.stoneTypes} current={filter.stoneTypes} onChange={next => update({ ...filter, stoneTypes: next })} />
                <div className="grid grid-cols-2 gap-2">
                  {[{ id: 'natural', label: 'Natural', Icon: Gem }, { id: 'lab', label: 'Lab-Grown', Icon: Sparkles }].map(({ id, label, Icon }) => {
                    const on = filter.stoneTypes.includes(id);
                    return (
                      <button key={id} type="button" onClick={() => update({ ...filter, stoneTypes: toggle(filter.stoneTypes, id) })}
                        className={cn('relative flex flex-col items-center justify-center rounded-xl border px-2 py-3 transition-all bg-background hover:bg-accent/30', on ? 'border-primary bg-primary/5 ring-1 ring-primary/30 text-foreground' : 'border-border text-muted-foreground hover:text-foreground')}>
                        {on && <span className="absolute top-1 right-1 w-3.5 h-3.5 rounded-full bg-primary flex items-center justify-center"><Check className="w-2.5 h-2.5 text-primary-foreground" strokeWidth={3} /></span>}
                        <Icon className="w-5 h-5 mb-1.5 opacity-80" />
                        <span className="text-[11px] font-medium">{label}</span>
                      </button>
                    );
                  })}
                </div>
              </Group>

              <Group id="shapes" label={`Shapes (${filter.shapes.length}/${all.shapes.length})`}>
                <SelectClear values={all.shapes} current={filter.shapes} onChange={next => update({ ...filter, shapes: next })} />
                <div className="grid grid-cols-4 sm:grid-cols-5 gap-2">
                  {all.shapes.map(id => {
                    const on = filter.shapes.includes(id);
                    return (
                      <button key={id} type="button" onClick={() => update({ ...filter, shapes: toggle(filter.shapes, id) })}
                        className={cn('relative aspect-square flex flex-col items-center justify-center rounded-xl border px-1 py-2 transition-all bg-background hover:bg-accent/30', on ? 'border-primary bg-primary/5 ring-1 ring-primary/30 text-foreground' : 'border-border text-muted-foreground hover:text-foreground')}>
                        {on && <span className="absolute top-1 right-1 w-3.5 h-3.5 rounded-full bg-primary flex items-center justify-center"><Check className="w-2.5 h-2.5 text-primary-foreground" strokeWidth={3} /></span>}
                        <ShapeIcon shapeId={id} size="sm" />
                        <span className="text-[10px] font-medium mt-1 capitalize truncate w-full text-center">{id}</span>
                      </button>
                    );
                  })}
                </div>
              </Group>

              <Group id="carat" label={`Carat Range${filter.caratRanges.length ? ` (${filter.caratRanges.length})` : ''}`}>
                <div className="flex items-center gap-1 mb-1">
                  <Button type="button" variant="ghost" size="sm" className="h-6 px-2 text-[10px] uppercase tracking-wide" onClick={() => update({ ...filter, caratRanges: CARAT_RANGE_OPTIONS.map(o => o.value) })}>Select all</Button>
                  <span className="text-muted-foreground text-[10px]">·</span>
                  <Button type="button" variant="ghost" size="sm" className="h-6 px-2 text-[10px] uppercase tracking-wide" disabled={!filter.caratRanges.length} onClick={() => update({ ...filter, caratRanges: [] })}>Clear all</Button>
                </div>
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5">
                  {CARAT_RANGE_OPTIONS.map(o => (
                    <Chip key={o.value} selected={filter.caratRanges.includes(o.value)} onClick={() => update({ ...filter, caratRanges: filter.caratRanges.includes(o.value) ? filter.caratRanges.filter(v => v !== o.value) : [...filter.caratRanges, o.value].sort((a, b) => a - b) })}>{o.label}</Chip>
                  ))}
                </div>
                <p className="text-[11px] text-muted-foreground">Nothing selected = every carat. The customer's chosen size narrows this further.</p>
                <div className="grid grid-cols-2 gap-2">
                  <div><Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Min carat</Label><Input type="number" step="0.01" min="0" value={filter.caratMin} onChange={e => update({ ...filter, caratMin: e.target.value })} className="h-8" /></div>
                  <div><Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Max carat</Label><Input type="number" step="0.01" min="0" value={filter.caratMax} onChange={e => update({ ...filter, caratMax: e.target.value })} className="h-8" /></div>
                </div>
              </Group>

              <ChipGroup k="colors" label="Color" cols="grid-cols-6" filter={filter} all={all} update={update} />
              <ChipGroup k="clarities" label="Clarity" cols="grid-cols-5" filter={filter} all={all} update={update} />
              <ChipGroup k="cuts" label="Cut" cols="grid-cols-4" filter={filter} all={all} update={update} />
              <ChipGroup k="polish" label="Polish" cols="grid-cols-4" filter={filter} all={all} update={update} />
              <ChipGroup k="symmetry" label="Symmetry" cols="grid-cols-4" filter={filter} all={all} update={update} />
              <ChipGroup k="fluorescence" label="Fluorescence" cols="grid-cols-3" filter={filter} all={all} update={update} />
              <ChipGroup k="labs" label="Lab / Certification" cols="grid-cols-4" filter={filter} all={all} update={update} />

              <Group id="measurements" label="Measurements (length mm)">
                <div className="grid grid-cols-2 gap-2">
                  <div><Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Min</Label><Input type="number" step="0.1" min="0" value={filter.lengthMin} onChange={e => update({ ...filter, lengthMin: e.target.value })} className="h-8" /></div>
                  <div><Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Max</Label><Input type="number" step="0.1" min="0" value={filter.lengthMax} onChange={e => update({ ...filter, lengthMax: e.target.value })} className="h-8" /></div>
                </div>
                <label className="flex items-center gap-2 text-xs cursor-pointer pt-1">
                  <Switch checked={filter.canadianOnly} onCheckedChange={v => update({ ...filter, canadianOnly: v })} aria-label="Canadian diamonds only" />
                  <span>Canadian-mark eligible diamonds only</span>
                </label>
              </Group>

              {bounds && bounds.maxNatural > 0 && (
                <PriceGroup currency={currency} id="priceNatural" label={`Natural Diamond Price (${sym})`} min={bounds.minNatural} max={bounds.maxNatural} lo={filter.priceMinNatural} hi={filter.priceMaxNatural} onChangeRange={(lo, hi) => update({ ...filter, priceMinNatural: lo, priceMaxNatural: hi })} />
              )}
              {bounds && bounds.maxLab > 0 && (
                <PriceGroup currency={currency} id="priceLab" label={`Lab Diamond Price (${sym})`} min={bounds.minLab} max={bounds.maxLab} lo={filter.priceMinLab} hi={filter.priceMaxLab} onChangeRange={(lo, hi) => update({ ...filter, priceMinLab: lo, priceMaxLab: hi })} />
              )}
            </Accordion>

            <div className="space-y-2 border-t border-border pt-4">
              <h4 className="text-sm font-semibold">Price Order</h4>
              <div className="grid grid-cols-2 gap-2 max-w-xs">
                {(['low_to_high', 'high_to_low'] as const).map(dir => (
                  <Chip key={dir} selected={filter.priceSort === dir} onClick={() => update({ ...filter, priceSort: dir })}>{dir === 'high_to_low' ? 'High → Low' : 'Low → High'}</Chip>
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground">Order of the stone list on the form. "Diamonds shown" takes the first stones in this order.</p>
            </div>
          </>
        )}
      </Card>

      <Card className="p-5 space-y-3 xl:sticky xl:top-4">
        <div>
          <h4 className="text-sm font-semibold">Matching stones</h4>
          <p className="text-xs text-muted-foreground">{summary}</p>
        </div>
        <p className="text-2xl font-bold tabular-nums flex items-center gap-2">
          {previewLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          {totalCount.toLocaleString()} <span className="text-sm font-normal text-muted-foreground">diamonds in the pool match</span>
        </p>
        {preview && preview.length > 0 ? (
          <ul className="divide-y divide-border/60 text-xs">
            {preview.map(r => (
              <li key={r.id} className="flex items-center justify-between gap-2 py-1.5">
                <span className="capitalize text-muted-foreground">{r.stone_type} · {r.shape_id}</span>
                <span className="font-medium">{Number(Number(r.carat_value).toFixed(2))} ct {r.color} {r.clarity}</span>
                <span className="font-semibold tabular-nums">{formatCurrency(Number(r.base_price), currency)}</span>
              </li>
            ))}
          </ul>
        ) : !previewLoading ? (
          <p className="text-xs text-destructive">No stone matches this configuration. The form would show an empty list — widen a filter.</p>
        ) : null}
        <p className="text-[11px] text-muted-foreground">Before each list the form also narrows by the customer's Natural / Lab, shape and carat choice and keeps one stone per colour and clarity grade.</p>
      </Card>
    </div>
  );
}
