import { Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useDiamondFormOptions } from '@/hooks/useDiamondFormOptions';
import { getDiamondFormImageUrl } from '@/lib/diamond-form-cdn';
import { DEFAULT_DTT_STEP_HEADINGS } from './step-headings';
import { DiamondOptionImage } from './DiamondOptionImage';
import { DiamondStepSpinner } from './DiamondStepSpinner';
import { getCurrencySymbol } from '@/lib/pricing-utils';

interface DiamondBandWidthStepProps {
  selected: string[];
  onSelect: (widths: string[]) => void;
  onBack: () => void;
  showPrices?: boolean;
  clientId?: string | null;
  title?: string;
  subtitle?: string;
  currency?: string;
}

export const DiamondBandWidthStep = ({ selected, onSelect, onBack, showPrices = true, clientId, title, subtitle, currency = 'USD' }: DiamondBandWidthStepProps) => {
  const { data: options = [], isLoading } = useDiamondFormOptions('band_width_options', clientId);
  const titleText = title || DEFAULT_DTT_STEP_HEADINGS.band_width.title;
  const subText = subtitle || DEFAULT_DTT_STEP_HEADINGS.band_width.subtitle;

  const sym = getCurrencySymbol(currency);
  const formatPrice = (price: number) => {
    if (price === 0) return `+${sym}0`;
    return `+${sym}${price.toLocaleString()}`;
  };

  const handleSelect = (value: string) => {
    onSelect([value]);
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
      <div className="text-center mb-2">
        <h2 className="text-lg md:text-3xl font-bold text-gray-900 mb-1 md:mb-2">
          {titleText}
        </h2>
        {subText && (
          <p className="text-gray-600 text-xs md:text-base">
            {subText}
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 md:gap-6 max-w-2xl mx-auto mb-4 md:mb-8 mt-3 md:mt-6">
        {options.map((width) => {
          const isSelected = selected.includes(width.option_value);
          const imageUrl = width.image_url || getDiamondFormImageUrl('band_width_options', width.option_value);
          
          return (
            <div
              key={width.id}
              onClick={() => handleSelect(width.option_value)}
              className={`
                relative bg-white rounded-lg overflow-hidden cursor-pointer 
                transition-all duration-200 hover:shadow-lg
                ${isSelected ? 'ring-4 ring-gray-400 shadow-lg' : ''}
              `}
            >
              {isSelected && (
                <div className="absolute top-2 right-2 md:top-3 md:right-3 w-5 h-5 md:w-6 md:h-6 bg-gray-800 rounded-full flex items-center justify-center border-2 border-white z-10">
                  <Check className="w-3 h-3 md:w-4 md:h-4 text-white" />
                </div>
              )}
              
              <DiamondOptionImage
                src={imageUrl}
                alt={width.name}
                wrapperClassName="aspect-[4/3] md:aspect-square bg-gray-100 flex items-center justify-center p-2 md:p-3"
                imgClassName="w-full h-full object-contain"
              />
              
              <div className="p-2 md:p-4 text-center bg-white">
                <p className="font-semibold text-gray-800 text-xs md:text-base">
                  {width.name}{showPrices ? ` (${formatPrice(width.price)})` : ''}
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
