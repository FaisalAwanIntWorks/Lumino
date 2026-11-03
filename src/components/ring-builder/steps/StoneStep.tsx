import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { Stone } from '@/types/ring-builder';
import { MOCK_NATURAL_STONES, MOCK_LAB_STONES } from '@/data/ring-builder-mock';
import { Card } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { StepHeader } from './StepHeader';
import { Diamond, Check, Info } from 'lucide-react';
import { StoneInfoDialog } from '../StoneInfoDialog';
import { DiamondDetailInfoDialog } from '../DiamondDetailInfoDialog';
import { ClientDiamondPreset } from '@/hooks/useClientDiamondPresets';
import { getDiamondShapeIcon } from '@/lib/diamond-shape-icons';
import { fallbackToPngOnError } from '@/lib/webp-image-fallback';
import { supabase } from '@/integrations/supabase/client';
import { useWidgetTheme } from '@/contexts/WidgetThemeContext';
const normalizeShapeId = (value?: string | null) => String(value ?? '').trim().toLowerCase();
const getBucketStart = (value: number) => Math.floor(Number(value) * 2) / 2;

// Sentinel for "no filter" in the Color / Clarity dropdowns (Radix Select
// does not allow an empty-string item value).
const FILTER_ALL = '__all__';
// GIA grade order so dropdown options read best -> lowest, not alphabetically.
const COLOR_ORDER = ['D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z'];
const CLARITY_ORDER = ['FL', 'IF', 'VVS1', 'VVS2', 'VS1', 'VS2', 'SI1', 'SI2', 'SI3', 'I1', 'I2', 'I3'];
const normalizeGrade = (value?: string | null) => String(value ?? '').trim().toUpperCase();
const sortByGradeOrder = (values: string[], order: string[]) =>
  [...values].sort((a, b) => {
    const ia = order.indexOf(a);
    const ib = order.indexOf(b);
    if (ia !== -1 && ib !== -1) return ia - ib;
    if (ia !== -1) return -1;
    if (ib !== -1) return 1;
    return a.localeCompare(b);
  });
const uniqueGrades = (presets: ClientDiamondPreset[], key: 'color' | 'clarity', order: string[]) =>
  sortByGradeOrder(
    Array.from(new Set(presets.map((p) => normalizeGrade(p[key])).filter((v) => v.length > 0))),
    order,
  );

interface StoneStepProps {
  selected: Stone | null;
  onSelect: (stone: Stone) => void;
  /**
   * Fired only when the user deliberately picks a specific diamond (a row in
   * the list or "select" in the detail dialog). Picking Natural/Lab only opens
   * the list, so it must not count as the step's final choice. Used by
   * Click-to-Continue to advance.
   */
  onDiamondPick?: () => void;
  selectedShape?: string | null;
  selectedCaratRange?: number | null;
  diamondPresets?: ClientDiamondPreset[];
  clientId?: string | null;
  currency?: string;
  /** 24k: natural diamonds are quote-only, so their prices are hidden. */
  hideNaturalPrices?: boolean;
}

export const StoneStep = ({ 
  selected, 
  onSelect, 
  onDiamondPick,
  selectedShape,
  selectedCaratRange,
  diamondPresets = [],
  clientId,
  currency = 'USD',
  hideNaturalPrices = false,
}: StoneStepProps) => {
  const { theme, styleOverrides } = useWidgetTheme();
  const isTwentyFourK = theme === 'twentyfourk';
  // Color / Clarity filters for the expanded diamond list. FILTER_ALL = off.
  const [colorFilter, setColorFilter] = useState<string>(FILTER_ALL);
  const [clarityFilter, setClarityFilter] = useState<string>(FILTER_ALL);
  const [expandedType, setExpandedType] = useState<'natural' | 'lab' | null>(() => {
    if (!selected) return null;
    return selected.type === 'lab' ? 'lab' : selected.type === 'natural' ? 'natural' : null;
  });
  const [infoDialogOpen, setInfoDialogOpen] = useState(false);
  const [infoStoneType, setInfoStoneType] = useState<'natural' | 'lab' | null>(null);
  const [detailPreset, setDetailPreset] = useState<ClientDiamondPreset | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [livePresets, setLivePresets] = useState<ClientDiamondPreset[] | null>(null);
  // True while the per-bucket diamond RPC is in flight. Starts true when the
  // fetch is about to run so the first paint shows the skeleton, not a gap.
  const [liveLoading, setLiveLoading] = useState<boolean>(
    () => Boolean(clientId && selectedShape && selectedCaratRange != null),
  );
  // Natural/Lab clicked while the list was still loading — resolved once it lands.
  const [pendingType, setPendingType] = useState<'natural' | 'lab' | null>(null);

  const handleStoneInfoClick = (e: React.MouseEvent, type: 'natural' | 'lab') => {
    e.stopPropagation();
    setInfoStoneType(type);
    setInfoDialogOpen(true);
  };

  useEffect(() => {
    let cancelled = false;

    const loadSelectedBucket = async () => {
      if (!clientId || !selectedShape || selectedCaratRange == null) {
        setLivePresets(null);
        setLiveLoading(false);
        return;
      }

      setLiveLoading(true);

      const shapeId = normalizeShapeId(selectedShape);
      const bucketStart = getBucketStart(selectedCaratRange);
      // Format must match what the RPC builds internally:
      //   TRIM(TO_CHAR(bucket,'FM0.00')) || '-' || TRIM(TO_CHAR(bucket+0.49,'FM0.00'))
      const caratRangeLabel = `${bucketStart.toFixed(2)}-${(bucketStart + 0.49).toFixed(2)}`;

      // Pass p_carat_range so the DB returns only this bucket's diamonds.
      // Without it, the RPC orders by carat_value ASC and the 2000-row limit
      // cuts off high-carat (expensive) diamonds in large catalogs.
      // Legacy unconfirmed rows with NULL carat_range will return 0 rows here,
      // which causes livePresets to stay null and the component falls back to
      // the diamondPresets prop (loaded by useClientDiamondPresets separately).
      const { data, error } = await supabase.rpc('get_diamond_presets_filtered', {
        p_client_id: clientId,
        p_shape_id: shapeId,
        p_carat_range: caratRangeLabel,
        p_page_size: 2000,
        p_offset: 0,
      });

      if (cancelled) return;

      if (error) {
        console.error('[StoneStep] RPC error', { shapeId, bucketStart, error });
        setLivePresets(null);
        setLiveLoading(false);
        return;
      }

      const rows = ((data ?? []) as Record<string, unknown>[]).map((preset) => ({
        id: preset.id as string,
        stone_type: preset.stone_type as 'natural' | 'lab',
        shape_id: preset.shape_id as string,
        carat_range: preset.carat_range as string,
        carat_value: Number(preset.carat_value),
        color: preset.color as string,
        clarity: preset.clarity as string,
        base_price: Number(preset.base_price),
        custom_price: preset.custom_price !== null ? Number(preset.custom_price) : null,
        is_enabled: preset.is_enabled as boolean,
        cut_grade: (preset.cut_grade as string) ?? null,
        fluorescence: (preset.fluorescence as string) ?? null,
        report_no: (preset.report_no as string) ?? null,
      }));

      console.log(
        `[StoneStep] loaded ${rows.length} rows for shape="${shapeId}" bucket=${bucketStart}`,
        rows.length > 0 ? { sample: rows[0] } : '(empty)',
      );

      setLivePresets(rows.length > 0 ? rows : null);
      setLiveLoading(false);
    };

    loadSelectedBucket();
    return () => {
      cancelled = true;
    };
  }, [clientId, selectedShape, selectedCaratRange]);
  
  // Filter presets by current shape and carat bucket (selectedCaratRange is
  // the bucket start, e.g. 1.5 covers all diamonds 1.50–1.99 ct).
  const filteredPresets = useMemo(() => {
    const sourcePresets = livePresets && livePresets.length > 0 ? livePresets : diamondPresets;
    if (!selectedShape || selectedCaratRange == null || sourcePresets.length === 0) return [];
    const selectedShapeId = normalizeShapeId(selectedShape);
    const bucketStart = getBucketStart(selectedCaratRange);
    return sourcePresets.filter(preset =>
      normalizeShapeId(preset.shape_id) === selectedShapeId &&
      getBucketStart(preset.carat_value) === bucketStart,
    );
  }, [diamondPresets, livePresets, selectedShape, selectedCaratRange]);

  

  // The RPC already returns exactly one representative stone per
  // (color, clarity) group for the active carat bucket — outlier-rejected,
  // cheapest healthy listing, coherence-checked. No client-side dedup.
  const naturalOptions = useMemo(
    () => filteredPresets.filter(p => p.stone_type === 'natural'),
    [filteredPresets]
  );
  const labOptions = useMemo(
    () => filteredPresets.filter(p => p.stone_type === 'lab'),
    [filteredPresets]
  );

  const presetToStone = (preset: ClientDiamondPreset): Stone => ({
    id: preset.id,
    type: preset.stone_type,
    price: preset.custom_price ?? preset.base_price,
    carat: preset.carat_value,
    color: preset.color,
    clarity: preset.clarity,
    reportNo: preset.report_no ?? null,
  });

  const naturalStone = naturalOptions.length > 0 ? presetToStone(naturalOptions[0]) : MOCK_NATURAL_STONES[0];
  const labStone = labOptions.length > 0 ? presetToStone(labOptions[0]) : MOCK_LAB_STONES[0];

  // When livePresets loads (after a stale diamondPresets selection), the
  // selected stone may have been deduplicated away. Auto-upgrade to the best
  // available option for that type so the selection stays consistent.
  useEffect(() => {
    if (!selected || !expandedType) return;
    const options = expandedType === 'natural' ? naturalOptions : labOptions;
    if (options.length === 0) return;
    const stillAvailable = options.some(o => o.id === selected.id);
    if (!stillAvailable) {
      onSelect(presetToStone(options[0]));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [naturalOptions, labOptions]);

  const hasCatalogPresets = (livePresets?.length ?? 0) > 0 || diamondPresets.length > 0;
  const hasNaturalOptions = naturalOptions.length > 0 || !hasCatalogPresets;
  const hasLabOptions = labOptions.length > 0 || !hasCatalogPresets;

  const selectedType: 'natural' | 'lab' | null = (() => {
    if (!selected) return null;
    if (naturalOptions.some((s) => s.id === selected.id)) return 'natural';
    if (labOptions.some((s) => s.id === selected.id)) return 'lab';
    if (MOCK_LAB_STONES.some((s) => s.id === selected.id)) return 'lab';
    if (MOCK_NATURAL_STONES.some((s) => s.id === selected.id)) return 'natural';
    return null;
  })();

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency, minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(price);
  };

  const handleTypeClick = (type: 'natural' | 'lab') => {
    setExpandedType(type);
    const options = type === 'natural' ? naturalOptions : labOptions;
    if (options.length === 0 && liveLoading) {
      // Diamonds are still loading: show the skeleton and decide once they
      // arrive, instead of picking a placeholder stone or skipping the list.
      setPendingType(type);
      return;
    }
    setPendingType(null);
    if (options.length > 0) {
      // Pre-select the first diamond, but stay here so the user can choose
      // from the list that opens below.
      onSelect(presetToStone(options[0]));
    } else {
      // No diamond list for this type — the type itself is the final choice.
      onSelect(type === 'natural' ? naturalStone : labStone);
      onDiamondPick?.();
    }
  };

  // Resolve a Natural/Lab click that happened while the list was loading.
  useEffect(() => {
    if (!pendingType || liveLoading) return;
    const options = pendingType === 'natural' ? naturalOptions : labOptions;
    if (options.length > 0) {
      onSelect(presetToStone(options[0]));
    } else {
      onSelect(pendingType === 'natural' ? naturalStone : labStone);
    }
    setPendingType(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingType, liveLoading, naturalOptions, labOptions]);

  const expandedOptions = useMemo(() => {
    if (!expandedType) return [];
    return expandedType === 'natural' ? naturalOptions : labOptions;
  }, [expandedType, naturalOptions, labOptions]);

  // Filters only make sense for the list they were chosen on: clear them
  // whenever the user switches Natural/Lab, or the shape / carat bucket
  // (and therefore the whole list) changes.
  useEffect(() => {
    setColorFilter(FILTER_ALL);
    setClarityFilter(FILTER_ALL);
  }, [expandedType, selectedShape, selectedCaratRange]);

  // Dropdown options come straight from the diamonds the client saved for
  // this shape + carat bucket + type, never from a static grade list. Each
  // dropdown is narrowed by the other one so a combination can never be empty.
  const colorOptions = useMemo(() => {
    const pool = clarityFilter === FILTER_ALL
      ? expandedOptions
      : expandedOptions.filter((p) => normalizeGrade(p.clarity) === clarityFilter);
    return uniqueGrades(pool, 'color', COLOR_ORDER);
  }, [expandedOptions, clarityFilter]);
  const clarityOptions = useMemo(() => {
    const pool = colorFilter === FILTER_ALL
      ? expandedOptions
      : expandedOptions.filter((p) => normalizeGrade(p.color) === colorFilter);
    return uniqueGrades(pool, 'clarity', CLARITY_ORDER);
  }, [expandedOptions, colorFilter]);

  // A filter value that no longer exists in the list (e.g. the live RPC
  // replaced the prop presets) silently behaves as "All".
  const activeColor = colorFilter !== FILTER_ALL && colorOptions.includes(colorFilter) ? colorFilter : FILTER_ALL;
  const activeClarity = clarityFilter !== FILTER_ALL && clarityOptions.includes(clarityFilter) ? clarityFilter : FILTER_ALL;
  const hasActiveFilter = activeColor !== FILTER_ALL || activeClarity !== FILTER_ALL;

  const visibleOptions = useMemo(() => {
    if (!hasActiveFilter) return expandedOptions;
    return expandedOptions.filter((p) =>
      (activeColor === FILTER_ALL || normalizeGrade(p.color) === activeColor) &&
      (activeClarity === FILTER_ALL || normalizeGrade(p.clarity) === activeClarity),
    );
  }, [expandedOptions, activeColor, activeClarity, hasActiveFilter]);

  // Keep the chosen diamond visible: if a filter hides it, move the selection
  // to the first diamond that matches (no onDiamondPick, so no auto-advance).
  useEffect(() => {
    if (!expandedType || !hasActiveFilter || visibleOptions.length === 0) return;
    if (selected && visibleOptions.some((p) => p.id === selected.id)) return;
    onSelect(presetToStone(visibleOptions[0]));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleOptions, hasActiveFilter, expandedType]);

  const resetFilters = () => {
    setColorFilter(FILTER_ALL);
    setClarityFilter(FILTER_ALL);
  };

  const filterTriggerClass = isTwentyFourK
    ? 'h-auto rounded-none border-border bg-card text-foreground px-3 py-1.5 hover:border-accent/50 focus:border-accent'
    : 'h-auto rounded-none border-white/15 bg-transparent text-foreground px-3 py-1.5 hover:border-white/30 focus:border-white/40';
  // The dropdown menu is portaled outside the widget. On 24K the base theme
  // is dark and only the right-hand panel is light (via the descendant rule
  // `[data-theme=twentyfourk] .twentyfourk-light-panel`), so the menu keeps
  // data-theme on the outer element and re-applies the light panel on an
  // inner wrapper. Other themes just reuse their own palette.
  const filterContentClass = isTwentyFourK
    ? 'rounded-none border-0 bg-transparent shadow-none'
    : 'rounded-none border-white/15 bg-background text-foreground';
  const renderFilterItems = (items: React.ReactNode) =>
    isTwentyFourK ? (
      <div className="twentyfourk-light-panel border border-border bg-card text-foreground shadow-lg">{items}</div>
    ) : (
      items
    );


  const shapeIcon = selectedShape ? getDiamondShapeIcon(selectedShape) : null;

  return (
    <div className="p-3 md:p-4 space-y-3">
      <StepHeader 
        description="Choose between natural and lab-created"
      />

      <p className="flex items-start justify-center gap-1.5 text-[10px] md:text-xs text-muted-foreground/80 leading-snug max-w-md mx-auto text-center px-2">
        <Info className="w-3 h-3 mt-0.5 shrink-0 opacity-70" />
        <span>Diamond pricing is estimated. Select your preferences, and we'll help refine the diamond and final price with you after</span>
      </p>


      <div className="grid grid-cols-2 gap-1.5 md:gap-2 max-w-xl mx-auto">
        {hasNaturalOptions && (
          <Card
            onClick={() => handleTypeClick('natural')}
            className={`p-2.5 md:p-4 cursor-pointer transition-all duration-200 active:scale-[0.98] rounded-none relative ${
              selectedType === 'natural' || expandedType === 'natural'
                ? 'border-2 border-accent bg-accent/[0.12]'
                : isTwentyFourK
                  ? 'border border-border bg-card hover:border-accent/50'
                  : 'border border-white/15 bg-transparent hover:border-white/30'
            }`}
          >
            <button onClick={(e) => handleStoneInfoClick(e, 'natural')} className="absolute top-3 right-3 p-0.5 rounded-full hover:bg-white/10 transition-colors">
              <Info className="w-3.5 h-3.5 text-foreground/70" />
            </button>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                {shapeIcon ? (
                  <img src={shapeIcon} alt="diamond shape" className="w-12 h-12 object-contain" onError={fallbackToPngOnError} />
                ) : (
                  <Diamond className={`h-10 w-10 ${selectedType === 'natural' ? 'text-foreground' : 'text-muted-foreground'}`} />
                )}
                <div className="text-sm font-semibold tracking-wide">Natural Diamond</div>
              </div>
              
            </div>

          </Card>
        )}

        {hasLabOptions && (
          <Card
            onClick={() => handleTypeClick('lab')}
            className={`p-2.5 md:p-4 cursor-pointer transition-all duration-200 active:scale-[0.98] rounded-none relative ${
              selectedType === 'lab' || expandedType === 'lab'
                ? 'border-2 border-accent bg-accent/[0.12]'
                : isTwentyFourK
                  ? 'border border-border bg-card hover:border-accent/50'
                  : 'border border-white/15 bg-transparent hover:border-white/30'
            }`}
          >
            <button onClick={(e) => handleStoneInfoClick(e, 'lab')} className="absolute top-3 right-3 p-0.5 rounded-full hover:bg-white/10 transition-colors">
              <Info className="w-3.5 h-3.5 text-foreground/70" />
            </button>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                {shapeIcon ? (
                  <img src={shapeIcon} alt="diamond shape" className="w-12 h-12 object-contain" onError={fallbackToPngOnError} />
                ) : (
                  <Diamond className={`h-10 w-10 ${selectedType === 'lab' ? 'text-foreground' : 'text-muted-foreground'}`} />
                )}
                <div className="text-sm font-semibold tracking-wide">Lab Diamond</div>
              </div>
            </div>


          </Card>
        )}
      </div>

      {/* Skeleton rows while the chosen type's diamonds are still loading */}
      {expandedType && liveLoading && expandedOptions.length === 0 && (
        <div className="mt-4 max-w-xl mx-auto" role="status" aria-busy="true" aria-live="polite">
          <h3 className="text-sm font-semibold mb-2 text-center text-foreground">
            Available {expandedType === 'natural' ? 'Natural' : 'Lab'} Diamonds
          </h3>
          <span className="sr-only">Loading diamonds…</span>
          <div className={isTwentyFourK ? 'border border-border bg-card' : 'border border-white/15'}>
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className={`flex items-center justify-between p-3 py-4 border-b last:border-b-0 animate-pulse ${
                  isTwentyFourK ? 'border-border' : 'border-white/15'
                }`}
                style={{ animationDelay: `${i * 120}ms` }}
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded bg-foreground/10" />
                  <div className="h-3.5 w-16 rounded bg-foreground/15" />
                  <div className="h-3.5 w-9 rounded bg-foreground/10" />
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-3.5 w-16 rounded bg-foreground/15" />
                  <div className="h-3.5 w-3.5 rounded-full bg-foreground/10" />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Expanded diamond options list */}
      {expandedType && expandedOptions.length > 0 && (
        <div className="mt-4 max-w-xl mx-auto">
          <h3 className="text-sm font-semibold mb-2 text-center text-foreground">
            Available {expandedType === 'natural' ? 'Natural' : 'Lab'} Diamonds
          </h3>

          {/* Color / Clarity filters. Options are the grades saved in this
              client's catalog for the current shape + carat range + type. */}
          <div className="flex items-center gap-2 mb-2">
            <Select value={activeColor} onValueChange={setColorFilter}>
              <SelectTrigger aria-label="Filter by color" className={`flex-1 min-w-0 ${filterTriggerClass}`}>
                <div className="flex flex-col items-start text-left leading-tight">
                  <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Color</span>
                  <span className="text-sm font-medium">
                    <SelectValue />
                  </span>
                </div>
              </SelectTrigger>
              <SelectContent data-theme={theme} style={styleOverrides as CSSProperties} className={filterContentClass}>
                {renderFilterItems(
                  <>
                    <SelectItem value={FILTER_ALL}>All Colors</SelectItem>
                    {colorOptions.map((color) => (
                      <SelectItem key={color} value={color}>{color}</SelectItem>
                    ))}
                  </>,
                )}
              </SelectContent>
            </Select>

            <Select value={activeClarity} onValueChange={setClarityFilter}>
              <SelectTrigger aria-label="Filter by clarity" className={`flex-1 min-w-0 ${filterTriggerClass}`}>
                <div className="flex flex-col items-start text-left leading-tight">
                  <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Clarity</span>
                  <span className="text-sm font-medium">
                    <SelectValue />
                  </span>
                </div>
              </SelectTrigger>
              <SelectContent data-theme={theme} style={styleOverrides as CSSProperties} className={filterContentClass}>
                {renderFilterItems(
                  <>
                    <SelectItem value={FILTER_ALL}>All Clarities</SelectItem>
                    {clarityOptions.map((clarity) => (
                      <SelectItem key={clarity} value={clarity}>{clarity}</SelectItem>
                    ))}
                  </>,
                )}
              </SelectContent>
            </Select>

            {hasActiveFilter && (
              <button
                type="button"
                onClick={resetFilters}
                className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground whitespace-nowrap"
              >
                Reset
              </button>
            )}
          </div>
          <p className="text-xs text-muted-foreground mb-2" aria-live="polite">
            {visibleOptions.length} {visibleOptions.length === 1 ? 'diamond' : 'diamonds'} found
          </p>

          <div className={isTwentyFourK ? 'border border-border bg-card' : 'border border-white/15'}>
            {visibleOptions.map((preset) => {
              const isChosen = selected?.id === preset.id;
              return (
                <div
                  key={preset.id}
                  onClick={() => { onSelect(presetToStone(preset)); onDiamondPick?.(); }}
                  className={`flex items-center justify-between p-3 py-4 border-b last:border-b-0 cursor-pointer transition-all ${
                    isTwentyFourK ? 'border-border' : 'border-white/15'
                  } ${
                    isChosen ? 'bg-accent/[0.12]' : 'hover:bg-muted/30'
                  }`}
                >
                  <div className="flex items-center gap-2 sm:gap-3">
                    {shapeIcon && <img src={shapeIcon} alt="diamond shape" className="w-10 h-10 object-contain" onError={fallbackToPngOnError} />}
                    {Number.isFinite(preset.carat_value) && preset.carat_value > 0 && (
                      <span className="text-sm font-medium text-foreground whitespace-nowrap">{preset.carat_value} ct</span>
                    )}
                    <span className="text-sm font-medium text-foreground whitespace-nowrap">{preset.color} Color</span>
                    <span className="text-sm text-muted-foreground">{preset.clarity}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {!(hideNaturalPrices && preset.stone_type === 'natural') && (
                      <span className="text-sm font-semibold text-foreground">
                        {formatPrice(preset.custom_price ?? preset.base_price)}
                      </span>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setDetailPreset(preset);
                        setDetailOpen(true);
                      }}
                      className="p-0.5 rounded-full hover:bg-white/10 transition-colors"
                    >
                      <Info className="w-3.5 h-3.5 text-foreground/70" />
                    </button>
                    {isChosen && <Check className="w-4 h-4 text-foreground" />}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {hasCatalogPresets && filteredPresets.length === 0 && !liveLoading && (
        <p className="text-center text-sm text-muted-foreground mt-4 max-w-md mx-auto">
          No diamonds are currently available for this shape and carat weight. Please go back and choose another shape or carat.
        </p>
      )}

      <StoneInfoDialog open={infoDialogOpen} onOpenChange={setInfoDialogOpen} stoneType={infoStoneType} />
      <DiamondDetailInfoDialog
        open={detailOpen}
        onOpenChange={setDetailOpen}
        preset={detailPreset}
        selectedShape={selectedShape ?? null}
        hidePrice={hideNaturalPrices && detailPreset?.stone_type === 'natural'}
        currency={currency}
        onSelectDiamond={detailPreset ? () => { onSelect(presetToStone(detailPreset)); onDiamondPick?.(); } : undefined}
      />
    </div>
  );
};
