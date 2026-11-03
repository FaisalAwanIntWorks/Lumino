import { Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useDiamondFormOptions } from '@/hooks/useDiamondFormOptions';
import { getDiamondFormImageUrl } from '@/lib/diamond-form-cdn';
import { DEFAULT_DTT_STEP_HEADINGS } from './step-headings';
import { DiamondOptionImage } from './DiamondOptionImage';
import { DiamondStepSpinner } from './DiamondStepSpinner';

// Shapes that use premium pricing ($750/ct base, $375/0.5ct step)
const PREMIUM_SHAPES = ['colored-diamond', 'portuguese-cut', 'step-cut'];

const PREMIUM_PRICES: Record<string, number> = {
  '1ct': 750,
  '1.5ct': 1125,
  '2ct': 1500,
  '2.5ct': 1875,
  '3ct': 2250,
  '3.5ct': 2625,
  '4ct': 3000,
  '4.5ct': 3375,
  '5ct+': 3750,
};

interface DiamondSizeStepProps {
  selected: string | null;
  onSelect: (size: string) => void;
  onBack: () => void;
  showPrices?: boolean;
  selectedShape?: string | null;
  clientId?: string | null;
  title?: string;
  subtitle?: string;
}

export const DiamondSizeStep = ({ selected, onSelect, onBack, showPrices = false, selectedShape, clientId, title, subtitle }: DiamondSizeStepProps) => {
  const { data: options = [], isLoading } = useDiamondFormOptions('diamond_size_options', clientId);
  const usePremium = selectedShape ? PREMIUM_SHAPES.includes(selectedShape) : false;
  const titleText = title || DEFAULT_DTT_STEP_HEADINGS.size.title;
  const subText = subtitle || DEFAULT_DTT_STEP_HEADINGS.size.subtitle;

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

      <div className="grid grid-cols-3 gap-2 md:gap-3 max-w-xl mx-auto">
        {options.map((size) => {
          const isSelected = selected === size.option_value;
          const imageUrl = size.image_url || getDiamondFormImageUrl('diamond_size_options', size.option_value);
          
          return (
            <div
              key={size.id}
              onClick={() => onSelect(size.option_value)}
              className={`
                relative bg-white rounded-lg p-2 md:p-4 cursor-pointer 
                transition-all duration-200 hover:shadow-lg
                ${isSelected ? 'ring-2 ring-gray-400 shadow-lg' : ''}
              `}
            >
              {isSelected && (
                <div className="absolute top-1.5 right-1.5 md:top-3 md:right-3 w-5 h-5 md:w-6 md:h-6 bg-gray-800 rounded-full flex items-center justify-center border-2 border-white">
                  <Check className="w-2.5 h-2.5 md:w-3 md:h-3 text-white" />
                </div>
              )}
              
              <DiamondOptionImage
                src={imageUrl}
                alt={size.name}
                wrapperClassName="aspect-[4/3] md:aspect-[4/3] overflow-hidden flex items-center justify-center mb-1 md:mb-2"
                imgClassName="w-full h-full object-contain scale-[1.15] md:scale-[1.15]"
              />
              
              <p className="text-center font-semibold text-gray-800 text-xs md:text-base">
                {size.name}
              </p>
              {showPrices && (usePremium ? PREMIUM_PRICES[size.option_value] : size.price) > 0 && (
                <p className="text-center text-gray-500 text-[10px] md:text-sm">
                  ${(usePremium ? PREMIUM_PRICES[size.option_value] ?? size.price : size.price).toLocaleString()}
                </p>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex justify-center mt-4 md:mt-6">
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
