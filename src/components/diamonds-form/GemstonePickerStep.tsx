import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { Check, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useQuoteEstimatorGemstones } from '@/hooks/useQuoteEstimatorGemstones';
import {
  QUOTE_GEMSTONE_PAGE_SIZES,
  formatQuoteGemstonePrice,
  gemstoneDisplayName,
  titleCase,
  toSelectedGemstone,
  type QuoteEstimatorGemstone,
  type QuoteGemstoneSort,
  type QuoteSelectedGemstone,
  type ResolvedQuoteGemstonePickerConfig,
} from '@/lib/quote-estimator-gemstones';
import { findQuoteGemstone } from '@/lib/quote-v3-gemstones';
import { DiamondStepSpinner } from './DiamondStepSpinner';

interface GemstonePickerStepProps {
  clientId: string | null | undefined;
  /** V3 gemstone card value the customer picked on the previous screen. */
  gemstone: string | null;
  /** Size card picked on the carat screen; the list shows only stones inside its carat window. */
  size?: string | null;
  config: ResolvedQuoteGemstonePickerConfig;
  selected: QuoteSelectedGemstone | null | undefined;
  onSelect: (stone: QuoteSelectedGemstone) => void;
  /** Reports how many stones the pool holds for this gemstone (0 lets the step be skipped). */
  onStockKnown?: (total: number) => void;
  currency?: string;
}

const sameStone = (a: QuoteSelectedGemstone | null | undefined, g: QuoteEstimatorGemstone) => !!a && a.poolId === g.pool_id;

/** Page numbers to show: first, last, and a window around the current page. */
function pageWindow(current: number, total: number): (number | 'gap')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages = new Set<number>([1, total, current - 1, current, current + 1]);
  if (current <= 3) [2, 3, 4].forEach(p => pages.add(p));
  if (current >= total - 2) [total - 3, total - 2, total - 1].forEach(p => pages.add(p));
  const sorted = [...pages].filter(p => p >= 1 && p <= total).sort((a, b) => a - b);
  const out: (number | 'gap')[] = [];
  sorted.forEach((p, i) => {
    if (i > 0 && p - sorted[i - 1] > 1) out.push('gap');
    out.push(p);
  });
  return out;
}

/**
 * Quote Estimator V3 gemstone list: the pool stones of the chosen gemstone as
 * compact rows (same layout as the diamond list): small stone picture, carat +
 * colour + name, shape · cut, price and a tick. Tapping a row selects the stone.
 * Sorted by price, with a per-page choice and pages.
 */
export function GemstonePickerStep({ clientId, gemstone, size, config, selected, onSelect, onStockKnown, currency = 'USD' }: GemstonePickerStepProps) {
  const [sort, setSort] = useState<QuoteGemstoneSort>(config.defaultSort);
  const [pageSize, setPageSize] = useState<number>(config.pageSize);
  const [page, setPage] = useState(1);
  const [brokenImages, setBrokenImages] = useState<Set<string>>(new Set());

  // A new gemstone or carat size starts the list over.
  useEffect(() => { setPage(1); setSort(config.defaultSort); setPageSize(config.pageSize); }, [gemstone, size, config.defaultSort, config.pageSize]);

  const { data, isLoading, isError, isFetching, refetch } = useQuoteEstimatorGemstones({ clientId, gemstone, size, sort, pageSize, page });
  const stones = useMemo(() => data?.stones ?? [], [data]);
  const total = data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  useEffect(() => { if (data) onStockKnown?.(data.total); }, [data, onStockKnown]);
  // Page size or sort changes can leave the current page past the end.
  useEffect(() => { if (page > pageCount) setPage(pageCount); }, [page, pageCount]);

  const card = findQuoteGemstone(gemstone);
  const gemName = card?.name ?? titleCase(gemstone);
  const price = (n: number) => formatQuoteGemstonePrice(n, currency);
  const pageSizes = useMemo(() => Array.from(new Set([...QUOTE_GEMSTONE_PAGE_SIZES, config.pageSize])).sort((a, b) => a - b), [config.pageSize]);

  const goPage = (next: number) => {
    const target = Math.max(1, Math.min(pageCount, next));
    if (target === page) return;
    setPage(target);
    window.scrollTo({ top: 0, behavior: 'instant' });
    window.parent?.postMessage(JSON.stringify({ type: 'aurezo-scroll-top' }), '*');
  };

  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);

  const toolbar = (
    <div className="v3-gem-toolbar">
      <p className="v3-gem-count" role="status">
        {isLoading ? `Finding ${gemName} gemstones…` : total === 0 ? '' : `${total.toLocaleString()} ${gemName} ${total === 1 ? 'gemstone' : 'gemstones'} · showing ${from}–${to}`}
      </p>
      <div className="v3-gem-controls">
        <label>
          <span>Sort by</span>
          <select value={sort} onChange={e => { setSort(e.target.value as QuoteGemstoneSort); setPage(1); }} aria-label="Sort gemstones by price">
            <option value="low_to_high">Price: low to high</option>
            <option value="high_to_low">Price: high to low</option>
          </select>
        </label>
        <label>
          <span>Per page</span>
          <select value={pageSize} onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }} aria-label="Gemstones per page">
            {pageSizes.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
      </div>
    </div>
  );

  const pagination = pageCount > 1 && (
    <nav className="v3-gem-pagination" aria-label="Gemstone pages">
      <button type="button" data-qe-plain disabled={page <= 1} onClick={() => goPage(page - 1)} aria-label="Previous page"><ChevronLeft size={16} /> Prev</button>
      <div className="v3-gem-pages">
        {pageWindow(page, pageCount).map((p, i) => p === 'gap'
          ? <span key={`gap-${i}`} className="v3-gem-gap" aria-hidden="true">…</span>
          : <button type="button" data-qe-plain key={p} className={p === page ? 'active' : ''} aria-current={p === page ? 'page' : undefined} onClick={() => goPage(p)}>{p}</button>)}
      </div>
      <button type="button" data-qe-plain disabled={page >= pageCount} onClick={() => goPage(page + 1)} aria-label="Next page">Next <ChevronRight size={16} /></button>
    </nav>
  );

  const shell = (children: ReactNode) => <div className="v3-diamond-picker v3-gem-picker"><div className="w-full max-w-xl mx-auto space-y-3 md:space-y-4">{children}</div></div>;

  if (isLoading) return shell(<>{toolbar}<div className="flex items-center justify-center py-10"><DiamondStepSpinner /></div></>);
  if (isError) return shell(
    <div className="text-center py-8 space-y-3">
      <p className="text-sm text-gray-600">We could not load the {gemName.toLowerCase()} gemstones right now.</p>
      <Button type="button" size="sm" onClick={() => refetch()} className="bg-black text-white hover:bg-gray-900 border border-black">Try again</Button>
    </div>,
  );
  if (total === 0) return shell(
    <div className="text-center py-8 space-y-1">
      <p className="text-sm text-gray-600">No {gemName.toLowerCase()} gemstones{size ? ` around ${size}` : ''} are in stock right now.</p>
      <p className="text-xs text-gray-500">Continue with your design and we will source a {gemName.toLowerCase()} for you.</p>
    </div>,
  );

  return shell(
    <>
      {toolbar}
      <div className={cn('space-y-2 v3-diamond-list transition-opacity', isFetching && 'opacity-60 pointer-events-none')} role="listbox" aria-label={`${gemName} gemstones`} aria-busy={isFetching}>
        {stones.map(g => {
          const key = g.pool_id;
          const isSelected = sameStone(selected, g);
          const showImage = !!g.image && !brokenImages.has(key);
          const title = [
            g.carats !== null && Number.isFinite(g.carats) ? `${Number(g.carats.toFixed(2))} ct` : '',
            titleCase(g.color),
            gemstoneDisplayName({ gemKey: g.gem_key, gemType: g.gem_type }),
          ].filter(Boolean).join(' ');
          const subtitle = [titleCase(g.shape), titleCase(g.cut)].filter(Boolean).join(' · ');
          return (
            <div key={key} className={cn('bg-white rounded-lg overflow-hidden transition-all', isSelected ? 'ring-2 ring-gray-400 shadow-lg' : 'hover:shadow-md')}>
              <div className="flex items-center gap-2 md:gap-3 px-3 py-2.5 md:px-4 md:py-3">
                <span className={cn('v3-gem-thumb', !showImage && 'v3-gem-missing')} style={{ '--v3-gem-tint': card?.tint ?? '#8a8f98' } as CSSProperties} aria-hidden="true">
                  {showImage && <img src={g.image!} alt="" loading="lazy" onError={() => setBrokenImages(prev => new Set(prev).add(key))} />}
                  <span className="v3-gem-swatch" />
                </span>
                <button
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => onSelect(toSelectedGemstone(g))}
                  className="bg-white flex-1 min-w-0 flex items-center justify-between gap-3 text-left"
                >
                  <span className="min-w-0 flex items-baseline gap-2 flex-wrap text-gray-800">
                    <span className="font-semibold text-sm md:text-base">{title}</span>
                    {subtitle && <span className="text-xs md:text-sm text-gray-600">{subtitle}</span>}
                  </span>
                  <span className="font-bold text-sm md:text-base text-gray-900 shrink-0">{price(g.price)}</span>
                </button>
                <span className={cn('shrink-0 w-5 h-5 rounded-full flex items-center justify-center border-2 border-white', isSelected ? 'bg-gray-800' : 'bg-transparent')} aria-hidden="true">
                  {isSelected && <Check className="w-3 h-3 text-white" />}
                </span>
              </div>
            </div>
          );
        })}
      </div>
      {pagination}
    </>,
  );
}
