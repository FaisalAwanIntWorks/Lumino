import { useEffect, useRef } from 'react';
import { Check, ChevronLeft, ChevronRight } from 'lucide-react';

interface StepNavigationProps {
  currentStep: number;
  onStepChange: (step: number) => void;
  completedSteps: boolean[];
  onGoBack?: () => void;
  canGoNext?: boolean;
  stepLabels?: string[];
}

const DEFAULT_STEPS = ['STYLE', 'SHANK', 'METAL', 'SHAPE', 'CARAT', 'STONE', 'ENGRAVING', 'DETAILS'];

export const StepNavigation = ({ currentStep, onStepChange, completedSteps, onGoBack, canGoNext, stepLabels }: StepNavigationProps) => {
  const STEPS = stepLabels && stepLabels.length > 0 ? stepLabels : DEFAULT_STEPS;
  const canGoPrev = currentStep > 0;
  const canGoDown = typeof canGoNext === 'boolean' ? canGoNext : true;
  const isStepAccessible = (index: number) => {
    if (index === 0) return true;
    for (let i = 0; i < index; i++) {
      if (!completedSteps[i]) return false;
    }
    return true;
  };

  // Every step name is rendered; when they don't all fit (phones, tablets,
  // long custom labels) the strip scrolls and keeps the active step centred.
  // scrollLeft is set by hand — scrollIntoView would also scroll the host
  // page when the widget runs inside an iframe.
  const scrollerRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const centreActive = () => {
      const active = activeRef.current;
      if (!active) return;
      const scrollerRect = scroller.getBoundingClientRect();
      const activeRect = active.getBoundingClientRect();
      const left = activeRect.left - scrollerRect.left + scroller.scrollLeft - (scroller.clientWidth - activeRect.width) / 2;
      scroller.scrollTo({ left: Math.max(0, left), behavior: 'smooth' });
    };
    centreActive();
    // Re-centre when the panel width changes (rotation, iframe resize).
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(centreActive);
    observer.observe(scroller);
    return () => observer.disconnect();
  }, [currentStep, STEPS.length]);

  return (
    <div className="flex items-center justify-between px-2 py-1.5 md:px-4 md:py-3 border-b border-border/15 bg-background/80 backdrop-blur">
      <button
        onClick={onGoBack}
        disabled={!canGoPrev}
        className="inline-flex items-center justify-center bg-transparent text-foreground/90 transition-all duration-200 hover:text-foreground disabled:opacity-30 shrink-0"
        aria-label="Previous step"
      >
        <ChevronLeft className="w-5 h-5" />
      </button>

      <div
        ref={scrollerRef}
        className="flex-1 min-w-0 mx-2 overflow-x-auto scrollbar-hide"
        style={{
          maskImage: 'linear-gradient(to right, transparent, black 16px, black calc(100% - 16px), transparent)',
          WebkitMaskImage: 'linear-gradient(to right, transparent, black 16px, black calc(100% - 16px), transparent)',
        }}
      >
        <div className="flex items-center gap-3 w-max mx-auto px-4">
          {STEPS.map((label, index) => {
            const isActive = currentStep === index;
            const isCompleted = completedSteps[index] && currentStep > index;

            if (isActive) {
              return (
                <div
                  key={label}
                  ref={activeRef}
                  className="flex items-center justify-center rounded-full px-3 py-1 bg-primary text-primary-foreground shadow-md transition-all duration-300 shrink-0"
                >
                  <span className="text-[10px] md:text-[11px] font-bold uppercase tracking-[0.12em] whitespace-nowrap">
                    {label}
                  </span>
                </div>
              );
            }

            // Same rule as the Elegant (UI Option 4) bar: a step is reachable
            // once every step before it is complete.
            const accessible = isStepAccessible(index);

            return (
              <button
                key={label}
                type="button"
                onClick={() => accessible && onStepChange(index)}
                disabled={!accessible}
                aria-label={`Go to ${label} step`}
                className={`flex items-center py-2 bg-transparent shrink-0 transition-colors duration-200 ${
                  isCompleted
                    ? 'text-primary cursor-pointer'
                    : accessible
                      ? 'text-foreground/85 hover:text-foreground cursor-pointer'
                      : 'text-foreground/50 cursor-default'
                }`}
              >
                <span className="flex items-center justify-center gap-1 text-[10px] md:text-[11px] font-semibold uppercase tracking-[0.1em] leading-none whitespace-nowrap">
                  {isCompleted && <Check className="w-2.5 h-2.5 shrink-0" strokeWidth={3} />}
                  {label}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <button
        onClick={() => onStepChange(currentStep + 1)}
        disabled={!canGoDown || currentStep >= STEPS.length - 1}
        className="inline-flex items-center justify-center bg-transparent text-foreground/90 transition-all duration-200 hover:text-foreground disabled:opacity-30 shrink-0"
        aria-label="Go to next step"
      >
        <ChevronRight className="w-5 h-5" />
      </button>
    </div>
  );
};
