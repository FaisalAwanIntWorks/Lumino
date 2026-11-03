import { Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DEFAULT_DTT_STEP_HEADINGS } from './step-headings';
import { getEnabledTimelineOptions, type DttTimelineOption } from '@/lib/dtt-timeline-options';

interface DiamondTimelineStepProps {
  selected: string | null;
  onSelect: (timeline: string) => void;
  onBack: () => void;
  showPrices?: boolean;
  currency?: string;
  title?: string;
  subtitle?: string;
  /** Client's saved timeline choices; missing/empty shows the built-in ones. */
  options?: DttTimelineOption[] | null;
}

export const DiamondTimelineStep = ({ selected, onSelect, onBack, showPrices = true, currency = 'USD', title, subtitle, options }: DiamondTimelineStepProps) => {
  const titleText = title || DEFAULT_DTT_STEP_HEADINGS.timeline.title;
  const subText = subtitle || DEFAULT_DTT_STEP_HEADINGS.timeline.subtitle;
  const timelineOptions = getEnabledTimelineOptions(options);

  const formatPrice = (price: number) => {
    const sym = new Intl.NumberFormat('en-US', { style: 'currency', currency, minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(price);
    return `+${sym}`;
  };

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

      <div className="grid grid-cols-2 md:grid-cols-2 gap-2 md:gap-4 max-w-2xl mx-auto mb-4 md:mb-8">
        {timelineOptions.map((option) => {
          const isSelected = selected === option.value;
          
          return (
            <div
              key={option.value}
              onClick={() => onSelect(option.value)}
              className={`
                relative bg-white rounded-full py-3 px-4 md:py-4 md:px-6 cursor-pointer 
                transition-all duration-200 hover:shadow-lg text-center
                ${isSelected ? 'ring-2 ring-gray-400 shadow-lg' : ''}
              `}
            >
              {isSelected && (
                <div className="absolute top-1/2 right-3 md:right-4 -translate-y-1/2 w-4 h-4 md:w-5 md:h-5 bg-gray-800 rounded-full flex items-center justify-center border-2 border-white">
                  <Check className="w-2.5 h-2.5 md:w-3 md:h-3 text-white" />
                </div>
              )}
              
              <p className="font-medium text-gray-800 text-xs md:text-base pr-4 md:pr-0">
                {option.label}{showPrices ? ` (${formatPrice(option.price)})` : ''}
              </p>
            </div>
          );
        })}
      </div>

      <div className="flex justify-center">
        <Button
          variant="secondary"
          onClick={onBack}
          className="bg-black text-white hover:bg-gray-900 px-6 md:px-8 rounded-full border border-black"
        >
          Back
        </Button>
      </div>
    </div>
  );
};
