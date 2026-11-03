// Horizontal step tabs for the 24k Carat Jewelers Ring OS skin.
// Light surface: active = bold black + gold underline, inactive = muted gray.
// Clicking a tab delegates to the existing step navigation
// (gated by canAdvance / completion state).

import { useEffect, useRef } from 'react';
import { RING_STEP_LABELS, RingStepKey } from '@/lib/ring-step-order';

interface TwentyFourKTopTabsProps {
  orderedKeys: (RingStepKey | 'estimate')[];
  currentStep: number;
  completedSteps: boolean[];
  onStepChange: (step: number) => void;
}

export const TwentyFourKTopTabs = ({
  orderedKeys,
  currentStep,
  completedSteps,
  onStepChange,
}: TwentyFourKTopTabsProps) => {
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => {
    tabRefs.current[currentStep]?.scrollIntoView({
      behavior: 'smooth',
      block: 'nearest',
      inline: 'center',
    });
  }, [currentStep]);

  return (
    <div className="border-b border-border bg-background">
      <div className="flex items-stretch px-3 md:px-5 overflow-x-auto scrollbar-hide snap-x snap-mandatory scroll-px-3 md:scroll-px-5">
        {orderedKeys.map((key, index) => {
          const label = key === 'estimate' ? 'ESTIMATE' : RING_STEP_LABELS[key as RingStepKey];
          const isActive = currentStep === index;
          const isReachable = index === 0 || completedSteps.slice(0, index).every(Boolean) || index <= currentStep;
          return (
            <button
              ref={(node) => { tabRefs.current[index] = node; }}
              key={`${key}-${index}`}
              onClick={() => isReachable && onStepChange(index)}
              disabled={!isReachable}
              className={`relative flex flex-1 shrink basis-[64px] min-w-fit items-center justify-center whitespace-nowrap px-2 md:px-2.5 py-2.5 md:py-4 text-center text-[10px] lg:text-[11px] leading-tight tracking-[0.08em] uppercase transition-colors duration-200 snap-center ${
                isActive
                  ? 'text-foreground font-semibold'
                  : isReachable
                    ? 'text-muted-foreground hover:text-foreground font-medium'
                    : 'text-muted-foreground/45 cursor-not-allowed font-medium'
              }`}
            >
              {label}
              {isActive && (
                <span
                  className="absolute left-0 right-0 -bottom-px h-[2px]"
                  style={{ background: 'hsl(var(--accent-gold))' }}
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};
