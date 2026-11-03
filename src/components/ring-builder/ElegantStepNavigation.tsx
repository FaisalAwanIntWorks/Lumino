import { Check } from 'lucide-react';
import React from 'react';

interface ElegantStepNavigationProps {
  currentStep: number;
  onStepChange: (step: number) => void;
  completedSteps: boolean[];
  stepLabels?: string[];
  /**
   * Client-scoped tablet layout (see src/lib/embed-client-overrides.ts).
   * When true, the "current ±2" step window used on phones stays active
   * through tablet widths and the full bar only appears from `xl` (1280px),
   * so 8–9 labelled steps never overflow a ~380–410px panel on iPads.
   */
  tabletFit?: boolean;
  /**
   * Client-scoped (see src/lib/embed-client-overrides.ts). When true, only
   * completed and current steps render sharp; reachable-but-unvisited steps
   * use the same faded style as unreachable ones. Click behaviour is unchanged.
   */
  completionStepEmphasis?: boolean;
  /**
   * Client-scoped (see src/lib/embed-client-overrides.ts). When true, the
   * label is absolutely positioned under its circle so the column is always
   * circle-width; wide labels no longer stretch the gap between circles.
   */
  uniformStepSpacing?: boolean;
}

const DEFAULT_ELEGANT_STEPS = [
  { label: 'STYLE' },
  { label: 'SHANK' },
  { label: 'METAL' },
  { label: 'SHAPE' },
  { label: 'CARAT' },
  { label: 'STONE' },
  { label: 'ENGRAVE' },
  { label: 'DETAILS' },
];

export const ElegantStepNavigation = ({ currentStep, onStepChange, completedSteps, stepLabels, tabletFit = false, completionStepEmphasis = false, uniformStepSpacing = false }: ElegantStepNavigationProps) => {
  // Breakpoint at which every step becomes visible (below it, distant steps hide).
  const revealAllFlex = tabletFit ? 'hidden xl:flex' : 'hidden md:flex';
  const revealAllBlock = tabletFit ? 'hidden xl:block' : 'hidden md:block';
  const ELEGANT_STEPS = stepLabels && stepLabels.length > 0
    ? stepLabels.map((label) => ({ label }))
    : DEFAULT_ELEGANT_STEPS;
  const isStepAccessible = (index: number) => {
    if (index === 0) return true;
    for (let i = 0; i < index; i++) {
      if (!completedSteps[i]) return false;
    }
    return true;
  };

  return (
    <div className="px-3 py-3 md:px-4 md:py-4 bg-background">
      {/* uniformStepSpacing: labels hang below the circles, so reserve their height here. */}
      <div className={`flex items-center justify-center max-w-lg mx-auto ${uniformStepSpacing ? 'pb-4 md:pb-5' : ''}`}>
        {ELEGANT_STEPS.map((step, index) => {
          const isActive = currentStep === index;
          const isCompleted = completedSteps[index] && currentStep > index;
          const accessible = isStepAccessible(index);
          // completionStepEmphasis: a reachable step the shopper hasn't visited
          // yet looks faded (like an unreachable one) but stays clickable.
          const sharpIdle = accessible && !completionStepEmphasis;
          const labelFaded = completionStepEmphasis && !isCompleted && !isActive;
          const isLast = index === ELEGANT_STEPS.length - 1;
          const distance = Math.abs(index - currentStep);
          const mobileHidden = distance > 2;
          const mobileEdgeFade = distance === 2;

          return (
            <React.Fragment key={step.label}>
              {/* Step circle + label */}
              <div
                className={`flex flex-col items-center ${uniformStepSpacing ? 'relative w-7 md:w-8 shrink-0' : ''} ${mobileHidden ? revealAllFlex : 'flex'}`}
                style={{ opacity: 1 }}
              >
                <button
                  onClick={() => accessible && onStepChange(index)}
                  disabled={!accessible}
                  className={`
                    w-7 h-7 md:w-8 md:h-8 rounded-full flex items-center justify-center
                    text-[10px] md:text-xs font-semibold transition-all duration-300 shrink-0
                    ${isCompleted
                      ? 'bg-primary text-primary-foreground'
                      : isActive
                        ? 'border-2 border-primary text-primary bg-background'
                        : sharpIdle
                          ? 'border border-muted-foreground/30 text-muted-foreground bg-background cursor-pointer hover:border-primary/50'
                          : accessible
                            ? 'border border-muted-foreground/20 text-muted-foreground/40 bg-background cursor-pointer hover:border-primary/50'
                            : 'border border-muted-foreground/20 text-muted-foreground/40 bg-background cursor-default'
                    }
                  `}
                >
                  {isCompleted ? <Check className="w-3.5 h-3.5 md:w-4 md:h-4" /> : index + 1}
                </button>
                <span className={`mt-1 text-[8px] md:text-[9px] font-medium uppercase tracking-[0.1em] whitespace-nowrap ${
                  uniformStepSpacing ? 'absolute top-full left-1/2 -translate-x-1/2' : ''
                } ${
                  labelFaded ? 'text-muted-foreground/40' : completionStepEmphasis ? 'text-foreground' : 'text-muted-foreground'
                }`}>
                  {step.label}
                </span>
              </div>

              {/* Connecting line */}
              {!isLast && (
                <div
                  className={`h-0.5 flex-1 min-w-2 max-w-8 mx-0.5 md:mx-1 rounded-full transition-all duration-300 self-center ${uniformStepSpacing ? '' : 'mb-4'}
                    ${mobileHidden ? revealAllBlock : 'block'}
                  `}
                  style={{
                    backgroundColor: isCompleted
                      ? 'hsl(var(--primary))'
                      : 'hsl(var(--muted-foreground) / 0.2)',
                  }}
                />
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
};
