import { Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DEFAULT_DTT_STEP_HEADINGS } from './step-headings';
import { getCurrencySymbol } from '@/lib/pricing-utils';
import type { ResolvedMetalKarat, ResolvedTwoToneCombo } from '@/lib/dtt-metal-karats';

interface DiamondMetalKaratStepProps {
  /** Option value of the metal chosen on the previous screen. */
  metalValue: string;
  /** Display name of that metal (used in the heading). */
  metalName: string;
  /** Enabled karat / purity variants for that metal. */
  variants: ResolvedMetalKarat[];
  selectedKarat: string | null;
  onSelectKarat: (karat: string) => void;
  /** Two Tone only: enabled metal combinations shown above the karats. */
  combos?: ResolvedTwoToneCombo[];
  selectedCombo?: string | null;
  onSelectCombo?: (combo: string) => void;
  onBack: () => void;
  showPrices?: boolean;
  currency?: string;
}

/** Swatch colours for the two halves of a Two Tone combination card. */
const METAL_SWATCH: Record<string, string> = {
  'yellow-gold': 'linear-gradient(135deg, #f6d77a, #c99a2e)',
  'white-gold': 'linear-gradient(135deg, #f4f4f4, #b9bcc2)',
  'rose-gold': 'linear-gradient(135deg, #f3c1ae, #c67a5c)',
  platinum: 'linear-gradient(135deg, #e6e8ea, #9aa0a6)',
};

const METAL_SHORT: Record<string, string> = {
  'yellow-gold': 'Yellow',
  'white-gold': 'White',
  'rose-gold': 'Rose',
  platinum: 'Platinum',
};

/**
 * Screen shown right after the metal choice: the karat / purity variants the
 * client enabled for that metal. For Two Tone it first asks which two metals
 * are combined, then the gold karat (which applies to both gold parts).
 */
export const DiamondMetalKaratStep = ({
  metalValue,
  metalName,
  variants,
  selectedKarat,
  onSelectKarat,
  combos = [],
  selectedCombo = null,
  onSelectCombo,
  onBack,
  showPrices = true,
  currency = 'USD',
}: DiamondMetalKaratStepProps) => {
  const isTwoTone = metalValue === 'two-tone';
  const hasCombos = isTwoTone && combos.length > 0;

  const sym = getCurrencySymbol(currency);
  const formatPrice = (price: number) => (price === 0 ? `+${sym}0` : `+${sym}${price.toLocaleString()}`);

  const heading = hasCombos
    ? DEFAULT_DTT_STEP_HEADINGS.two_tone
    : DEFAULT_DTT_STEP_HEADINGS.metal_karat;
  const titleText = heading.title.replace('{metal}', metalName);
  const subText = heading.subtitle;

  const variantLabel = metalValue === 'silver'
    ? 'Silver type'
    : metalValue === 'platinum'
      ? 'Platinum purity'
      : isTwoTone
        ? 'Gold karat (applies to both gold parts)'
        : 'Karat';

  const cardBase = 'relative bg-white rounded-lg cursor-pointer transition-all duration-200 hover:shadow-lg';
  const cardSelected = 'ring-2 ring-gray-400 shadow-lg';

  const renderCheck = () => (
    <div className="absolute top-1.5 right-1.5 md:top-2 md:right-2 w-4 h-4 md:w-5 md:h-5 bg-gray-800 rounded-full flex items-center justify-center border-2 border-white z-10">
      <Check className="w-2.5 h-2.5 md:w-3 md:h-3 text-white" />
    </div>
  );

  return (
    <div className="bg-[#EDE8E3] rounded-lg p-4 md:p-10 relative min-h-[100dvh] md:min-h-0">
      <div className="text-center mb-3 md:mb-6">
        <h2 className="text-lg md:text-3xl font-bold text-gray-900 mb-1 md:mb-2">{titleText}</h2>
        {subText && <p className="text-gray-600 text-xs md:text-base">{subText}</p>}
      </div>

      {/* Two Tone: which two metals? */}
      {hasCombos && (
        <div className="max-w-2xl mx-auto mb-4 md:mb-6">
          <p className="text-center text-gray-700 text-xs md:text-sm font-semibold uppercase tracking-wide mb-2 md:mb-3">
            Metal combination
          </p>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2 md:gap-3">
            {combos.map((c) => {
              const isSelected = selectedCombo === c.value;
              return (
                <div
                  key={c.value}
                  role="button"
                  tabIndex={0}
                  aria-pressed={isSelected}
                  onClick={() => onSelectCombo?.(c.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelectCombo?.(c.value); } }}
                  className={`${cardBase} p-3 md:p-4 ${isSelected ? cardSelected : ''}`}
                >
                  {isSelected && renderCheck()}
                  <div className="flex items-center justify-center gap-1.5">
                    {c.parts.map((part, i) => (
                      <span key={part} className="flex items-center gap-1.5">
                        <span
                          className="inline-block w-6 h-6 md:w-8 md:h-8 rounded-full border border-gray-300 shadow-inner"
                          style={{ background: METAL_SWATCH[part] || '#ddd' }}
                          aria-hidden
                        />
                        <span className="text-[10px] md:text-xs text-gray-600">{METAL_SHORT[part] || part}</span>
                        {i === 0 && <span className="text-gray-400 text-xs mx-0.5">+</span>}
                      </span>
                    ))}
                  </div>
                  {showPrices && (
                    <p className="text-center text-gray-600 text-[10px] md:text-sm mt-1.5">{formatPrice(c.price)}</p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Karat / purity variants */}
      {variants.length > 0 && (
        <div className="max-w-2xl mx-auto mb-4 md:mb-6">
          {hasCombos && (
            <p className="text-center text-gray-700 text-xs md:text-sm font-semibold uppercase tracking-wide mb-2 md:mb-3">
              {variantLabel}
            </p>
          )}
          <div className="grid grid-cols-3 md:grid-cols-4 gap-2 md:gap-3">
            {variants.map((v) => {
              const isSelected = selectedKarat === v.value;
              return (
                <div
                  key={v.value}
                  role="button"
                  tabIndex={0}
                  aria-pressed={isSelected}
                  onClick={() => onSelectKarat(v.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelectKarat(v.value); } }}
                  className={`${cardBase} p-3 md:p-5 text-center ${isSelected ? cardSelected : ''}`}
                >
                  {isSelected && renderCheck()}
                  <p className="font-bold text-gray-900 text-base md:text-xl leading-tight">{v.name}</p>
                  {showPrices && (
                    <p className="text-gray-600 text-[10px] md:text-sm mt-0.5 md:mt-1">{formatPrice(v.price)}</p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex justify-center">
        <Button
          variant="secondary"
          onClick={onBack}
          className="bg-black text-white hover:bg-gray-900 px-6 md:px-8 border border-black"
        >
          Back
        </Button>
      </div>
    </div>
  );
};
