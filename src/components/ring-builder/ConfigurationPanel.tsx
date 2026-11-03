import { useEffect, useMemo, useRef, useState } from 'react';
import { StepNavigation } from './StepNavigation';
import { ActionButtons } from './ActionButtons';
import { StyleStep } from './steps/StyleStep';
import { ShankStep } from './steps/ShankStep';
import { MetalStep } from './steps/MetalStep';
import { ShapeStep } from './steps/ShapeStep';
import { CaratStep } from './steps/CaratStep';
import { StoneStep } from './steps/StoneStep';
import { EngravingStep } from './steps/EngravingStep';
import { DetailsStep } from './steps/DetailsStep';
import { EstimateSummaryStep } from './steps/EstimateSummaryStep';
import { ExpertTip, STEP_TIPS } from './ExpertTip';
import { CaratViewerDialog, CaratViewerPanel } from './CaratViewerDialog';
import { StepHeader } from './steps/StepHeader';
import { usesInlineCaratSlider } from '@/lib/ring-os-inline-carat';
import { useIsMobile } from '@/hooks/use-mobile';
import { RingStyle, RingShank, RingMetal, RingShape, CaratRange, Stone, StyleOption, ShankOption, MetalOption, ShapeOption } from '@/types/ring-builder';
import { ClientCaratOption } from '@/hooks/useClientCaratOptions';
import { ClientDiamondPreset } from '@/hooks/useClientDiamondPresets';
import { isAutoAdvanceStep, normalizeStepOrder, RING_STEP_LABELS, RingStepKey } from '@/lib/ring-step-order';
import { useAdaptiveViewerHeight } from '@/hooks/useAdaptiveViewerHeight';
import { usesRingOsCurrency } from '@/lib/ring-os-currency';

interface ConfigurationPanelProps {
  clientId?: string | null;
  ringConfig: ReturnType<typeof import('@/hooks/useRingConfiguration')['useRingConfiguration']>;
  onBookAppointment: () => void;
  onAIAssistant: () => void;
  onCompare: () => void;
  onSaveDesign: () => void;
  onAddToCart: () => void;
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
  /** Client setting: selecting an option jumps to the next step. */
  clickToContinue?: boolean;
}

export const ConfigurationPanel = ({ 
  clientId,
  ringConfig, 
  onBookAppointment,
  onAIAssistant,
  onCompare,
  onSaveDesign,
  onAddToCart,
  currency = 'USD',
  showAIAssistant = true,
  showComparison = true,
  showSaveDesign = true,
  catalogOptions,
  pricingMode,
  depositAmount = 0,
  stepOrder,
  clickToContinue = true,
}: ConfigurationPanelProps) => {
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
    canAdvanceStep,
    goToNextStep,
    goToStep,
  } = ringConfig;

  const currentStepRef = useRef(currentStep);
  const [caratViewerOpen, setCaratViewerOpen] = useState(false);
  const [caratViewerInitialValue, setCaratViewerInitialValue] = useState(0.5);
  // Mobile: the image viewer shrinks when this step's options need the room.
  const scrollRef = useRef<HTMLDivElement>(null);
  const stepContentRef = useRef<HTMLDivElement>(null);
  useAdaptiveViewerHeight(scrollRef, stepContentRef);

  // Sandbox mobile: the carat image takes over the ring viewer area while the
  // Carat step is open; once a size is chosen the carousel comes back.
  const isMobile = useIsMobile();
  const [viewerEl, setViewerEl] = useState<HTMLElement | null>(null);
  const [mobileCaratDone, setMobileCaratDone] = useState(false);
  useEffect(() => {
    const root = scrollRef.current?.closest<HTMLElement>('#jewlx-embed-root');
    setViewerEl(root?.querySelector<HTMLElement>('[data-adaptive-viewer]') ?? null);
  }, []);

  const isEstimates = pricingMode === 'estimates';

  // Build the ordered key list. The synthetic "estimate" step is appended
  // when pricing mode is estimates and is never reorderable.
  const orderedKeys = useMemo<(RingStepKey | 'estimate')[]>(() => {
    const base = normalizeStepOrder(stepOrder);
    return isEstimates ? [...base, 'estimate' as const] : base;
  }, [stepOrder, isEstimates]);

  const lastStepIndex = orderedKeys.length - 1;
  const currentKey = orderedKeys[currentStep] ?? 'style';

  const stepLabels = useMemo(
    () => orderedKeys.map((k) => (k === 'estimate' ? 'ESTIMATE' : RING_STEP_LABELS[k])),
    [orderedKeys]
  );

  useEffect(() => {
    if (currentKey !== 'carat') setMobileCaratDone(false);
  }, [currentKey]);

  useEffect(() => {
    currentStepRef.current = currentStep;
  }, [currentStep]);

  const noDiamondsForShape =
    (Array.isArray(catalogOptions?.availableCaratBuckets) && catalogOptions.availableCaratBuckets.length === 0) ||
    (Array.isArray(catalogOptions?.caratOptions) && catalogOptions.caratOptions.length === 0);

  // Key-based completion check (independent of position).
  const isKeyComplete = (key: RingStepKey | 'estimate'): boolean => {
    switch (key) {
      case 'style': return configuration.style !== null;
      case 'shank': return configuration.shank !== null;
      case 'metal': return configuration.metal !== null;
      case 'shape': return configuration.shape !== null;
      case 'carat': return configuration.caratRange !== null || noDiamondsForShape;
      case 'stone': return configuration.stone !== null || noDiamondsForShape;
      case 'engraving': return true; // optional
      case 'details': return true;   // optional
      case 'estimate': return true;
    }
  };

  const canGoNext = isKeyComplete(currentKey);

  const handleViewCarat = (caratValue: number) => {
    setCaratViewerInitialValue(caratValue);
    setCaratViewerOpen(true);
  };

  const productTitle = useMemo(() => {
    const parts: string[] = [];
    if (configuration.style) parts.push(toTitleCase(configuration.style));
    if (configuration.shank) parts.push(toTitleCase(configuration.shank));
    if (configuration.metal) parts.push(toTitleCase(configuration.metal));
    if (configuration.shape) parts.push(toTitleCase(configuration.shape));
    return parts.filter(Boolean).join(' ') || 'Custom Ring';
  }, [configuration.metal, configuration.shape, configuration.shank, configuration.style]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      const isTyping = tag === 'input' || tag === 'textarea' || target?.isContentEditable;
      if (isTyping) return;

      if (e.key === 'ArrowUp') {
        if (currentStepRef.current > 0) {
          e.preventDefault();
          goToStep(currentStepRef.current - 1);
        }
      }

      if (e.key === 'ArrowDown') {
        if (currentStepRef.current < lastStepIndex && isKeyComplete(orderedKeys[currentStepRef.current])) {
          e.preventDefault();
          goToStep(currentStepRef.current + 1);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [goToStep, lastStepIndex, orderedKeys, configuration, noDiamondsForShape]);

  // Click-to-Continue: after a pick-one step gets a selection, jump ahead.
  const advanceAfterSelect = () => {
    if (!clickToContinue) return;
    if (currentStep < lastStepIndex) goToStep(currentStep + 1);
  };

  const handleStyleSelect = (style: RingStyle) => { updateStyle(style); advanceAfterSelect(); };
  const handleShankSelect = (shank: RingShank) => { updateShank(shank); advanceAfterSelect(); };
  const handleMetalSelect = (metal: RingMetal) => { updateMetal(metal); advanceAfterSelect(); };
  const handleShapeSelect = (shape: RingShape) => { updateShape(shape); advanceAfterSelect(); };
  const handleCaratSelect = (caratRange: CaratRange) => { updateCaratRange(caratRange); advanceAfterSelect(); };
  // Stone: Natural/Lab only opens the diamond list; advance on the diamond pick.
  const handleStoneSelect = (stone: Stone) => updateStone(stone);
  const handleSizeSelect = (size: string) => updateSize(size);

  const completedSteps = useMemo(
    () => orderedKeys.map((k) => isKeyComplete(k)),
    [orderedKeys, configuration, noDiamondsForShape]
  );

  const renderStep = () => {
    switch (currentKey) {
      case 'style':
        return <StyleStep selected={configuration.style} onSelect={handleStyleSelect} options={catalogOptions?.styles} />;
      case 'shank':
        return <ShankStep selected={configuration.shank} onSelect={handleShankSelect} options={catalogOptions?.shanks} />;
      case 'metal':
        return <MetalStep selected={configuration.metal} onSelect={handleMetalSelect} options={catalogOptions?.metals} currency={ringOsStepCurrency} />;
      case 'shape':
        return <ShapeStep selected={configuration.shape} onSelect={handleShapeSelect} options={catalogOptions?.shapes} />;
      case 'carat':
      {
        const caratStep = <CaratStep selected={configuration.caratRange} onSelect={handleCaratSelect} caratOptions={catalogOptions?.caratOptions || []} availableBuckets={catalogOptions?.availableCaratBuckets} onViewCarat={handleViewCarat} selectedShape={configuration.shape} />;
        if (!usesInlineCaratSlider(clientId)) return caratStep;
        // Mobile: image over the ring viewer, slider + picks in this panel.
        if (isMobile) {
          if (!viewerEl || mobileCaratDone) return caratStep;
          return (
            <CaratViewerPanel
              caratOptions={catalogOptions?.caratOptions || []}
              availableCaratBuckets={catalogOptions?.availableCaratBuckets}
              initialCaratValue={configuration.caratRange ?? 0.5}
              onSelectCarat={(v) => { setMobileCaratDone(true); handleCaratSelect(v as any); }}
              configuration={configuration}
              inline
              showQuickPicks
              imagePortalTarget={viewerEl}
            />
          );
        }
        // Desktop: image + slider + quick picks inline.
        return (
          <>
            <div className="px-4 pt-1 pb-2">
              <StepHeader description="Choose the size that matches your vision" />
              <CaratViewerPanel
                caratOptions={catalogOptions?.caratOptions || []}
                availableCaratBuckets={catalogOptions?.availableCaratBuckets}
                initialCaratValue={configuration.caratRange ?? 0.5}
                onSelectCarat={(v) => handleCaratSelect(v as any)}
                configuration={configuration}
                inline
                showQuickPicks
              />
            </div>
          </>
        );
      }
      case 'stone':
        return (
          <StoneStep
            selected={configuration.stone}
            onSelect={handleStoneSelect}
            onDiamondPick={advanceAfterSelect}
            selectedShape={configuration.shape}
            selectedCaratRange={configuration.caratRange}
            diamondPresets={catalogOptions?.diamondPresets}
            clientId={clientId}
            currency={ringOsStepCurrency}
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
            onSizeSelect={handleSizeSelect}
          />
        );
      case 'details':
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

  const handleGoBack = () => {
    if (currentStep > 0) goToStep(currentStep - 1);
  };

  const handleStepChange = (step: number) => {
    if (step < 0 || step > lastStepIndex) return;
    goToStep(step);
  };

  const stepCard = (
    <div ref={stepContentRef} className="mx-auto w-full max-w-[520px] px-2 md:px-4 pt-0 md:pt-4">
      <div className="bg-card/40 backdrop-blur-xl animate-fade-in">
        {renderStep()}
      </div>
    </div>
  );

  return (
    <div className="flex flex-col h-full bg-background overflow-hidden">
      <div className="flex-shrink-0">
        <StepNavigation
          currentStep={currentStep}
          onStepChange={handleStepChange}
          completedSteps={completedSteps}
          onGoBack={handleGoBack}
          canGoNext={canGoNext}
          stepLabels={stepLabels}
        />
      </div>

      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto scrollbar-hide overscroll-contain">
        {stepCard}
      </div>

      <div className="flex-shrink-0">
        <ActionButtons
          price={calculatePrice()}
          currency={currency}
          productTitle={productTitle}
          onNext={() => {
            if (currentStep < lastStepIndex) goToStep(currentStep + 1);
          }}
          onBookAppointment={onBookAppointment}
          onAIAssistant={onAIAssistant}
          onCompare={onCompare}
          onSaveDesign={onSaveDesign}
          onAddToCart={onAddToCart}
          canAdvance={canGoNext}
          isLastStep={currentStep === lastStepIndex}
          showAIAssistant={showAIAssistant}
          showComparison={showComparison}
          showSaveDesign={showSaveDesign}
          pricingMode={pricingMode}
          depositAmount={depositAmount}
          clickToContinue={clickToContinue}
          autoAdvanceStep={isAutoAdvanceStep(currentKey)}
        />
      </div>
      <CaratViewerDialog
        open={caratViewerOpen}
        onOpenChange={setCaratViewerOpen}
        caratOptions={catalogOptions?.caratOptions || []}
        availableCaratBuckets={catalogOptions?.availableCaratBuckets}
        initialCaratValue={caratViewerInitialValue}
        onSelectCarat={(v) => handleCaratSelect(v as any)}
        configuration={configuration}
      />
    </div>
  );
};

const toTitleCase = (value: string) =>
  value
    .split('-')
    .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(' ');
