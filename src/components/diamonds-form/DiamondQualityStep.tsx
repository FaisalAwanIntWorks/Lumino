import { Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useDiamondFormOptions } from '@/hooks/useDiamondFormOptions';
import { getDiamondFormImageUrl } from '@/lib/diamond-form-cdn';
import { DEFAULT_DTT_STEP_HEADINGS } from './step-headings';
import { DiamondOptionImage } from './DiamondOptionImage';
import { DiamondStepSpinner } from './DiamondStepSpinner';
import { getCurrencySymbol } from '@/lib/pricing-utils';

interface DiamondQualityStepProps {
  selected: string | null;
  onSelect: (quality: string) => void;
  onBack: () => void;
  showPrices?: boolean;
  clientId?: string | null;
  title?: string;
  subtitle?: string;
  currency?: string;
}

export const DiamondQualityStep = ({ selected, onSelect, onBack, showPrices = true, clientId, title, subtitle, currency = 'USD' }: DiamondQualityStepProps) => {
  const { data: options = [], isLoading } = useDiamondFormOptions('diamond_quality_options', clientId);
  const titleText = title || DEFAULT_DTT_STEP_HEADINGS.quality.title;
  const subText = subtitle || DEFAULT_DTT_STEP_HEADINGS.quality.subtitle;

  const sym = getCurrencySymbol(currency);
  const formatPrice = (price: number) => {
    if (price === 0) return `+${sym}0`;
    return `+${sym}${price.toLocaleString()}`;
  };

  if (isLoading) {
    return (
      <div className="min-h-[100dvh] md:min-h-[500px] bg-[#EDE8E3] rounded-lg flex items-center justify-center">
        <DiamondStepSpinner />
      </div>
    );
  }

  return (
    <div className="bg-[#EDE8E3] rounded-lg p-4 md:p-10 relative min-h-[100dvh] md:min-h-0">
      <div className="text-center mb-4 md:mb-8">
        <h2 className="text-lg md:text-3xl font-bold text-gray-900 mb-1 md:mb-2">
          {titleText}
        </h2>
        {subText && (
          <p className="text-gray-600 text-xs md:text-base">
            {subText}
          </p>
        )}
      </div>

      <div className="grid grid-cols-3 md:grid-cols-3 gap-2 md:gap-3 max-w-xl mx-auto mb-4 md:mb-6">
        {options.map((quality) => {
          const isSelected = selected === quality.option_value;
          const imageUrl = quality.image_url || getDiamondFormImageUrl('diamond_quality_options', quality.option_value);
          
          return (
            <div
              key={quality.id}
              onClick={() => onSelect(quality.option_value)}
              className={`
                relative bg-white rounded-lg overflow-hidden cursor-pointer 
                transition-all duration-200 hover:shadow-lg
                ${isSelected ? 'ring-2 ring-gray-400 shadow-lg' : ''}
              `}
            >
              {isSelected && (
                <div className="absolute top-1.5 right-1.5 md:top-3 md:right-3 w-5 h-5 md:w-6 md:h-6 bg-gray-800 rounded-full flex items-center justify-center border-2 border-white z-10">
                  <Check className="w-2.5 h-2.5 md:w-3 md:h-3 text-white" />
                </div>
              )}
              
              <DiamondOptionImage
                src={imageUrl}
                alt={quality.name}
                wrapperClassName="aspect-[4/3] md:aspect-[4/3] overflow-hidden flex items-center justify-center"
                imgClassName="w-[150%] h-[150%] md:w-[150%] md:h-[150%] object-cover"
              />
              
              <div className="p-1.5 md:p-3 text-center bg-white">
                <p className="font-medium text-gray-800 text-[10px] md:text-base">
                  {quality.name}{showPrices ? ` (${formatPrice(quality.price)})` : ''}
                </p>
              </div>
            </div>
          );
        })}
      </div>

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
