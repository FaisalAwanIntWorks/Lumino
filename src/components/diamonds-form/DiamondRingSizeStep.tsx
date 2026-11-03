import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DEFAULT_DTT_STEP_HEADINGS } from './step-headings';

/**
 * Ring sizes are numbers (US 3–13, EU 44–70, with half/quarter sizes such as
 * 6.5 or 6.25). Only digits and a single decimal point are accepted while
 * typing; letters, spaces and symbols are dropped on the spot.
 */
const RING_SIZE_INPUT_RE = /^\d{0,2}(\.\d{0,2})?$/;
const RING_SIZE_ERROR = 'Please enter your ring size as a number, e.g. 6 or 6.5';

/** Strip anything that is not a digit or the first decimal point. */
export const sanitizeRingSizeInput = (raw: string): string => {
  let out = '';
  let seenDot = false;
  for (const ch of raw) {
    if (ch >= '0' && ch <= '9') out += ch;
    else if (ch === '.' && !seenDot) { out += ch; seenDot = true; }
  }
  // Clamp to the shape the field allows (2 digits . 2 digits).
  while (out && !RING_SIZE_INPUT_RE.test(out)) out = out.slice(0, -1);
  return out;
};

/** Empty is allowed ("Not sure? Leave it empty"); otherwise it must be a number > 0. */
export const isValidRingSize = (value: string): boolean => {
  const v = value.trim();
  if (!v) return true;
  const n = Number(v);
  return Number.isFinite(n) && n > 0;
};

interface DiamondRingSizeStepProps {
  ringSize: string;
  onChange: (ringSize: string) => void;
  onNext: () => void;
  onBack: () => void;
  title?: string;
  subtitle?: string;
}

/**
 * Standalone "What is your ring size?" step (Quote Estimator). Previously an
 * input on the Inspiration & Details screen; now its own step so it can be
 * toggled / reordered in Configure like every other step.
 */
export const DiamondRingSizeStep = ({ ringSize, onChange, onNext, onBack, title, subtitle }: DiamondRingSizeStepProps) => {
  const titleText = title || DEFAULT_DTT_STEP_HEADINGS.ring_size.title;
  const subText = subtitle || DEFAULT_DTT_STEP_HEADINGS.ring_size.subtitle;
  const [error, setError] = useState<string | null>(null);

  const handleChange = (raw: string) => {
    if (error) setError(null);
    onChange(sanitizeRingSizeInput(raw));
  };

  const handleNext = () => {
    if (!isValidRingSize(ringSize)) {
      setError(RING_SIZE_ERROR);
      return;
    }
    onNext();
  };

  return (
    <Card className="w-full bg-[#EDE8E3] border-none shadow-2xl relative min-h-[100dvh] md:min-h-0">
      <CardContent className="p-4 md:p-8">
        <div className="text-center mb-6">
          <h2 className="text-2xl md:text-3xl font-bold text-gray-900">{titleText}</h2>
          {subText && <p className="text-gray-600 text-xs md:text-base mt-1 md:mt-2">{subText}</p>}
        </div>

        <div className="max-w-lg mx-auto mb-8">
          <Input
            value={ringSize}
            onChange={(e) => handleChange(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleNext(); }}
            placeholder="Enter your ring size"
            inputMode="decimal"
            maxLength={5}
            className={`bg-white border-none text-gray-800 placeholder:text-gray-400 h-14 text-lg ${error ? 'ring-2 ring-red-400' : ''}`}
            aria-label="Ring size"
            aria-invalid={error ? true : undefined}
          />
          {error ? (
            <p className="text-center text-red-600 text-xs md:text-sm mt-2" role="alert">{error}</p>
          ) : (
            <p className="text-center text-gray-500 text-xs md:text-sm mt-2">
              Not sure? Leave it empty and we will help you find the right fit.
            </p>
          )}
        </div>

        <div className="flex justify-center gap-3">
          <Button
            variant="secondary"
            onClick={onBack}
            className="bg-black text-white hover:bg-gray-900 px-6 md:px-8 border border-black"
          >
            Back
          </Button>
          <Button
            onClick={handleNext}
            className="bg-black text-white hover:bg-gray-900 px-6 md:px-8 border border-black"
          >
            Next
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};
