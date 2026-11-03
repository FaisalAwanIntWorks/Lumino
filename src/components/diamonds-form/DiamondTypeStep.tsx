import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { DiamondType } from '@/pages/client/DiamondsForm';
import { useDiamondFormOptions } from '@/hooks/useDiamondFormOptions';
import { getDiamondFormImageUrl } from '@/lib/diamond-form-cdn';
import { DEFAULT_DTT_STEP_HEADINGS } from './step-headings';
import { DiamondOptionImage } from './DiamondOptionImage';
import { DiamondStepSpinner } from './DiamondStepSpinner';

interface DiamondTypeStepProps {
  selected: DiamondType;
  onSelect: (type: DiamondType) => void;
  onBack: () => void;
  clientId?: string | null;
  title?: string;
  subtitle?: string;
}

export function DiamondTypeStep({ selected, onSelect, onBack, clientId, title, subtitle }: DiamondTypeStepProps) {
  const { data: options = [], isLoading } = useDiamondFormOptions('diamond_nature_options', clientId);
  const titleText = title || DEFAULT_DTT_STEP_HEADINGS.nature.title;
  const subText = subtitle || DEFAULT_DTT_STEP_HEADINGS.nature.subtitle;
  // With only a single diamond-nature option configured, the "natural or lab?"
  // question is meaningless, so the heading/sub-heading is hidden and the lone
  // option is shown on its own. (The client can still set a custom heading from
  // the Configure screen, which is honoured whenever there is more than one.)
  const showHeading = options.length > 1;

  if (isLoading) {
    return (
      <div className="relative overflow-hidden rounded-2xl bg-[#EDE8E3] min-h-[100dvh] md:min-h-[500px] flex items-center justify-center">
        <DiamondStepSpinner />
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden rounded-2xl bg-[#EDE8E3] min-h-[100dvh] md:min-h-0 flex flex-col items-center p-4 md:p-10">
      {showHeading && (
        <>
          <h2 className={cn("text-lg md:text-3xl font-bold text-gray-900 text-center", subText ? "mb-1 md:mb-2" : "mb-4 md:mb-12")}>
            {titleText}
          </h2>
          {subText && (
            <p className="text-gray-600 text-xs md:text-base text-center mb-4 md:mb-8">
              {subText}
            </p>
          )}
        </>
      )}

      <div className="grid grid-cols-2 md:grid-cols-2 gap-3 md:gap-4 w-full max-w-md mb-4 md:mb-8">
        {options.map((type) => {
          const isSelected = selected === type.option_value;
          const imageUrl = type.image_url || getDiamondFormImageUrl('diamond_nature_options', type.option_value);

          return (
            <button
              key={type.id}
              onClick={() => onSelect(type.option_value as DiamondType)}
              className={cn(
                "relative bg-white rounded-lg overflow-hidden flex flex-col items-center transition-all hover:shadow-xl cursor-pointer group",
                isSelected && "ring-4 ring-gray-400/50"
              )}
            >
              {isSelected && (
                <div className="absolute top-2 right-2 z-10 w-5 h-5 md:w-6 md:h-6 rounded-full bg-gray-800 flex items-center justify-center">
                  <div className="w-2.5 h-2.5 md:w-3 md:h-3 rounded-full bg-white" />
                </div>
              )}

              <DiamondOptionImage
                src={imageUrl}
                alt={type.name}
                wrapperClassName="w-full aspect-[3/2] md:aspect-[3/2] overflow-hidden"
                imgClassName="w-full h-full object-cover"
              />

              <span className="text-gray-800 font-semibold text-sm md:text-lg py-2 md:py-3">
                {type.name}
              </span>
            </button>
          );
        })}
      </div>

      <Button
        variant="secondary"
        onClick={onBack}
        className="bg-black text-white hover:bg-gray-900 px-6 md:px-8 border border-black"
      >
        Back
      </Button>
    </div>
  );
}
