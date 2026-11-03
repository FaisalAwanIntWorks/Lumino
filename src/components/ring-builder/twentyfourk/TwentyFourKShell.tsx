// Full-page shell for the 24k Carat Jewelers exclusive Ring OS theme.
//
// Layout:
//   Desktop ≥ md  → left: media viewer (~50%), right: top-tabs + step options
//                    bottom: single full-width bar (title, book, price/next)
//   Mobile        → media stacked on top, config below, bottom bar pinned
//
// All wiring (config state, pricing, validation, add-to-cart, chat, save,
// share, book, fullscreen) reuses the existing hooks/components. This is a
// pure presentational shell.

import { useMemo, useRef, useState, useEffect, type ReactNode } from 'react';
import { ProductViewer } from '../ProductViewer';
import { StyleStep } from '../steps/StyleStep';
import { ShankStep } from '../steps/ShankStep';
import { MetalStep } from '../steps/MetalStep';
import { ShapeStep } from '../steps/ShapeStep';
import { CaratStep } from '../steps/CaratStep';
import { StoneStep } from '../steps/StoneStep';
import { EngravingStep } from '../steps/EngravingStep';
import { DetailsStep } from '../steps/DetailsStep';
import { RingSizeDetailsStep } from '../steps/RingSizeDetailsStep';
import { EstimateSummaryStep } from '../steps/EstimateSummaryStep';
import { CaratViewerDialog, CaratViewerPanel } from '../CaratViewerDialog';
import { TwentyFourKTopTabs } from './TwentyFourKTopTabs';
import { TwentyFourKBottomBar } from './TwentyFourKBottomBar';
import { WidgetThemeProvider } from '@/contexts/WidgetThemeContext';
import { isAutoAdvanceStep, normalizeStepOrder, RingStepKey } from '@/lib/ring-step-order';
import { useAdaptiveViewerHeight } from '@/hooks/useAdaptiveViewerHeight';
import { useCaratSizeImages } from '@/hooks/useCaratSizeImages';
import { buildTwentyFourKCaratStops, getRingCaratBucket } from '@/lib/ring-carat-slider';
import { prioritizeCaratImageUrls, queueRingCaratImagePreload } from '@/lib/ring-carat-image-preload';
import {
  RingStyle,
  RingShank,
  RingMetal,
  RingShape,
  CaratRange,
  Stone,
  StyleOption,
  ShankOption,
  MetalOption,
  ShapeOption,
} from '@/types/ring-builder';
import type { ClientCaratOption } from '@/hooks/useClientCaratOptions';
import type { ClientDiamondPreset } from '@/hooks/useClientDiamondPresets';
import { usesRingOsCurrency } from '@/lib/ring-os-currency';

interface TwentyFourKShellProps {
  clientId?: string | null;
  ringConfig: ReturnType<typeof import('@/hooks/useRingConfiguration')['useRingConfiguration']>;
  onBookAppointment: () => void;
  onAddToCart: () => void;
  onSaveDesign: () => void;
  onAIAssistant: () => void;
  onCompare: () => void;
  currency?: string;
  showAIAssistant?: boolean;
  showComparison?: boolean;
  showSaveDesign?: boolean;
  catalogOptions?: {
    styles?: StyleOption[];
    shanks?: ShankOption[];
    metals?: MetalOption[];
    shapes?: ShapeOption[];
    caratOptions?: ClientCaratOption[];
    diamondPresets?: ClientDiamondPreset[];
    availableCaratBuckets?: number[];
  };
  pricingMode?: string;
  depositAmount?: number;
  stepOrder?: string[];
  videoFirst?: boolean;
  /** Client setting: selecting an option jumps to the next step. */
  clickToContinue?: boolean;
  /** Optional node that takes over the right-hand step panel (No-Deposit form). */
  panelOverlay?: ReactNode;
  /** 24k natural path: hide every price in the shell. */
  hidePrices?: boolean;
  /** Final button collects a lead instead of adding to cart. */
  leadCapture?: boolean;
  /** 24k: Final Details step shows Ring Size + details (no band width). */
  ringSizeOnDetails?: boolean;
  /** 24k: hide natural diamond prices on the stone step. */
  hideNaturalPrices?: boolean;
}

const toTitleCase = (value: string) =>
  value
    .split('-')
    .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(' ');

export const TwentyFourKShell = ({
  clientId,
  ringConfig,
  onBookAppointment,
  onAddToCart,
  onSaveDesign,
  catalogOptions,
  pricingMode,
  depositAmount = 0,
  stepOrder,
  currency = 'USD',
  videoFirst,
  clickToContinue = true,
  panelOverlay,
  hidePrices = false,
  leadCapture = false,
  ringSizeOnDetails = false,
  hideNaturalPrices = false,
}: TwentyFourKShellProps) => {
  // Diamond pool prices are USD for everyone except a Sandbox GBP / CAD Ring OS
  // catalogue (stored FX prices), so only that account passes its currency to
  // the Stone / Metal steps; others keep the USD labels they always had.
  const ringOsStepCurrency = usesRingOsCurrency(clientId) ? currency : 'USD';
  const {
    configuration,
    currentStep,
    updateStyle,
    updateShank,
    updateMetal,
    updateShape,
    updateCaratRange,
    updateStone,
    updateEngraving,
    updateSize,
    calculatePrice,
    goToStep,
  } = ringConfig;

  const [caratViewerOpen, setCaratViewerOpen] = useState(false);
  const [caratViewerInitial, setCaratViewerInitial] = useState(0.5);
  const { getCaratImage } = useCaratSizeImages();
  const scrollRef = useRef<HTMLDivElement>(null);
  // Mobile: the image viewer shrinks when this step's options need the room.
  const stepContentRef = useRef<HTMLDivElement>(null);
  useAdaptiveViewerHeight(scrollRef, stepContentRef, { defaultRatio: 0.4, minRatio: 0.28 });

  const isEstimates = pricingMode === 'estimates';

  const orderedKeys = useMemo<(RingStepKey | 'estimate')[]>(() => {
    const base = normalizeStepOrder(stepOrder);
    return isEstimates ? [...base, 'estimate' as const] : base;
  }, [stepOrder, isEstimates]);

  const lastStepIndex = orderedKeys.length - 1;
  const currentKey = orderedKeys[currentStep] ?? 'style';

  const noDiamondsForShape =
    (Array.isArray(catalogOptions?.availableCaratBuckets) && catalogOptions.availableCaratBuckets.length === 0) ||
    (Array.isArray(catalogOptions?.caratOptions) && catalogOptions.caratOptions.length === 0);

  const isKeyComplete = (key: RingStepKey | 'estimate'): boolean => {
    switch (key) {
      case 'style': return configuration.style !== null;
      case 'shank': return configuration.shank !== null;
      case 'metal': return configuration.metal !== null;
      case 'shape': return configuration.shape !== null;
      case 'carat': return configuration.caratRange !== null || noDiamondsForShape;
      case 'stone': return configuration.stone !== null || noDiamondsForShape;
      case 'engraving': return true;
      case 'details': return true;
      case 'estimate': return true;
    }
  };

  const completedSteps = useMemo(
    () => orderedKeys.map((k) => isKeyComplete(k)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [orderedKeys, configuration, noDiamondsForShape],
  );

  // Carat confirmation is owned by the inline/mobile selector. Keeping the
  // bottom action disabled prevents a preloaded carat from skipping Select.
  const canGoNext = currentKey === 'carat' ? false : isKeyComplete(currentKey);

  // Scroll the active step's content back to top whenever the step changes.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  }, [currentStep]);

  // 24k-only: once a shape is known, warm the hand imagery before the user
  // reaches Carat. Quarter stops share the same sixteen half-carat image URLs.
  useEffect(() => {
    if (!configuration.shape) return;
    const buckets = Array.from(new Set(buildTwentyFourKCaratStops().map((stop) => stop.bucketValue)));
    const entries = buckets.map((bucket) => ({
      bucket,
      url: getCaratImage(configuration.shape, bucket),
    }));
    const currentBucket = getRingCaratBucket(configuration.caratRange ?? 0.5);
    queueRingCaratImagePreload(prioritizeCaratImageUrls(entries, currentBucket));
  }, [configuration.shape, configuration.caratRange, getCaratImage]);

  const productTitle = useMemo(() => {
    const parts: string[] = [];
    if (configuration.style) parts.push(toTitleCase(configuration.style));
    if (configuration.shank) parts.push(toTitleCase(configuration.shank));
    if (configuration.metal) parts.push(toTitleCase(configuration.metal));
    if (configuration.shape) parts.push(toTitleCase(configuration.shape));
    return parts.filter(Boolean).join(' ') || 'Custom Ring';
  }, [configuration.style, configuration.shank, configuration.metal, configuration.shape]);

  const handleViewCarat = (caratValue: number) => {
    setCaratViewerInitial(caratValue);
    setCaratViewerOpen(true);
  };

  const handleStepChange = (step: number) => {
    if (step < 0 || step > lastStepIndex) return;
    goToStep(step);
  };

  // Click-to-Continue: after a pick-one step gets a selection, jump ahead.
  const advanceAfterSelect = () => {
    if (!clickToContinue) return;
    if (currentStep < lastStepIndex) goToStep(currentStep + 1);
  };

  const advanceToStone = () => {
    const stoneStep = orderedKeys.indexOf('stone');
    if (stoneStep >= 0) goToStep(stoneStep);
  };

  const confirmCarat = (value: number) => {
    updateCaratRange(value as CaratRange);
    advanceToStone();
  };

  const renderStep = () => {
    switch (currentKey) {
      case 'style':
        return <StyleStep selected={configuration.style} onSelect={(s: RingStyle) => { updateStyle(s); advanceAfterSelect(); }} options={catalogOptions?.styles} />;
      case 'shank':
        return <ShankStep selected={configuration.shank} onSelect={(s: RingShank) => { updateShank(s); advanceAfterSelect(); }} options={catalogOptions?.shanks} />;
      case 'metal':
        return <MetalStep selected={configuration.metal} onSelect={(m: RingMetal) => { updateMetal(m); advanceAfterSelect(); }} options={catalogOptions?.metals} currency={ringOsStepCurrency} />;
      case 'shape':
        return <ShapeStep selected={configuration.shape} onSelect={(s: RingShape) => { updateShape(s); advanceAfterSelect(); }} options={catalogOptions?.shapes} />;
      case 'carat':
        return (
          <>
            <div className="hidden md:block">
              <CaratViewerPanel
                caratOptions={catalogOptions?.caratOptions || []}
                availableCaratBuckets={catalogOptions?.availableCaratBuckets}
                initialCaratValue={configuration.caratRange ?? 0.5}
                onSelectCarat={confirmCarat}
                configuration={configuration}
                inline
              />
            </div>
            <CaratStep
              selected={configuration.caratRange}
              onSelect={updateCaratRange}
              caratOptions={catalogOptions?.caratOptions || []}
              availableBuckets={catalogOptions?.availableCaratBuckets}
              onViewCarat={handleViewCarat}
              selectedShape={configuration.shape}
              twentyFourKMobileSelector
            />
          </>
        );
      case 'stone':
        return (
          <StoneStep
            selected={configuration.stone}
            onSelect={(s: Stone) => updateStone(s)}
            onDiamondPick={advanceAfterSelect}
            selectedShape={configuration.shape}
            selectedCaratRange={configuration.caratRange}
            diamondPresets={catalogOptions?.diamondPresets}
            clientId={clientId}
            currency={ringOsStepCurrency}
            hideNaturalPrices={hideNaturalPrices}
          />
        );
      case 'engraving':
        return (
          <EngravingStep
            enabled={configuration.engraving.enabled}
            text={configuration.engraving.text}
            bandWidth={configuration.engraving.bandWidth}
            otherRequest={configuration.engraving.otherRequest}
            size={configuration.size}
            onUpdate={updateEngraving}
            onSizeSelect={updateSize}
            hideRingSize={ringSizeOnDetails}
          />
        );
      case 'details':
        if (ringSizeOnDetails) {
          return (
            <RingSizeDetailsStep
              size={configuration.size}
              otherRequest={configuration.engraving.otherRequest}
              onSizeSelect={updateSize}
              hidePriceNote={hidePrices}
              onOtherRequestChange={(value) => updateEngraving({
                enabled: configuration.engraving.enabled,
                text: configuration.engraving.text,
                bandWidth: configuration.engraving.bandWidth,
                otherRequest: value,
              })}
            />
          );
        }
        return (
          <DetailsStep
            bandWidth={configuration.engraving.bandWidth}
            otherRequest={configuration.engraving.otherRequest}
            onUpdate={(data) => updateEngraving({
              enabled: configuration.engraving.enabled,
              text: configuration.engraving.text,
              bandWidth: data.bandWidth,
              otherRequest: data.otherRequest,
            })}
          />
        );
      case 'estimate':
        return (
          <EstimateSummaryStep
            estimatedPrice={calculatePrice()}
            depositAmount={depositAmount}
            currency={currency}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div
      className="flex flex-col w-full h-full overflow-hidden"
      style={{ background: '#EEEEEE' }}
    >
      {/* Main split */}
      <div className="flex flex-col md:flex-row flex-1 min-h-0 overflow-hidden">
        {/* Left: media viewer — forced black background (per 24k spec).
            Mobile: flexible share of the viewport (never below 180px, never
            past 46%) so tall step lists keep usable room at any zoom level.
            useAdaptiveViewerHeight shrinks it further for crowded steps. */}
        <div
          data-adaptive-viewer
          className="w-full md:w-1/2 h-[var(--ringos-viewer-h,40svh)] min-h-[180px] max-h-[46%] md:h-full md:min-h-0 md:max-h-none relative overflow-hidden bg-black flex-none transition-[height] duration-300 ease-out md:transition-none"
        >
          <WidgetThemeProvider theme="twentyfourk">
            <ProductViewer
              configuration={configuration}
              calculatePrice={calculatePrice}
              videoFirst={Boolean(videoFirst)}
            />
          </WidgetThemeProvider>
        </div>

        {/* Right: tabs + step content on light surface */}
        <div
          className="twentyfourk-light-panel w-full md:w-1/2 flex-1 min-h-[200px] md:h-full md:min-h-0 flex flex-col overflow-hidden relative bg-background text-foreground"
        >
          {/* Optional panel takeover (No-Deposit request form). Null in every
              other pricing mode, so the normal step flow is untouched. */}
          {panelOverlay && (
            <div className="absolute inset-0 z-30">
              <WidgetThemeProvider theme="twentyfourk">
                {panelOverlay}
              </WidgetThemeProvider>
            </div>
          )}
          <TwentyFourKTopTabs
            orderedKeys={orderedKeys}
            currentStep={currentStep}
            completedSteps={completedSteps}
            onStepChange={handleStepChange}
          />

          <div
            ref={scrollRef}
            className="flex-1 min-h-0 overflow-y-auto scrollbar-hide overscroll-contain px-4 md:px-6 py-3 md:py-4"
          >
            {/* Steps branch on theme === 'twentyfourk' to render the
                horizontal-card layout that matches the reference. */}
            <WidgetThemeProvider theme="twentyfourk">
              <div ref={stepContentRef}>{renderStep()}</div>
            </WidgetThemeProvider>
          </div>
        </div>
      </div>

      {/* Unified bottom bar */}
      <div className="flex-shrink-0">
        <TwentyFourKBottomBar
          productTitle={productTitle}
          price={calculatePrice()}
          currency={currency}
          isLastStep={currentStep === lastStepIndex}
          canAdvance={canGoNext}
          pricingMode={pricingMode}
          depositAmount={depositAmount}
          onNext={() => {
            if (currentStep < lastStepIndex) goToStep(currentStep + 1);
          }}
          onAddToCart={onAddToCart}
          onBookAppointment={onBookAppointment}
          clickToContinue={clickToContinue}
          autoAdvanceStep={isAutoAdvanceStep(currentKey)}
          hidePrices={hidePrices}
          leadCapture={leadCapture}
        />
      </div>

      <CaratViewerDialog
        open={caratViewerOpen}
        onOpenChange={setCaratViewerOpen}
        caratOptions={catalogOptions?.caratOptions || []}
        availableCaratBuckets={catalogOptions?.availableCaratBuckets}
        initialCaratValue={caratViewerInitial}
        onSelectCarat={confirmCarat}
        configuration={configuration}
      />
    </div>
  );
};

