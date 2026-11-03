import { createPortal } from 'react-dom';
import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { ClientCaratOption } from '@/hooks/useClientCaratOptions';
import { supabase } from '@/integrations/supabase/client';
import { RingConfiguration } from '@/types/ring-builder';
import { useCaratSizeImages } from '@/hooks/useCaratSizeImages';
import { preloadImage } from '@/lib/image-preload';
import { fallbackToPngOnError } from '@/lib/webp-image-fallback';
import { usePreloadedImage } from '@/hooks/usePreloadedImage';
import { useWidgetTheme } from '@/contexts/WidgetThemeContext';
import {
  buildStandardCaratStops,
  buildTwentyFourKCaratStops,
  findNearestCaratStopIndex,
  type RingCaratSliderStop,
} from '@/lib/ring-carat-slider';

interface CaratViewerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  caratOptions: ClientCaratOption[];
  initialCaratValue: number;
  onSelectCarat: (caratValue: number) => void;
  configuration?: RingConfiguration;
  availableCaratBuckets?: number[];
}

interface CaratViewerPanelProps extends Omit<CaratViewerDialogProps, 'open' | 'onOpenChange'> {
  active?: boolean;
  inline?: boolean;
  /** Whole/half-carat chips under the slider (inline Sandbox carat step). */
  showQuickPicks?: boolean;
  /** Mobile: render the image into this element (the ring viewer) instead of inline. */
  imagePortalTarget?: HTMLElement | null;
}

type CaratImageKey =
  | 'carot_image_0_filename'
  | 'carot_image_1_filename'
  | 'carot_image_2_filename'
  | 'carot_image_3_filename'
  | 'carot_image_4_filename'
  | 'carot_image_5_filename'
  | 'carot_image_6_filename'
  | 'carot_image_7_filename';

interface MasterDbCaratData {
  carotimages_folder_path: string | null;
  carot_image_0_filename: string | null;
  carot_image_1_filename: string | null;
  carot_image_2_filename: string | null;
  carot_image_3_filename: string | null;
  carot_image_4_filename: string | null;
  carot_image_5_filename: string | null;
  carot_image_6_filename: string | null;
  carot_image_7_filename: string | null;
}

// Ranges from 4.50 ct up have no legacy per-combination image column; their
// images come from useCaratSizeImages only.
const CARAT_RANGES: ReadonlyArray<{ value: number; label: string; imageKey?: CaratImageKey }> = [
  { value: 0.5, label: '0.50 - 0.99', imageKey: 'carot_image_0_filename' },
  { value: 1, label: '1.00 - 1.49', imageKey: 'carot_image_1_filename' },
  { value: 1.5, label: '1.50 - 1.99', imageKey: 'carot_image_2_filename' },
  { value: 2, label: '2.00 - 2.49', imageKey: 'carot_image_3_filename' },
  { value: 2.5, label: '2.50 - 2.99', imageKey: 'carot_image_4_filename' },
  { value: 3, label: '3.00 - 3.49', imageKey: 'carot_image_5_filename' },
  { value: 3.5, label: '3.50 - 3.99', imageKey: 'carot_image_6_filename' },
  { value: 4, label: '4.00 - 4.49', imageKey: 'carot_image_7_filename' },
  { value: 4.5, label: '4.50 - 4.99' },
  { value: 5, label: '5.00 - 5.49' },
  { value: 5.5, label: '5.50 - 5.99' },
  { value: 6, label: '6.00 - 6.49' },
  { value: 6.5, label: '6.50 - 6.99' },
  { value: 7, label: '7.00 - 7.49' },
  { value: 7.5, label: '7.50 - 7.99' },
  { value: 8, label: '8.00 - 8.49' },
] as const;

const FALLBACK_IMAGES: string[] = [
  '/images/carat-views/0.5-0.99ct_view.png',
  '/images/carat-views/1.00-1.49ct_view.png',
  '/images/carat-views/1.50-1.99ct_view.png',
  '/images/carat-views/2.00-2.49ct_view.png',
  '/images/carat-views/2.50-2.99ct_view.png',
  '/images/carat-views/3.00-3.49ct_view.png',
  '/images/carat-views/3.50-3.99ct_view.png',
  '/images/carat-views/4.00-4.49ct_view.png',
];

const getColorFamilyFromMetal = (metal: string | null | undefined): string | null => {
  if (!metal) return null;
  const metalLower = metal.toLowerCase();
  if (metalLower.includes('yellow')) return 'yellow';
  if (metalLower.includes('rose') || metalLower.includes('pink')) return 'rose';
  if (metalLower.includes('white') || metalLower.includes('platinum')) return 'white';
  if (metalLower.includes('gold')) return 'yellow';
  return null;
};

const buildCombinationId = (config: RingConfiguration): string | null => {
  if (!config.style || !config.shank || !config.shape) return null;
  const colorFamily = getColorFamilyFromMetal(config.metal);
  if (!colorFamily) return null;
  return `${config.style}-${config.shank}-${colorFamily}-${config.shape}`.toLowerCase();
};

/** Accessible segmented slider; dense quarter stops keep only major ticks visible. */
const SegmentedSlider = ({
  value,
  onChange,
  segments,
}: {
  value: number;
  onChange: (index: number) => void;
  segments: ReadonlyArray<RingCaratSliderStop>;
}) => {
  const count = segments.length;

  if (count < 2) return null;

  return (
    <div className="w-full px-2 py-1">
      <div className="relative h-10 flex items-center">
        <Slider
          thumbAriaLabel="Carat size"
          min={0}
          max={count - 1}
          step={1}
          value={[value]}
          onValueChange={(next) => onChange(next[0] ?? 0)}
          className="z-10 [&_[role=slider]]:border-[hsl(var(--carat-slider-accent))] [&_[role=slider]]:focus-visible:ring-[hsl(var(--carat-slider-accent))] [&_[role=slider]]:bg-background [&>span>span]:bg-[hsl(var(--carat-slider-accent))]"
        />

        {segments.map((segment, idx) => {
          const leftPct = (idx / (count - 1)) * 100;
          const isFilled = idx <= value;
          const showTick = count <= 16 || segment.value * 2 === Math.round(segment.value * 2);
          if (!showTick || idx === value) return null;

          return (
            <div
              key={segment.value}
              aria-hidden="true"
              className={`absolute z-20 h-1.5 w-1.5 -translate-x-1/2 rounded-full pointer-events-none ${
                isFilled ? 'bg-[hsl(var(--carat-slider-accent))]' : 'bg-muted-foreground/40'
              }`}
              style={{ left: `${leftPct}%`, transform: 'translateX(-50%)' }}
            />
          );
        })}
      </div>

      <div className="flex justify-between mt-1">
        <span className="text-xs text-muted-foreground">{segments[0]?.label}</span>
        <span className="text-xs text-muted-foreground">{segments[count - 1]?.label}</span>
      </div>
    </div>
  );
};

export const CaratViewerPanel = ({
  caratOptions,
  initialCaratValue,
  onSelectCarat,
  configuration,
  availableCaratBuckets,
  active = true,
  inline = false,
  showQuickPicks = false,
  imagePortalTarget = null,
}: CaratViewerPanelProps) => {
  const { theme, styleOverrides } = useWidgetTheme();
  const sliderStops = useMemo(
    () => theme === 'twentyfourk'
      ? buildTwentyFourKCaratStops()
      : buildStandardCaratStops(availableCaratBuckets),
    [availableCaratBuckets, theme],
  );
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [masterDbData, setMasterDbData] = useState<MasterDbCaratData | null>(null);
  const [loading, setLoading] = useState(false);
  const { getCaratImage, isLoading: caratImageRowsLoading } = useCaratSizeImages();

  useEffect(() => {
    if (!active) return;
    setSelectedIndex(findNearestCaratStopIndex(sliderStops, initialCaratValue));
  }, [active, initialCaratValue, sliderStops]);

  useEffect(() => {
    if (!active || !configuration) return;
    const combinationId = buildCombinationId(configuration);
    if (!combinationId) return;

    const fetchCaratImages = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('my_master_db_data')
          .select('carotimages_folder_path, carot_image_0_filename, carot_image_1_filename, carot_image_2_filename, carot_image_3_filename, carot_image_4_filename, carot_image_5_filename, carot_image_6_filename, carot_image_7_filename')
          .eq('combination_id', combinationId)
          .maybeSingle();

        if (error) {
          console.error('Error fetching carat images:', error);
          setMasterDbData(null);
        } else {
          setMasterDbData(data);
        }
      } catch (err) {
        console.error('Unexpected error fetching carat images:', err);
        setMasterDbData(null);
      } finally {
        setLoading(false);
      }
    };

    fetchCaratImages();
  }, [active, configuration]);

  const currentStop = sliderStops[selectedIndex] ?? sliderStops[0];

  /** Resolve image URL for a given range index */
  const resolveImageForIndex = useCallback(
    (bucketValue: number): string | null => {
      const rangeIndex = CARAT_RANGES.findIndex((candidate) => candidate.value === bucketValue);
      const range = CARAT_RANGES[rangeIndex];
      if (!range) return null;

      if (configuration?.shape) {
        const url = getCaratImage(configuration.shape, range.value);
        if (url) return url;
      }

      if (masterDbData && range.imageKey) {
        const filename = masterDbData[range.imageKey];
        const folderPath = masterDbData.carotimages_folder_path;
        if (filename && folderPath) {
          let cleanPath = folderPath.replace(/^public\//, '');
          if (!cleanPath.startsWith('/')) cleanPath = `/${cleanPath}`;
          if (!cleanPath.endsWith('/')) cleanPath = `${cleanPath}/`;
          if (!cleanPath.startsWith('/images')) cleanPath = `/images${cleanPath}`;
          return `${cleanPath}${filename}`;
        }
      }

      if (caratOptions.length && range.imageKey) {
        const optionWithImage = caratOptions.find((opt) => {
          const oldImageKey = range.imageKey.replace('carot_', '') as string;
          const filename = (opt as any)[oldImageKey] as string | null | undefined;
          return !!filename;
        });
        if (optionWithImage) {
          const oldImageKey = range.imageKey.replace('carot_', '') as string;
          const filename = (optionWithImage as any)[oldImageKey] as string | null;
          const basePath = (optionWithImage as any).images_filepath as string | null;
          if (filename && basePath) {
            let cleanPath = basePath.replace(/^public\//, '/');
            if (!cleanPath.startsWith('/')) cleanPath = `/${cleanPath}`;
            if (!cleanPath.endsWith('/')) cleanPath = `${cleanPath}/`;
            return `${cleanPath}${filename}`;
          }
        }
      }

      return FALLBACK_IMAGES[rangeIndex] ?? null;
    },
    [getCaratImage, configuration?.shape, masterDbData, caratOptions]
  );

  const imageSrc = useMemo(
    () => currentStop ? resolveImageForIndex(currentStop.bucketValue) : null,
    [currentStop, resolveImageForIndex],
  );
  const {
    displayedSrc,
    isLoading: imageLoading,
    error: imageError,
  } = usePreloadedImage(imageSrc);

  // Preload ALL carat images when dialog opens so sliding is instant
  useEffect(() => {
    if (!active) return;
    const imageBuckets = Array.from(new Set(sliderStops.map((stop) => stop.bucketValue)));
    imageBuckets.forEach((bucketValue) => {
      const url = resolveImageForIndex(bucketValue);
      if (url) preloadImage(url).catch(() => undefined);
    });
  }, [active, resolveImageForIndex, sliderStops]);

  const handleSelectCarat = () => {
    if (!currentStop) return;
    onSelectCarat(currentStop.value);
  };

  if (sliderStops.length === 0) return null;

  const isTwentyFourK = theme === 'twentyfourk';

  // 24k: the carat window sits on the light options panel, so it must NOT
  // re-apply the dark theme tokens. Drop the client style overrides entirely
  // (inline vars would beat the CSS light scope) and keep only the gold
  // slider accent; pin --primary-foreground to black so the gold SELECT
  // button keeps dark text on the light surface.
  const panelStyle = (isTwentyFourK
    ? ({
        '--carat-slider-accent': 'var(--accent-gold)',
        '--primary-foreground': '0 0% 0%',
      } as Record<string, string>)
    : { ...styleOverrides, '--carat-slider-accent': 'var(--client-accent, var(--primary))' }) as CSSProperties;

  return (
    <div
      data-theme={theme}
      style={panelStyle}
      className={`flex flex-col bg-background text-foreground ${inline ? 'w-full max-w-xl mx-auto' : ''} ${isTwentyFourK ? 'twentyfourk-light-panel' : ''}`}
    >
          {/* Image Display — 24k: white card surface so white hand photos
              blend seamlessly with the light panel (no dark frame). */}
          {imagePortalTarget ? createPortal(
            <div className="absolute inset-0 z-20 flex items-center justify-center overflow-hidden bg-white md:hidden">
              {(loading || caratImageRowsLoading || imageLoading) && !displayedSrc && (
                <div className="carat-img-skeleton absolute inset-0" aria-label="Loading carat size image" role="status" />
              )}
              {displayedSrc ? (
                <img
                  src={displayedSrc}
                  alt={`Carat size ${currentStop.label} reference image`}
                  className={`w-full h-full object-contain transition-opacity duration-200 ${imageLoading ? 'opacity-70' : 'opacity-100'}`}
                  onError={fallbackToPngOnError}
                />
              ) : imageError || (!loading && !caratImageRowsLoading && !imageSrc) ? (
                <div className="text-sm text-neutral-500">No image available</div>
              ) : null}
            </div>,
            imagePortalTarget,
          ) : (
            <div className={`relative w-full flex items-center justify-center overflow-hidden ${isTwentyFourK ? 'bg-card' : 'bg-muted'} ${inline ? (showQuickPicks ? 'h-[min(70vh,640px)]' : 'h-[min(42vh,360px)]') : 'aspect-square'}`}>
              {(loading || caratImageRowsLoading || imageLoading) && !displayedSrc && (
                <div className="carat-img-skeleton absolute inset-0" aria-label="Loading carat size image" role="status" />
              )}
              {displayedSrc ? (
                <img
                  src={displayedSrc}
                  alt={`Carat size ${currentStop.label} reference image`}
                  className={`w-full h-full ${showQuickPicks ? 'object-cover' : 'object-contain'} transition-opacity duration-200 ${imageLoading ? 'opacity-70' : 'opacity-100'}`}
                  onError={fallbackToPngOnError}
                />
              ) : imageError || (!loading && !caratImageRowsLoading && !imageSrc) ? (
                <div className="text-muted-foreground text-sm">No image available</div>
              ) : null}
              {imageLoading && displayedSrc && (
                <div className="carat-img-loading-veil absolute inset-0 pointer-events-none" aria-label="Loading next carat size image" role="status" />
              )}
            </div>
          )}

          {/* Slider Section */}
          <div className={`${inline ? (showQuickPicks ? 'px-2 pt-1 pb-1 space-y-1.5' : 'px-2 pt-4 pb-2 space-y-4') : 'p-6 space-y-4'}`}>
            <SegmentedSlider
              value={selectedIndex}
              onChange={setSelectedIndex}
              segments={sliderStops}
            />

            <div className="text-center text-lg font-medium text-foreground">{currentStop.label}</div>

            {showQuickPicks && (
              <div className="grid grid-cols-5 gap-2">
                {sliderStops.map((stop, idx) => {
                  if (stop.value * 2 !== Math.round(stop.value * 2)) return null;
                  const isActive = idx === selectedIndex;
                  return (
                    <button
                      key={stop.value}
                      type="button"
                      onClick={() => setSelectedIndex(idx)}
                      className={`rounded-md border px-1 py-1 text-xs transition-colors ${
                        isActive
                          ? 'border-[hsl(var(--carat-slider-accent))] bg-[hsl(var(--carat-slider-accent)/0.12)] text-foreground'
                          : 'border-border text-muted-foreground hover:border-[hsl(var(--carat-slider-accent))]'
                      }`}
                    >
                      {stop.value.toFixed(2)} ct
                    </button>
                  );
                })}
              </div>
            )}

            <Button
              onClick={handleSelectCarat}
              className={`w-full ${showQuickPicks ? 'py-4' : 'py-6'} text-base font-semibold bg-[hsl(var(--carat-slider-accent))] text-primary-foreground hover:bg-[hsl(var(--carat-slider-accent)/0.88)] focus-visible:ring-[hsl(var(--carat-slider-accent))]`}
            >
              SELECT THIS CARAT SIZE
            </Button>
          </div>
    </div>
  );
};

export const CaratViewerDialog = ({
  open,
  onOpenChange,
  ...panelProps
}: CaratViewerDialogProps) => {
  const { theme } = useWidgetTheme();
  const isTwentyFourK = theme === 'twentyfourk';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* 24k: the portal renders outside the widget root, so carry the light
          panel scope directly on the dialog shell. */}
      <DialogContent
        data-theme={isTwentyFourK ? 'twentyfourk' : undefined}
        className={`sm:max-w-lg p-0 overflow-hidden bg-background border-border text-foreground ${isTwentyFourK ? 'twentyfourk-light-panel' : ''}`}
      >
        <CaratViewerPanel
          {...panelProps}
          active={open}
          onSelectCarat={(value) => {
            panelProps.onSelectCarat(value);
            onOpenChange(false);
          }}
        />
      </DialogContent>
    </Dialog>
  );
};
