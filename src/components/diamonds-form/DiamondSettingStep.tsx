import { Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useDiamondFormOptions } from '@/hooks/useDiamondFormOptions';
import { getDiamondFormImageUrl } from '@/lib/diamond-form-cdn';
import { DEFAULT_DTT_STEP_HEADINGS } from './step-headings';
import { DiamondOptionImage } from './DiamondOptionImage';
import { DiamondStepSpinner } from './DiamondStepSpinner';

interface DiamondSettingStepProps {
  selected: string | null;
  onSelect: (setting: string) => void;
  onBack: () => void;
  showPrices?: boolean;
  clientId?: string | null;
  title?: string;
  subtitle?: string;
}

export const DiamondSettingStep = ({ selected, onSelect, onBack, showPrices = true, clientId, title, subtitle }: DiamondSettingStepProps) => {
  const { data: options = [], isLoading } = useDiamondFormOptions('ring_setting_options', clientId);
  const titleText = title || DEFAULT_DTT_STEP_HEADINGS.setting.title;
  const subText = subtitle || DEFAULT_DTT_STEP_HEADINGS.setting.subtitle;

  const formatPrice = (price: number) => `+$${price.toLocaleString()}`;

  if (isLoading) {
    return (
      <div className="min-h-[100dvh] md:min-h-[500px] bg-[#EDE8E3] rounded-lg flex items-center justify-center">
        <DiamondStepSpinner />
      </div>
    );
  }

  return (
    <div className="bg-[#EDE8E3] rounded-lg p-4 md:p-10 relative min-h-[100dvh] md:min-h-0">
      <div className="text-center mb-3 md:mb-6">
        <h2 className="text-lg md:text-3xl font-bold text-gray-900 mb-1 md:mb-2">
          {titleText}
        </h2>
        {subText && (
          <p className="text-gray-600 text-xs md:text-base">
            {subText}
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-4 max-w-5xl mx-auto mb-4 md:mb-8">
        {options.map((setting) => {
          const isSelected = selected === setting.option_value;
          const imageUrl = setting.image_url || getDiamondFormImageUrl('ring_setting_options', setting.option_value);
          
          return (
            <div
              key={setting.id}
              onClick={() => onSelect(setting.option_value)}
              className={`
                relative bg-white rounded-lg overflow-hidden cursor-pointer flex flex-col
                transition-all duration-200 hover:shadow-lg
                ${isSelected ? 'ring-2 ring-gray-400 shadow-lg' : ''}
              `}
            >
              {isSelected && (
                <div className="absolute top-1.5 right-1.5 md:top-2 md:right-2 w-4 h-4 md:w-5 md:h-5 bg-gray-800 rounded-full flex items-center justify-center border-2 border-white z-10">
                  <Check className="w-2.5 h-2.5 md:w-3 md:h-3 text-white" />
                </div>
              )}
              
              <DiamondOptionImage
                src={imageUrl}
                alt={setting.name}
                wrapperClassName="aspect-[4/3] md:aspect-square bg-gray-100 flex items-center justify-center p-2 md:p-3"
                imgClassName="w-full h-full object-contain"
              />
              
              {/* Grows to the card's bottom edge so a one-line name leaves no gap under its label box. */}
              <div className="flex-1 flex flex-col justify-center p-1.5 md:p-3 text-center bg-white">
                <p className="font-medium text-gray-800 text-[10px] md:text-sm leading-tight">
                  {setting.name}
                </p>
                {showPrices && (
                  <p className="text-gray-600 text-[10px] md:text-xs">
                    ({formatPrice(setting.price)})
                  </p>
                )}
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
