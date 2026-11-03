import { useEffect, useMemo, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { useQuoteEstimatorDiamonds } from '@/hooks/useQuoteEstimatorDiamonds';
import {
  DIAMOND_CLARITY_ORDER,
  DIAMOND_COLOR_ORDER,
  formatQuoteDiamondPrice,
  sortByGradeOrder,
  toSelectedDiamond,
  type QuoteEstimatorDiamond,
  type QuoteSelectedDiamond,
} from '@/lib/quote-estimator-diamonds';
import { DiamondStepSpinner } from './DiamondStepSpinner';
import { ShapeIcon } from '@/components/common/ShapeIcon';

// Radix Select does not allow an empty-string item value.
const FILTER_ALL = '__all__';

const DEFAULT_DIAMOND_PICKER_HEADING = {
  title: 'Choose your diamond',
  subtitle: 'Filter by colour and clarity, then pick the exact stone for your ring.',
};

interface DiamondPickerStepProps {
  clientId: string | null | undefined;
  stoneType: string | null;
  shape: string | null;
  size: string | null;
  /** How many stones are listed (from the Diamond Configuration tab). */
  limit: number;
  selected: QuoteSelectedDiamond | null | undefined;
  onSelect: (diamond: QuoteSelectedDiamond) => void;
  onBack?: () => void;
  title?: string;
  subtitle?: string;
  currency?: string;
  /** 'classic' = Theme 1 / Theme 2 step card; 'v3' = Atelier stage body only. */
  variant?: 'classic' | 'v3';
}

const sameStone = (a: QuoteSelectedDiamond | null | undefined, d: QuoteEstimatorDiamond) =>
  !!a && ((a.poolId && a.poolId === d.pool_id) || (!!a.reportNo && a.reportNo === d.report_no));

/**
 * "Mini Nivoda" stone list for the Quote Estimator (Sandbox account). Mirrors
 * the Ring OS Stone step: Colour / Clarity dropdowns built from the stones in
 * stock, each dropdown narrowed by the other, cheapest stones first.
 */
export function DiamondPickerStep({ clientId, stoneType, shape, size, limit, selected, onSelect, onBack, title, subtitle, currency = 'USD', variant = 'classic' }: DiamondPickerStepProps) {
  const { data: result, isLoading, isError, refetch } = useQuoteEstimatorDiamonds({ clientId, stoneType, shape, size });
  const stones = useMemo(() => result?.stones ?? [], [result]);
  const nearestSizes = result?.nearestSizes ?? false;
  const [colorFilter, setColorFilter] = useState(FILTER_ALL);
  const [clarityFilter, setClarityFilter] = useState(FILTER_ALL);

  // Filters restart whenever the stone set changes (type / shape / carat).
  useEffect(() => { setColorFilter(FILTER_ALL); setClarityFilter(FILTER_ALL); }, [stoneType, shape, size]);

  const colorOptions = useMemo(() => sortByGradeOrder(
    Array.from(new Set(stones.filter(s => clarityFilter === FILTER_ALL || s.clarity === clarityFilter).map(s => s.color).filter(Boolean))),
    DIAMOND_COLOR_ORDER,
  ), [stones, clarityFilter]);
  const clarityOptions = useMemo(() => sortByGradeOrder(
    Array.from(new Set(stones.filter(s => colorFilter === FILTER_ALL || s.color === colorFilter).map(s => s.clarity).filter(Boolean))),
    DIAMOND_CLARITY_ORDER,
  ), [stones, colorFilter]);

  const filtered = useMemo(() => stones
    .filter(s => (colorFilter === FILTER_ALL || s.color === colorFilter) && (clarityFilter === FILTER_ALL || s.clarity === clarityFilter))
    // Closest-size lists keep the hook's nearest-first order; exact lists go cheapest first.
    .sort((a, b) => (nearestSizes ? 0 : a.price - b.price || a.carat_value - b.carat_value)), [stones, colorFilter, clarityFilter, nearestSizes]);
  const visible = filtered.slice(0, limit);
  const typeLabel = stoneType === 'lab' ? 'Lab' : stoneType === 'natural' ? 'Natural' : '';
  const price = (n: number) => formatQuoteDiamondPrice(n, currency);
  const stoneKey = (d: QuoteEstimatorDiamond) => d.pool_id || d.report_no || `${d.carat_value}-${d.color}-${d.clarity}-${d.price}`;

  const filters = (
    <div className={cn('grid grid-cols-2 gap-2 md:gap-3', variant === 'v3' && 'v3-diamond-filters')}>
      <div>
        <p className="text-[10px] md:text-xs uppercase tracking-wider text-gray-600 mb-1">Color</p>
        <Select value={colorFilter} onValueChange={setColorFilter}>
          <SelectTrigger className="bg-white h-10 md:h-11 text-sm text-gray-800 border-gray-200" aria-label="Filter by colour"><SelectValue placeholder="All Colors" /></SelectTrigger>
          <SelectContent>
            <SelectItem value={FILTER_ALL}>All Colors</SelectItem>
            {colorOptions.map(c => <SelectItem key={c} value={c}>{c} Color</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div>
        <p className="text-[10px] md:text-xs uppercase tracking-wider text-gray-600 mb-1">Clarity</p>
        <Select value={clarityFilter} onValueChange={setClarityFilter}>
          <SelectTrigger className="bg-white h-10 md:h-11 text-sm text-gray-800 border-gray-200" aria-label="Filter by clarity"><SelectValue placeholder="All Clarities" /></SelectTrigger>
          <SelectContent>
            <SelectItem value={FILTER_ALL}>All Clarities</SelectItem>
            {clarityOptions.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
    </div>
  );

  const list = isLoading ? (
    <div className="flex items-center justify-center py-10"><DiamondStepSpinner /></div>
  ) : isError ? (
    <div className="text-center py-8 space-y-3">
      <p className="text-sm text-gray-600">We could not load the diamonds right now.</p>
      <Button type="button" size="sm" onClick={() => refetch()} className="bg-black text-white hover:bg-gray-900 border border-black">Try again</Button>
    </div>
  ) : stones.length === 0 ? (
    <p className="text-center text-sm text-gray-600 py-8">No {typeLabel.toLowerCase()} diamonds are in stock for this shape and size right now. Please go back and try another size.</p>
  ) : filtered.length === 0 ? (
    <p className="text-center text-sm text-gray-600 py-8">No diamonds match this colour and clarity. Try another combination.</p>
  ) : (
    <div className={cn('space-y-2', variant === 'v3' && 'v3-diamond-list')} role="listbox" aria-label={`${typeLabel} diamonds`}>
      {visible.map(d => {
        const key = stoneKey(d);
        const isSelected = sameStone(selected, d);
        return (
          <div key={key} className={cn('bg-white rounded-lg overflow-hidden transition-all', isSelected ? 'ring-2 ring-gray-400 shadow-lg' : 'hover:shadow-md')}>
            <div className="flex items-center gap-2 md:gap-3 px-3 py-2.5 md:px-4 md:py-3">
              {/* Small shape picture, like the diamond catalogue cards. */}
              <span className="shrink-0 w-9 h-9 md:w-10 md:h-10 rounded-md bg-white border border-gray-100 flex items-center justify-center overflow-hidden" aria-hidden="true">
                <ShapeIcon shapeId={d.shape_id || ''} size="sm" variant="transparent" className="!w-8 !h-8 object-contain" />
              </span>
              <button
                type="button"
                role="option"
                aria-selected={isSelected}
                onClick={() => onSelect(toSelectedDiamond(d))}
                className="bg-white flex-1 min-w-0 flex items-center justify-between gap-3 text-left"
              >
                <span className="min-w-0 flex items-baseline gap-2 flex-wrap text-gray-800">
                  <span className="font-semibold text-sm md:text-base">{Number(d.carat_value.toFixed(2))} ct</span>
                  <span className="font-semibold text-sm md:text-base">{d.color} Color</span>
                  <span className="text-xs md:text-sm text-gray-600">{d.clarity}</span>
                </span>
                <span className="font-bold text-sm md:text-base text-gray-900 shrink-0">{price(d.price)}</span>
              </button>
              <span className={cn('shrink-0 w-5 h-5 rounded-full flex items-center justify-center border-2 border-white', isSelected ? 'bg-gray-800' : 'bg-transparent')} aria-hidden="true">
                {isSelected && <Check className="w-3 h-3 text-white" />}
              </span>
            </div>
          </div>
        );
      })}
      {filtered.length > visible.length && (
        <p className="text-center text-[11px] md:text-xs text-gray-500 pt-1">Showing the {visible.length} best-priced of {filtered.length} diamonds. Narrow by colour or clarity to see others.</p>
      )}
    </div>
  );

  const body = (
    <div className="w-full max-w-xl mx-auto space-y-3 md:space-y-4">
      {typeLabel && <p className="text-center text-sm md:text-base font-semibold text-gray-800">Available {typeLabel} Diamonds</p>}
      {filters}
      {!isLoading && !isError && stones.length > 0 && (
        <p className="text-xs md:text-sm text-gray-600 flex items-center gap-1">
          {filtered.length} {filtered.length === 1 ? 'diamond' : 'diamonds'} found
          <ChevronDown className="w-3 h-3" aria-hidden="true" />
        </p>
      )}
      {!isLoading && !isError && nearestSizes && (
        <p className="text-xs md:text-sm text-gray-600 bg-white rounded-lg px-3 py-2" role="status">
          No {size ? `${String(size).replace(/ct\+?$/i, '')} ct ` : ''}{typeLabel.toLowerCase()} diamonds are in stock right now, so here are the closest sizes from our collection.
        </p>
      )}
      {list}
    </div>
  );

  if (variant === 'v3') return <div className="v3-diamond-picker">{body}</div>;

  return (
    <div className="bg-[#EDE8E3] rounded-lg p-4 md:p-10 relative min-h-[100dvh] md:min-h-0">
      <div className="text-center mb-4 md:mb-6">
        <h2 className="text-lg md:text-3xl font-bold text-gray-900 mb-1 md:mb-2">{title || DEFAULT_DIAMOND_PICKER_HEADING.title}</h2>
        {(subtitle ?? DEFAULT_DIAMOND_PICKER_HEADING.subtitle) && (
          <p className="text-gray-600 text-xs md:text-base">{subtitle || DEFAULT_DIAMOND_PICKER_HEADING.subtitle}</p>
        )}
      </div>
      {body}
      {onBack && (
        <div className="flex justify-center mt-4 md:mt-6">
          <Button variant="secondary" onClick={onBack} className="bg-black text-white hover:bg-gray-900 px-6 md:px-8 border border-black">Back</Button>
        </div>
      )}
    </div>
  );
}
