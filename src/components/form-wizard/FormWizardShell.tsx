import { ReactNode, useState, useRef, useEffect } from 'react';
import { WizardStepIndicator } from './WizardStepIndicator';
import { Button } from '@/components/ui/button';
import { Loader2, ArrowLeft } from 'lucide-react';
import { getContrastText } from '@/lib/color-utils';

export interface WizardStep {
  key: string;
  label: string;
  content: ReactNode;
}

interface FormWizardShellProps {
  steps: WizardStep[];
  currentStep: number;
  onNext: () => void;
  onBack: () => void;
  nextLabel?: string | null;
  selectedLabel?: string;
  isSubmitting?: boolean;
  isLastStep?: boolean;
  canProceed?: boolean;
  backgroundColor?: string;
  fontColor?: string;
  accentColor?: string;
  submitButtonBg?: string;
  submitButtonText?: string;
  aiEnabled?: boolean;
}

export function FormWizardShell({
  steps,
  currentStep,
  onNext,
  onBack,
  nextLabel,
  selectedLabel,
  isSubmitting = false,
  isLastStep = false,
  canProceed = true,
  backgroundColor,
  fontColor,
  accentColor,
  submitButtonBg,
  submitButtonText,
  aiEnabled = false,
}: FormWizardShellProps) {
  const accent = accentColor || 'hsl(142, 53%, 53%)';
  const bg = backgroundColor || '#0a0a0a';
  const font = fontColor || '#ffffff';
  const step = steps[currentStep];
  const btnBg = submitButtonBg || accent;
  const btnText = submitButtonText || getContrastText(btnBg);

  return (
    <div
      className="md:h-screen flex flex-col md:overflow-hidden overflow-x-hidden"
      style={{ backgroundColor: bg, color: font }}
    >
      {/* Top bar with back arrow */}
      <div className="flex items-center justify-between px-4 md:px-8 pt-3 md:pt-6 pb-2 shrink-0">
        {currentStep > 0 ? (
          <button
            type="button"
            onClick={onBack}
            className="flex items-center gap-1 text-sm uppercase tracking-wider opacity-60 hover:opacity-100 transition-opacity"
            style={{ color: font }}
          >
            <ArrowLeft className="w-4 h-4" /> Back
          </button>
        ) : (
          <div />
        )}
        <div />
      </div>

      {/* AI badge — only on first step */}
      {aiEnabled && currentStep === 0 && (
        <div className="flex justify-center pb-2 shrink-0 animate-fade-in">
          <div
            className="px-3 py-1.5 rounded-full flex items-center gap-2"
            style={{
              backgroundColor: `${accent}18`,
              border: `1px solid ${accent}30`,
            }}
          >
            <span
              className="text-[11px] uppercase tracking-[0.15em] font-medium"
              style={{ color: accent }}
            >
              Designed by you. Rendered by AI.
            </span>
          </div>
        </div>
      )}

      {/* Step indicator */}
      <div className="py-2 md:py-4 shrink-0">
        <WizardStepIndicator
          currentStep={currentStep}
          totalSteps={steps.length}
          stepLabel={step?.label || ''}
          accentColor={accent}
          stepLabels={steps.map(s => s.label)}
          fontColor={font}
        />
      </div>

      {/* Mobile: render only active step in normal flow (content-height) */}
      <div className="md:hidden flex-1">
        <div key={step?.key} className="px-0 pt-3 pb-4 animate-fade-in">
          {step?.content}
        </div>
      </div>

      {/* Desktop: sliding vertical stack inside fixed viewport */}
      <div className="hidden md:block flex-1 overflow-hidden relative">
        <div
          className="absolute inset-x-0 top-0"
          style={{
            height: `${steps.length * 100}%`,
            transform: `translateY(-${(currentStep / steps.length) * 100}%)`,
            transition: 'transform 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
            willChange: 'transform',
          }}
        >
          {steps.map((s, i) => (
            <div
              key={s.key}
              className="flex flex-col justify-center overflow-hidden overflow-y-auto"
              style={{ height: `${100 / steps.length}%` }}
            >
              {Math.abs(i - currentStep) <= 1 ? (
                <div
                  style={{
                    opacity: i === currentStep ? 1 : 0,
                    transition: 'opacity 0.2s ease',
                  }}
                >
                  {s.content}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </div>

      {/* Bottom CTA */}
      {nextLabel !== null && (
        <div className="px-4 md:px-8 pb-3 md:pb-6 pt-2 md:pt-0 space-y-3 shrink-0">
          <div className="max-w-md md:max-w-xl mx-auto">
            <Button
              type="button"
              onClick={onNext}
              disabled={!canProceed || isSubmitting}
              className="w-full h-12 text-sm md:text-base font-bold uppercase tracking-wider rounded-xl border-0 transition-all duration-300 hover:scale-[1.01]"
              style={{
                backgroundColor: btnBg,
                color: btnText,
                opacity: canProceed ? 1 : 0.4,
              }}
            >
              {isSubmitting ? (
                <><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Processing...</>
              ) : (
                nextLabel || (isLastStep ? 'SUBMIT' : 'NEXT >')
              )}
            </Button>
          </div>
          {selectedLabel && (
            <p className="text-center text-xs uppercase tracking-[0.2em] font-medium" style={{ color: accent }}>
              {selectedLabel}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
