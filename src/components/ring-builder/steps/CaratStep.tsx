import { useMemo } from 'react';
import { CaratRange } from '@/types/ring-builder';
import { StepHeader } from './StepHeader';
import { ClientCaratOption } from '@/hooks/useClientCaratOptions';
import { Eye, Check, Diamond } from 'lucide-react';
import { useWidgetTheme } from '@/contexts/WidgetThemeContext';
import { getDiamondShapeIcon } from '@/lib/diamond-shape-icons';
import { fallbackToPngOnError } from '@/lib/webp-image-fallback';
import { getRingCaratBucket } from '@/lib/ring-carat-slider';
import { Button } from '@/components/ui/button';

interface CaratStepProps {
  selected: CaratRange | null;
  onSelect: (carat: CaratRange) => void;
  caratOptions?: ClientCaratOption[];
  loading?: boolean;
  onViewCarat?: (caratValue: number) => void;
  selectedShape?: string | null;
  /**
   * When provided and non-empty, strictly restricts the carat ranges shown
   * to these bucket starts (e.g. [0.5, 1.5]). Use this so the widget only
   * shows carat ranges that exist in the client's confirmed diamond catalog.
   */
  availableBuckets?: number[];
  twentyFourKMobileSelector?: boolean;
}

const CARAT_RANGES: ReadonlyArray<{ value: number; label: string }> = [
  { value: 0.5, label: '0.50 - 0.99' },
  { value: 1, label: '1.00 - 1.49' },
  { value: 1.5, label: '1.50 - 1.99' },
  { value: 2, label: '2.00 - 2.49' },
  { value: 2.5, label: '2.50 - 2.99' },
  { value: 3, label: '3.00 - 3.49' },
  { value: 3.5, label: '3.50 - 3.99' },
  { value: 4, label: '4.00 - 4.49' },
  { value: 4.5, label: '4.50 - 4.99' },
  { value: 5, label: '5.00 - 5.49' },
  { value: 5.5, label: '5.50 - 5.99' },
  { value: 6, label: '6.00 - 6.49' },
  { value: 6.5, label: '6.50 - 6.99' },
  { value: 7, label: '7.00 - 7.49' },
  { value: 7.5, label: '7.50 - 7.99' },
  { value: 8, label: '8.00 - 8.49' },
] as const;

export const CaratStep = ({ selected, onSelect, caratOptions = [], loading = false, onViewCarat, selectedShape, availableBuckets, twentyFourKMobileSelector = false }: CaratStepProps) => {
  const { theme } = useWidgetTheme();

  const displayRanges = useMemo(() => {
    // Hard UI cap: never show carat ranges at or above 8.50 ct — the carat
    // size images cover buckets up to 8.00 - 8.49 ct only.
    const MAX_BUCKET = 8;

    // Strict catalog-driven filter: if the widget provides bucket data from
    // the client's diamond catalog, show only those buckets. An empty array is
    // also authoritative and must not fall back to default ranges.
    if (Array.isArray(availableBuckets)) {
      const allowed = new Set(
        availableBuckets
          .map((v) => Math.floor(Number(v) * 2) / 2)
          .filter((v) => v <= MAX_BUCKET),
      );
      const ranges: { value: number; label: string }[] = CARAT_RANGES
        .filter((r) => allowed.has(r.value))
        .map((r) => ({ value: r.value, label: r.label }));
      Array.from(allowed)
        .filter((v) => !CARAT_RANGES.some((r) => r.value === v))
        .forEach((v) =>
          ranges.push({
            value: v,
            label: `${v.toFixed(2)} - ${(v + 0.49).toFixed(2)}`,
          }),
        );
      return ranges.sort((a, b) => a.value - b.value);
    }

    if (caratOptions.length > 0) {
      // Bucket each carat option (e.g. 1.80, 1.90, 1.92) into the standard
      // 0.5-wide range (1.50-1.99) so the widget shows one tile per range,
      // not one tile per individual diamond carat.
      const buckets = new Map<number, string>();
      for (const opt of caratOptions) {
        const bucketStart = Math.floor(opt.carat_value * 2) / 2;
        if (bucketStart > MAX_BUCKET) continue;
        if (!buckets.has(bucketStart)) {
          const known = CARAT_RANGES.find(r => r.value === bucketStart);
          buckets.set(
            bucketStart,
            known?.label ?? `${bucketStart.toFixed(2)} - ${(bucketStart + 0.49).toFixed(2)}`,
          );
        }
      }
      return Array.from(buckets.entries())
        .sort(([a], [b]) => a - b)
        .map(([value, label]) => ({ value, label }));
    }
    return CARAT_RANGES.map(r => ({ value: r.value, label: r.label }));
  }, [availableBuckets, caratOptions]);

  if (loading) {
    return (
      <div className="p-4 md:p-6">
        <StepHeader description="Choose the size that matches your vision" />
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent-gold"></div>
        </div>
      </div>
    );
  }

  if (theme === 'twentyfourk' && twentyFourKMobileSelector) {
    return (
      <div className="p-3 space-y-4 md:hidden">
        <StepHeader description="Choose the size that matches your vision" />
        <Button
          type="button"
          variant="outline"
          onClick={() => onViewCarat?.(selected ?? 0.5)}
          className="w-full min-h-14 rounded-none border-border bg-card text-foreground hover:border-accent hover:bg-card"
        >
          <Eye className="h-4 w-4" />
          {selected == null ? 'Choose carat size' : `${selected.toFixed(2)} ct selected`}
        </Button>
      </div>
    );
  }

  // UI Option 4: Elegant Gold
  if (theme === 'elegant') {
    return (
      <div className="p-1 md:p-3">
        <StepHeader description="Choose the size that matches your vision" />
        {/* Mobile: compact 3-col text grid */}
        <div className="grid grid-cols-3 gap-1.5 max-w-xl mx-auto md:hidden">
          {displayRanges.map((range) => {
            const isSelected = selected != null && getRingCaratBucket(selected) === range.value;
            return (
              <div
                key={range.value}
                onClick={() => onSelect(range.value as CaratRange)}
                className={`relative flex flex-col items-center justify-center gap-1 p-2 cursor-pointer rounded-lg bg-card border-2 transition-all duration-200 shadow-sm hover:shadow-md ${
                  isSelected ? 'border-primary shadow-primary/10' : 'border-transparent hover:border-primary/30'
                }`}
              >
                {onViewCarat && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onViewCarat(range.value); }}
                    className="absolute top-1 left-1 p-0.5 rounded-full text-foreground/50 hover:text-primary transition-colors z-10"
                    aria-label="View carat on hand"
                  >
                    <Eye className="w-3.5 h-3.5" />
                  </button>
                )}
                {isSelected && (
                  <div className="absolute top-1 right-1 w-3.5 h-3.5 rounded-full flex items-center justify-center" style={{ background: `linear-gradient(to bottom right, hsl(var(--primary)), hsl(var(--primary-gradient-end, var(--primary))))` }}>
                    <Check className="w-2 h-2 text-primary-foreground" />
                  </div>
                )}
                <span className="text-xs font-medium text-foreground">{range.label} ct</span>
              </div>
            );
          })}
        </div>
        {/* Desktop: original 2-col cards with circles */}
        <div className="hidden md:grid grid-cols-2 gap-2 max-w-xl mx-auto">
          {displayRanges.map((range) => {
            const isSelected = selected != null && getRingCaratBucket(selected) === range.value;
            return (
              <div
                key={range.value}
                onClick={() => onSelect(range.value as CaratRange)}
                className={`relative flex flex-col items-center gap-1 p-2.5 cursor-pointer rounded-lg bg-card border-2 transition-all duration-200 shadow-sm hover:shadow-md ${
                  isSelected ? 'border-primary shadow-primary/10' : 'border-transparent hover:border-primary/30'
                }`}
              >
                {onViewCarat && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onViewCarat(range.value); }}
                    className="absolute top-1.5 left-1.5 p-0.5 rounded-full text-muted-foreground hover:text-primary transition-colors z-10"
                    aria-label="View carat on hand"
                  >
                    <Eye className="w-3.5 h-3.5" />
                  </button>
                )}
                {isSelected && (
                  <div className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full flex items-center justify-center" style={{ background: `linear-gradient(to bottom right, hsl(var(--primary)), hsl(var(--primary-gradient-end, var(--primary))))` }}>
                    <Check className="w-2.5 h-2.5 text-primary-foreground" />
                  </div>
                )}
                {selectedShape && getDiamondShapeIcon(selectedShape) ? (
                  <img src={getDiamondShapeIcon(selectedShape)!} alt={selectedShape} className="w-7 h-7 object-contain opacity-80" onError={fallbackToPngOnError} />
                ) : selectedShape ? (
                  <Diamond className="w-5 h-5 text-primary/60" />
                ) : (
                  <div className="rounded-full bg-primary/20 transition-colors" style={{ width: `${20 + Math.min(range.value, 5) * 6}px`, height: `${20 + Math.min(range.value, 5) * 6}px` }} />
                )}
                <span className="text-xs font-medium text-foreground">{range.label} ct</span>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // UI Option 1: Luxury
  if (theme === 'luxury') {
    return (
      <div className="p-1 md:p-4">
        <StepHeader description="Choose the size that matches your vision" />

        {/* Mobile: 3-column grid */}
        <div className="grid grid-cols-3 gap-1.5 max-w-xl mx-auto md:hidden">
          {displayRanges.map((range) => {
            const isSelected = selected != null && getRingCaratBucket(selected) === range.value;
            return (
              <div
                key={range.value}
                onClick={() => onSelect(range.value as CaratRange)}
                className={`relative flex flex-col items-center justify-center gap-1 p-2 cursor-pointer border transition-all duration-200 ${
                  isSelected ? 'bg-white/[0.06] border-white/30' : 'border-white/15 hover:bg-muted/30'
                }`}
              >
                {onViewCarat && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onViewCarat(range.value); }}
                    className="absolute top-1 left-1 p-0.5 rounded-full text-foreground/50 hover:text-primary transition-colors z-10"
                    aria-label="View carat on hand"
                  >
                    <Eye className="w-3.5 h-3.5" />
                  </button>
                )}
                <span className={`text-[10px] tracking-wide text-center text-foreground ${isSelected ? 'font-bold' : 'font-medium'}`}>
                  {range.label} ct
                </span>
              </div>
            );
          })}
        </div>

        {/* Desktop: Stacked List */}
        <div className="hidden md:block border border-white/15 max-w-xl mx-auto">
          {displayRanges.map((range, index) => {
            const isSelected = selected != null && getRingCaratBucket(selected) === range.value;
            const isLast = index === displayRanges.length - 1;
            return (
              <div
                key={range.value}
                onClick={() => onSelect(range.value as CaratRange)}
                className={`flex items-center gap-3 p-4 cursor-pointer transition-all duration-200 ${
                  !isLast ? 'border-b border-white/15' : ''
                } ${isSelected ? 'bg-white/[0.06]' : 'hover:bg-muted/30'}`}
              >
                {selectedShape && getDiamondShapeIcon(selectedShape) && <img src={getDiamondShapeIcon(selectedShape)!} alt={selectedShape} className="w-6 h-6 object-contain opacity-70 flex-shrink-0" onError={fallbackToPngOnError} />}
                <span className={`flex-1 text-sm tracking-wide text-foreground ${isSelected ? 'font-bold' : 'font-medium'}`}>
                  {range.label} ct
                </span>
                <button 
                  onClick={(e) => { e.stopPropagation(); onViewCarat ? onViewCarat(range.value) : onSelect(range.value as CaratRange); }}
                  className="flex-shrink-0 px-2 py-1 text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
                >
                  <Eye className="w-3 h-3" />
                  View
                </button>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // UI Option 2: Modern (compact on mobile)
  return (
    <div className="p-1 md:p-4">
      <StepHeader description="Choose the size that matches your vision" />
      {/* Mobile: compact 3-col grid */}
      <div className="grid grid-cols-3 gap-1.5 max-w-xl mx-auto md:hidden">
        {displayRanges.map((range) => {
          const isSelected = selected != null && getRingCaratBucket(selected) === range.value;
          return (
            <div
              key={range.value}
              onClick={() => onSelect(range.value as CaratRange)}
              className={`relative flex flex-col items-center justify-center gap-1 p-2 cursor-pointer rounded-lg border transition-all duration-200 ${
                isSelected ? 'border-primary bg-primary/5 shadow-sm' : 'border-border hover:border-primary/50 hover:bg-muted/30'
              }`}
            >
              {onViewCarat && (
                <button
                  onClick={(e) => { e.stopPropagation(); onViewCarat(range.value); }}
                  className="absolute top-1 left-1 p-0.5 rounded-full text-foreground/50 hover:text-primary transition-colors z-10"
                  aria-label="View carat on hand"
                >
                  <Eye className="w-3.5 h-3.5" />
                </button>
              )}
              <span className={`text-xs font-semibold text-center transition-colors ${isSelected ? 'text-primary' : 'text-foreground'}`}>
                {range.label} ct
              </span>
            </div>
          );
        })}
      </div>

      {/* Desktop: 2-col cards */}
      <div className="hidden md:grid grid-cols-2 gap-3 max-w-xl mx-auto">
        {displayRanges.map((range) => {
          const isSelected = selected != null && getRingCaratBucket(selected) === range.value;
          return (
            <div
              key={range.value}
              onClick={() => onSelect(range.value as CaratRange)}
              className={`relative flex flex-col items-center gap-2 p-4 cursor-pointer rounded-lg border transition-all duration-200 ${
                isSelected ? 'border-primary bg-primary/5 shadow-sm' : 'border-border hover:border-primary/50 hover:bg-muted/30'
              }`}
            >
              {onViewCarat && (
                <button
                  onClick={(e) => { e.stopPropagation(); onViewCarat(range.value); }}
                  className="absolute top-2 left-2 p-0.5 rounded-full text-muted-foreground hover:text-primary transition-colors z-10"
                  aria-label="View carat on hand"
                >
                  <Eye className="w-3.5 h-3.5" />
                </button>
              )}
              {selectedShape && getDiamondShapeIcon(selectedShape) ? (
                <img src={getDiamondShapeIcon(selectedShape)!} alt={selectedShape} className={`w-9 h-9 object-contain transition-opacity ${isSelected ? 'opacity-100' : 'opacity-60'}`} onError={fallbackToPngOnError} />
              ) : selectedShape ? (
                <Diamond className={`w-6 h-6 transition-colors ${isSelected ? 'text-primary' : 'text-muted-foreground'}`} />
              ) : (
                <div className={`rounded-full transition-colors ${isSelected ? 'bg-primary' : 'bg-muted'}`} style={{ width: `${24 + Math.min(range.value, 5) * 8}px`, height: `${24 + Math.min(range.value, 5) * 8}px` }} />
              )}
              <span className={`text-sm font-medium text-center transition-colors ${isSelected ? 'text-primary' : 'text-foreground'}`}>{range.label} ct</span>
              {isSelected && (
                <div className="absolute top-2 right-2 w-5 h-5 bg-primary rounded-full flex items-center justify-center">
                  <Check className="w-3 h-3 text-primary-foreground" />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
