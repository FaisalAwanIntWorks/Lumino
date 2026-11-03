import { useMemo, useRef, useState } from 'react';
import { ElegantStepNavigation } from './ElegantStepNavigation';
import { ActionButtons } from './ActionButtons';
import { MetalStep } from './steps/MetalStep';
import { CaratStep } from './steps/CaratStep';
import { StoneStep } from './steps/StoneStep';
import { StyleStep } from './steps/StyleStep';
import { ShankStep } from './steps/ShankStep';
import { CaratViewerDialog } from './CaratViewerDialog';
import { EngravingStep } from './steps/EngravingStep';
import { ShapeStep } from './steps/ShapeStep';
import { DetailsStep } from './steps/DetailsStep';
import { EstimateSummaryStep } from './steps/EstimateSummaryStep';
import { RingStyle, RingShank, RingMetal, RingShape, CaratRange, Stone, StyleOption, ShankOption, MetalOption, ShapeOption } from '@/types/ring-builder';
import { ClientCaratOption } from '@/hooks/useClientCaratOptions';
import { ClientDiamondPreset } from '@/hooks/useClientDiamondPresets';
import { isAutoAdvanceStep, normalizeStepOrder, RING_STEP_LABELS, RING_STEP_TITLES, RingStepKey } from '@/lib/ring-step-order';
import { useAdaptiveViewerHeight } from '@/hooks/useAdaptiveViewerHeight';
import { usesRingOsCurrency } from '@/lib/ring-os-currency';

interface ElegantConfigurationPanelProps {
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
  pricingMode?: string;
  depositAmount?: number;
  stepOrder?: string[];
  /** Client setting: selecting an option jumps to the next step. */
  clickToContinue?: boolean;
  /** Client-scoped tablet layout: keep the windowed step bar until `xl`. */
  tabletFit?: boolean;
  /** Client-scoped: only completed/current steps render sharp in the step bar. */
  completionStepEmphasis?: boolean;
  /** Client-scoped: equal circle spacing regardless of label width. */
  uniformStepSpacing?: boolean;
  catalogOptions?: {
    styles?: StyleOption[];
    shanks?: ShankOption[];
    metals?: MetalOption[];
    shapes?: ShapeOption[];
    caratOptions?: ClientCaratOption[];
    diamondPresets?: ClientDiamondPreset[];
    availableCaratBuckets?: number[];
  };
}

export const ElegantConfigurationPanel = ({
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
  pricingMode,
  depositAmount = 0,
  stepOrder,
  clickToContinue = true,
  tabletFit = false,
  completionStepEmphasis = false,
  uniformStepSpacing = false,
  catalogOptions,
}: ElegantConfigurationPanelProps) => {
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

  const [caratViewerOpen, setCaratViewerOpen] = useState(false);
  const [caratViewerInitialValue, setCaratViewerInitialValue] = useState(0.5);
  // Mobile: the image viewer shrinks when this step's options need the room.
  const scrollRef = useRef<HTMLDivElement>(null);
  const stepContentRef = useRef<HTMLDivElement>(null);
  useAdaptiveViewerHeight(scrollRef, stepContentRef);

  const isEstimates = pricingMode === 'estimates';

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

  const stepTitles = useMemo(
    () => orderedKeys.map((k) => (k === 'estimate' ? 'Your Estimate' : RING_STEP_TITLES[k])),
    [orderedKeys]
  );

  const handleViewCarat = (caratValue: number) => {
    setCaratViewerInitialValue(caratValue);
    setCaratViewerOpen(true);
  };

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
    [orderedKeys, configuration, noDiamondsForShape]
  );

  const productTitle = useMemo(() => {
    const parts: string[] = [];
    if (configuration.style) parts.push(toTitleCase(configuration.style));
    if (configuration.shank) parts.push(toTitleCase(configuration.shank));
    if (configuration.metal) parts.push(toTitleCase(configuration.metal));
    if (configuration.shape) parts.push(toTitleCase(configuration.shape));
    return parts.filter(Boolean).join(' ') || 'Custom Ring';
  }, [configuration.metal, configuration.shape, configuration.shank, configuration.style]);

  const handleStepChange = (step: number) => {
    if (step >= 0 && step <= lastStepIndex) goToStep(step);
  };

  // Click-to-Continue: after a pick-one step gets a selection, jump ahead.
  const advanceAfterSelect = () => {
    if (!clickToContinue) return;
    if (currentStep < lastStepIndex) goToStep(currentStep + 1);
  };

  const renderStep = () => {
    switch (currentKey) {
      case 'style':
        return <StyleStep selected={configuration.style} onSelect={(s) => { updateStyle(s); advanceAfterSelect(); }} options={catalogOptions?.styles} />;
      case 'shank':
        return <ShankStep selected={configuration.shank} onSelect={(s) => { updateShank(s); advanceAfterSelect(); }} options={catalogOptions?.shanks} />;
      case 'metal':
        return <MetalStep selected={configuration.metal} onSelect={(m) => { updateMetal(m); advanceAfterSelect(); }} options={catalogOptions?.metals} currency={ringOsStepCurrency} />;
      case 'shape':
        return <ShapeStep selected={configuration.shape} onSelect={(s) => { updateShape(s); advanceAfterSelect(); }} options={catalogOptions?.shapes} />;
      case 'carat':
        return <CaratStep selected={configuration.caratRange} onSelect={(c) => { updateCaratRange(c); advanceAfterSelect(); }} caratOptions={catalogOptions?.caratOptions || []} availableBuckets={catalogOptions?.availableCaratBuckets} onViewCarat={handleViewCarat} selectedShape={configuration.shape} />;
      case 'stone':
        return (
          <StoneStep
            selected={configuration.stone}
            onSelect={updateStone}
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
            onSizeSelect={updateSize}
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

  const canGoNext = isKeyComplete(currentKey);

  return (
    <div className="flex flex-col h-full bg-background overflow-hidden">
      <div className="flex-shrink-0">
        <ElegantStepNavigation
          currentStep={currentStep}
          onStepChange={handleStepChange}
          completedSteps={completedSteps}
          stepLabels={stepLabels}
          tabletFit={tabletFit}
          completionStepEmphasis={completionStepEmphasis}
          uniformStepSpacing={uniformStepSpacing}
        />
      </div>

      <div className="flex-shrink-0 px-4 pt-1 md:px-6 md:pt-3">
        <h2 className="text-lg md:text-xl font-serif text-foreground" style={{ fontFamily: "'Cormorant Garamond', serif" }}>
          {stepTitles[currentStep] || ''}
        </h2>
      </div>

      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto scrollbar-hide overscroll-contain">
        <div ref={stepContentRef} className="mx-auto w-full max-w-[520px] px-2 md:px-4">
          {renderStep()}
        </div>
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
          currentStep={currentStep}
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
        onSelectCarat={(v) => updateCaratRange(v as any)}
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
