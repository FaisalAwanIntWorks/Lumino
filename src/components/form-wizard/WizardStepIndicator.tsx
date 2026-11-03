import { getContrastText, withAlpha } from '@/lib/color-utils';

interface WizardStepIndicatorProps {
  currentStep: number;
  totalSteps: number;
  stepLabel: string;
  accentColor?: string;
  stepLabels?: string[];
  fontColor?: string;
}

export function WizardStepIndicator({
  currentStep,
  totalSteps,
  stepLabel,
  accentColor,
  stepLabels,
  fontColor,
}: WizardStepIndicatorProps) {
  const accent = accentColor || 'hsl(142, 53%, 53%)';
  const font = fontColor || '#ffffff';
  const activeLabelColor = getContrastText(accent);

  return (
    <div className="w-full px-4 md:px-8 flex justify-center">
      <div className="flex items-center gap-1.5 md:gap-2">
        {Array.from({ length: totalSteps }, (_, i) => {
          const isCompleted = i < currentStep;
          const isActive = i === currentStep;
          const label = stepLabels?.[i] || '';

          // Mobile focal window: show current ± 2 only
          const distance = Math.abs(i - currentStep);
          const mobileHidden = distance > 2;
          const mobileEdgeFade = distance === 2;

          if (isActive) {
            return (
              <div
                key={i}
                className={`flex items-center justify-center rounded-full px-4 py-1.5 transition-all duration-300 ${mobileHidden ? 'hidden md:flex' : 'flex'}`}
                style={{
                  backgroundColor: accent,
                  boxShadow: `0 0 16px ${accent}44`,
                  opacity: mobileEdgeFade ? 0.5 : 1,
                }}
              >
                <span
                  className="text-[11px] md:text-xs font-bold uppercase tracking-[0.15em] whitespace-nowrap"
                  style={{ color: activeLabelColor }}
                >
                  {label || `Step ${i + 1}`}
                </span>
              </div>
            );
          }

          return (
            <div
              key={i}
              className={`h-2 rounded-full transition-all duration-300 ${mobileHidden ? 'hidden md:block' : 'block'}`}
              style={{
                width: 32,
                backgroundColor: isCompleted ? accent : withAlpha(font, 0.2),
                opacity: isCompleted ? 1 : mobileEdgeFade ? 0.4 : 0.7,
              }}
            />
          );
        })}
      </div>
    </div>
  );
}
