import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useDiamondFormOptions } from '@/hooks/useDiamondFormOptions';
import { getDiamondFormImageUrl } from '@/lib/diamond-form-cdn';
import { DEFAULT_DTT_STEP_HEADINGS } from './step-headings';
import { DEFAULT_DTT_HIGHLIGHT_COLOR } from '@/hooks/useClientDttFormConfig';
import { DiamondOptionImage } from './DiamondOptionImage';
import { DiamondStepSpinner } from './DiamondStepSpinner';
import { getCurrencySymbol } from '@/lib/pricing-utils';
import { Check } from 'lucide-react';

interface DiamondPersonalizationStepProps {
  selected: string[];
  onSelect: (features: string[]) => void;
  onNext: () => void;
  onBack: () => void;
  showPrices?: boolean;
  clientId?: string | null;
  title?: string;
  subtitle?: string;
  currency?: string;
}

export const DiamondPersonalizationStep = ({ selected, onSelect, onNext, onBack, showPrices = true, clientId, title, subtitle, currency = 'USD' }: DiamondPersonalizationStepProps) => {
  const { data: options = [], isLoading } = useDiamondFormOptions('personalization_options', clientId);
  const titleText = title || DEFAULT_DTT_STEP_HEADINGS.personalization.title;
  const subText = subtitle || DEFAULT_DTT_STEP_HEADINGS.personalization.subtitle;

  const handleToggle = (optionValue: string) => {
    if (selected.includes(optionValue)) {
      onSelect(selected.filter(id => id !== optionValue));
    } else {
      onSelect([...selected, optionValue]);
    }
  };

  const handleNext = () => {
    if (selected.length === 0) {
      onSelect(['none']);
    }
    onNext();
  };

  const sym = getCurrencySymbol(currency);
  const formatPrice = (price: number) => {
    if (price === 0) return `+${sym}0`;
    return `+${sym}${price.toLocaleString()}`;
  };

  if (isLoading) {
    return (
      <Card className="w-full bg-[#EDE8E3] border-none shadow-2xl min-h-[100dvh] md:min-h-0">
        <CardContent className="p-4 md:p-8 flex items-center justify-center min-h-[100dvh] md:min-h-[500px]">
          <DiamondStepSpinner />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full bg-[#EDE8E3] border-none shadow-2xl min-h-[100dvh] md:min-h-0">
      <CardContent className="p-4 md:p-8">
        <div className="text-center mb-3 md:mb-6">
          <h2 className="text-lg md:text-3xl font-bold text-gray-900">
            {titleText}
          </h2>
          {subText && (
            <p className="text-gray-600 text-xs md:text-base mt-1 md:mt-2">{subText}</p>
          )}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-4 mb-4 md:mb-8">
          {options.map((option) => {
            const isSelected = selected.includes(option.option_value);
            const imageUrl = option.image_url || getDiamondFormImageUrl('personalization_options', option.option_value);
            
            return (
              <button
                key={option.id}
                onClick={() => handleToggle(option.option_value)}
                aria-pressed={isSelected}
                data-qe-personalization-selected={isSelected ? 'true' : 'false'}
                className={`
                  relative p-2 md:p-4 rounded-lg transition-all duration-200 text-center
                  ${isSelected
                    ? 'bg-white'
                    : 'bg-white/95 hover:scale-105'
                  }
                `}
                // Selected = light grey card (no border ring, no tick). Inline so it
                // wins over the themed card colour. The class list must keep
                // "bg-white" so the global action-button styling skips this card.
                style={isSelected ? { backgroundColor: `var(--dtt-highlight, ${DEFAULT_DTT_HIGHLIGHT_COLOR})` } : undefined}
              >
                {isSelected && (
                  <span className="qe-personalization-check absolute right-2 top-2 z-10 hidden h-6 w-6 items-center justify-center rounded-full" aria-hidden="true">
                    <Check className="h-3.5 w-3.5" strokeWidth={3} />
                  </span>
                )}
                
                <DiamondOptionImage
                  src={imageUrl}
                  alt={option.name}
                  wrapperClassName="w-full aspect-[4/3] md:aspect-square mb-1.5 md:mb-3 flex items-center justify-center bg-gray-100 rounded-lg overflow-hidden"
                  imgClassName="w-full h-full object-contain"
                />
                
                <p className="text-[10px] md:text-sm font-medium text-gray-800 leading-tight">
                  {option.name}
                </p>
                {showPrices && (
                  <p className="text-[10px] md:text-sm text-gray-600 font-semibold mt-0.5 md:mt-1">
                    ({formatPrice(option.price)})
                  </p>
                )}
              </button>
            );
          })}
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
