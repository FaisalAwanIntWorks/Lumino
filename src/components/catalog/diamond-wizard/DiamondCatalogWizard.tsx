import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Check } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { DiamondWizardState, WizardStep } from './types';
import { WIZARD_STEPS } from './types';
import { DEFAULT_WIZARD_STATE } from './defaults';
import { validateStep, saveWizardState, loadWizardState, clearWizardState } from './utils';
import { DiamondTypeStep } from './steps/DiamondTypeStep';
import { DiamondShapesStep } from './steps/DiamondShapesStep';
import { DiamondGradingStep } from './steps/DiamondGradingStep';
import { DiamondPricingStep } from './steps/DiamondPricingStep';
import { DiamondProductSettingsStep } from './steps/DiamondProductSettingsStep';
import { DiamondReviewStep } from './steps/DiamondReviewStep';
import { DIAMOND_SHAPES } from './defaults';

interface Props {
  clientId: string;
  availableShapes?: string[];
  onComplete?: () => void;
}

export function DiamondCatalogWizard({ clientId, availableShapes, onComplete }: Props) {
  const [currentStep, setCurrentStep] = useState<WizardStep>(1);
  const [state, setState] = useState<DiamondWizardState>(DEFAULT_WIZARD_STATE);
  const [direction, setDirection] = useState(1); // 1 = forward, -1 = back
  const [isGenerating, setIsGenerating] = useState(false);
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set());

  // Load saved state on mount
  useEffect(() => {
    const saved = loadWizardState(clientId);
    if (saved) {
      setState(saved);
    }
    // Also try loading from DB
    loadConfigFromDB();
  }, [clientId]);

  // Auto-save on every change
  useEffect(() => {
    saveWizardState(state, clientId);
  }, [state, clientId]);

  const loadConfigFromDB = async () => {
    try {
      const { data } = await supabase
        .from('diamond_catalog_config')
        .select('config')
        .eq('client_id', clientId)
        .maybeSingle();
      if (data?.config) {
        const config = data.config as unknown as DiamondWizardState;
        if (config.diamondType) {
          setState(config);
        }
      }
    } catch {}
  };

  const updateState = useCallback((newState: DiamondWizardState) => {
    setState(newState);
  }, []);

  const goToStep = (step: WizardStep) => {
    setDirection(step > currentStep ? 1 : -1);
    setCurrentStep(step);
  };

  const handleNext = () => {
    if (!validateStep(currentStep, state)) {
      toast.error("Please complete the required fields before continuing.");
      return;
    }
    setCompletedSteps(prev => new Set(prev).add(currentStep));
    if (currentStep < 6) {
      setDirection(1);
      setCurrentStep((currentStep + 1) as WizardStep);
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setDirection(-1);
      setCurrentStep((currentStep - 1) as WizardStep);
    }
  };

  const [generationProgress, setGenerationProgress] = useState<{ count: number; status: string }>({ count: 0, status: '' });

  const getShapeName = (shapeId: string) =>
    DIAMOND_SHAPES.find((shape) => shape.id === shapeId)?.name ?? shapeId;

  const buildCaratSegments = (range: [number, number]) => {
    const min = Number(range?.[0] ?? 0.5);
    const max = Number(range?.[1] ?? 5);
    const segments: [number, number][] = [];
    let from = Math.max(0.5, Number(min.toFixed(2)));
    const end = Math.min(5, Number(max.toFixed(2)));

    while (from <= end + 0.001) {
      const to = Math.min(end, Number((from + 0.24).toFixed(2)));
      segments.push([from, to]);
      from = Number((to + 0.01).toFixed(2));
    }

    return segments;
  };

  const isStatementTimeout = (error: any) => {
    const message = String(error?.message ?? error?.details ?? error ?? '').toLowerCase();
    return message.includes('statement timeout') || message.includes('timeout') || message.includes('504');
  };

  const handleGenerate = async () => {
    setIsGenerating(true);
    setGenerationProgress({ count: 0, status: 'Saving configuration…' });
    try {
      // Save config to DB
      const { error: configError } = await supabase
        .from('diamond_catalog_config')
        .upsert({
          client_id: clientId,
          config: state as any,
          is_active: true,
        }, { onConflict: 'client_id' });

      if (configError) {
        console.error('Config save error:', configError);
      }

      const selectedStoneTypes = [
        state.diamondType.naturalEnabled ? 'natural' : null,
        state.diamondType.labGrownEnabled ? 'lab' : null,
      ].filter(Boolean) as string[];
      const selectedShapes = state.shapes.selectedShapes;
      const caratSegments = buildCaratSegments(state.grading.caratRange);
      const chunks = selectedShapes.flatMap((shapeId) =>
        selectedStoneTypes.flatMap((stoneType) =>
          caratSegments.map((caratRange) => ({ shapeId, stoneType, caratRange }))
        )
      );

      if (chunks.length === 0) {
        throw new Error('Please select at least one diamond type and one shape.');
      }

      setGenerationProgress({ count: 0, status: 'Starting catalogue generation…' });

      let generatedCount = 0;
      let poolCount = 0;
      let fallbackCount = 0;
      let completedChunks = 0;
      let totalChunks = chunks.length;
      let clearedExisting = false;

      const runChunk = async (chunk: typeof chunks[number]): Promise<{ presetsCount: number; poolCount: number; fallbackCount: number }> => {
        const stoneLabel = chunk.stoneType === 'natural' ? 'Natural' : 'Lab-grown';
        setGenerationProgress({
          count: generatedCount,
          status: `Generating ${completedChunks + 1} of ${totalChunks}: ${stoneLabel} ${getShapeName(chunk.shapeId)} ${chunk.caratRange[0]}–${chunk.caratRange[1]}ct…`,
        });

        const chunkConfig: DiamondWizardState = {
          ...state,
          grading: {
            ...state.grading,
            caratRange: chunk.caratRange,
          },
        };

        const { data, error } = await (supabase as any).rpc('generate_client_diamond_presets_chunk_db', {
          p_client_id: clientId,
          p_wizard_config: chunkConfig,
          p_shape_ids: [chunk.shapeId],
          p_stone_types_filter: [chunk.stoneType],
          p_clear_existing: !clearedExisting,
        });

        if (error && isStatementTimeout(error)) {
          const [min, max] = chunk.caratRange;
          if (max - min >= 0.02) {
            const midpoint = Number(((min + max) / 2).toFixed(2));
            const retryChunks = [
              { ...chunk, caratRange: [min, midpoint] as [number, number] },
              { ...chunk, caratRange: [Number((midpoint + 0.01).toFixed(2)), max] as [number, number] },
            ].filter((retryChunk) => retryChunk.caratRange[0] <= retryChunk.caratRange[1]);

            totalChunks += retryChunks.length - 1;
            let retryTotals = { presetsCount: 0, poolCount: 0, fallbackCount: 0 };
            for (const retryChunk of retryChunks) {
              const retryResult = await runChunk(retryChunk);
              retryTotals.presetsCount += retryResult.presetsCount;
              retryTotals.poolCount += retryResult.poolCount;
              retryTotals.fallbackCount += retryResult.fallbackCount;
            }
            return retryTotals;
          }
        }

        if (error) throw error;

        clearedExisting = true;
        completedChunks += 1;
        return {
          presetsCount: Number(data?.presetsCount ?? 0),
          poolCount: Number(data?.poolCount ?? 0),
          fallbackCount: Number(data?.fallbackCount ?? 0),
        };
      };

      const CONCURRENCY = 3;
      for (let i = 0; i < chunks.length; i += CONCURRENCY) {
        const batch = chunks.slice(i, i + CONCURRENCY);
        // Only the very first chunk in the very first batch clears existing data
        const results = await Promise.all(
          batch.map((chunk, batchIdx) => {
            if (i === 0 && batchIdx === 0) return runChunk(chunk);
            // Ensure clearedExisting is true before parallel chunks run
            clearedExisting = true;
            return runChunk(chunk);
          })
        );
        for (const data of results) {
          generatedCount += data.presetsCount;
          poolCount += data.poolCount;
          fallbackCount += data.fallbackCount;
        }
      }

      setGenerationProgress({
        count: generatedCount,
        status: `Generated ${generatedCount.toLocaleString()} diamond combinations…`,
      });

      // Sync client_carat_options so widget carat dropdown reflects the selected range
      try {
        const [caratMin, caratMax] = state.grading.caratRange ?? [0.5, 5];
        const STANDARD_CARATS = [0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5];
        const eligible = STANDARD_CARATS.filter(
          (v) => v >= Math.max(0.5, Number(caratMin)) - 0.0001 && v <= Number(caratMax) + 0.0001
        );
        if (eligible.length > 0) {
          const topValue = eligible[eligible.length - 1];
          const rows = eligible.map((v) => {
            const label = Number.isInteger(v) ? `${v}` : `${v}`;
            return {
              client_id: clientId,
              carat_value: v,
              display_name: v === topValue ? `${label} Carat+` : `${label} Carat`,
              is_enabled: true,
              price_adjustment: 0,
              image_filename_0: 'carat_0.png',
              image_filename_1: 'carat_1.png',
              image_filename_2: 'carat_2.png',
              image_filename_3: 'carat_3.png',
              image_filename_4: 'carat_4.png',
              image_filename_5: 'carat_5.png',
              image_filename_6: 'carat_6.png',
              image_filename_7: 'carat_7.png',
              images_filepath: '/images/carat/',
            };
          });
          await (supabase as any)
            .from('client_carat_options')
            .upsert(rows, { onConflict: 'client_id,carat_value' });
        }
      } catch (caratErr) {
        console.error('Carat options sync error:', caratErr);
      }

      toast.success('Diamond catalogue generated successfully!');
      clearWizardState(clientId);
      onComplete?.();
    } catch (err: any) {
      console.error('Generation error:', err);
      toast.error(`Failed to generate catalogue: ${err.message}`);

    } finally {
      setIsGenerating(false);
    }
  };

  const isStepValid = validateStep(currentStep, state);

  const slideVariants = {
    enter: (dir: number) => ({ x: dir > 0 ? 100 : -100, opacity: 0 }),
    center: { x: 0, opacity: 1 },
    exit: (dir: number) => ({ x: dir > 0 ? -100 : 100, opacity: 0 }),
  };

  return (
    <div className="space-y-6 relative">
      {/* Full-screen loading overlay during catalog generation */}
      {isGenerating && (
        <div className="fixed inset-0 z-[100] bg-background/95 backdrop-blur-sm flex items-center justify-center">
          <div className="flex flex-col items-center gap-6 px-6 text-center max-w-md">
            <div className="relative w-16 h-16">
              <div className="absolute inset-0 rounded-full border-2 border-primary/20" />
              <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-primary animate-spin" />
            </div>
            <div className="space-y-2">
              <h3 className="text-lg font-semibold">Generating Your Diamond Catalogue</h3>
              <p className="text-sm text-muted-foreground">
                {generationProgress.status || 'Preparing diamonds…'}
              </p>
              {generationProgress.count > 0 && (
                <p className="text-2xl font-bold text-primary tabular-nums">
                  {generationProgress.count.toLocaleString()}
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                This can take a few minutes for large catalogues. Please don't close this window.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Step indicator */}
      <div className="flex items-center justify-center gap-1 overflow-x-auto pb-2">
        {WIZARD_STEPS.map((step, idx) => {
          const isCompleted = completedSteps.has(step.id) || step.id < currentStep;
          const isCurrent = step.id === currentStep;
          const isClickable = isCompleted || step.id <= currentStep;
          
          return (
            <div key={step.id} className="flex items-center">
              <button
                onClick={() => isClickable ? goToStep(step.id) : null}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                  isCurrent
                    ? 'bg-primary text-primary-foreground'
                    : isCompleted
                    ? 'bg-primary/10 text-primary cursor-pointer hover:bg-primary/20'
                    : 'bg-muted text-muted-foreground cursor-default'
                }`}
                disabled={!isClickable}
              >
                {isCompleted && !isCurrent ? (
                  <Check className="w-3 h-3" />
                ) : (
                  <span className="w-4 h-4 rounded-full border flex items-center justify-center text-[10px]">
                    {step.id}
                  </span>
                )}
                <span className="hidden sm:inline">{step.title}</span>
              </button>
              {idx < WIZARD_STEPS.length - 1 && (
                <div className={`w-6 h-px mx-1 ${isCompleted ? 'bg-primary/30' : 'bg-border'}`} />
              )}
            </div>
          );
        })}
      </div>

      {/* Step content with slide animation */}
      <div className="min-h-[400px]">
        <AnimatePresence mode="wait" custom={direction}>
          <motion.div
            key={currentStep}
            custom={direction}
            variants={slideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.2, ease: 'easeInOut' }}
          >
            {currentStep === 1 && <DiamondTypeStep state={state} onChange={updateState} />}
            {currentStep === 2 && <DiamondShapesStep state={state} onChange={updateState} availableShapes={availableShapes} />}
            {currentStep === 3 && <DiamondGradingStep state={state} onChange={updateState} />}
            {currentStep === 4 && <DiamondPricingStep state={state} onChange={updateState} clientId={clientId} />}
            {currentStep === 5 && <DiamondProductSettingsStep state={state} onChange={updateState} />}
            {currentStep === 6 && (
              <DiamondReviewStep
                state={state}
                onGoToStep={goToStep}
                onGenerate={handleGenerate}
                isGenerating={isGenerating}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Navigation buttons */}
      <div className="flex items-center justify-between pt-4 border-t">
        <Button
          variant="outline"
          onClick={handleBack}
          disabled={currentStep === 1}
          className="gap-1"
        >
          <ChevronLeft className="w-4 h-4" /> Back
        </Button>
        {currentStep < 6 && (
          <Button
            onClick={handleNext}
            disabled={!isStepValid}
            className="gap-1"
          >
            Continue <ChevronRight className="w-4 h-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
