import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { DiamondShape } from '@/pages/client/DiamondsForm';
import { useDiamondFormOptions } from '@/hooks/useDiamondFormOptions';
import { getDiamondFormImageUrl } from '@/lib/diamond-form-cdn';
import { DEFAULT_DTT_STEP_HEADINGS } from './step-headings';
import { DiamondOptionImage } from './DiamondOptionImage';
import { DiamondStepSpinner } from './DiamondStepSpinner';

interface DiamondShapeStepProps {
  selected: DiamondShape;
  onSelect: (shape: DiamondShape) => void;
  onBack: () => void;
  clientId?: string | null;
  title?: string;
  subtitle?: string;
}

export function DiamondShapeStep({ selected, onSelect, onBack, clientId, title, subtitle }: DiamondShapeStepProps) {
  const { data: options = [], isLoading } = useDiamondFormOptions('diamond_shape_options', clientId);
  const titleText = title || DEFAULT_DTT_STEP_HEADINGS.shape.title;
  const subText = subtitle || DEFAULT_DTT_STEP_HEADINGS.shape.subtitle;

  if (isLoading) {
    return (
      <div className="relative overflow-hidden rounded-2xl bg-[#EDE8E3] min-h-[100dvh] md:min-h-[600px] flex items-center justify-center">
        <DiamondStepSpinner />
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden rounded-2xl bg-[#EDE8E3] min-h-[100dvh] md:min-h-0 flex flex-col items-center p-4 md:p-10">
      <h2 className={cn("text-lg md:text-3xl font-bold text-gray-900 text-center", subText ? "mb-1 md:mb-2" : "mb-3 md:mb-8")}>
        {titleText}
      </h2>
      {subText && (
        <p className="text-gray-600 text-xs md:text-base text-center mb-3 md:mb-8">
          {subText}
        </p>
      )}

      <div className="grid grid-cols-3 sm:grid-cols-3 md:grid-cols-5 gap-2 md:gap-2.5 w-full max-w-2xl mb-4 md:mb-6">
        {options.map((shape) => {
          const isSelected = selected === shape.option_value;
          const imageUrl = shape.image_url || getDiamondFormImageUrl('diamond_shape_options', shape.option_value);

          return (
            <button
              key={shape.id}
              onClick={() => onSelect(shape.option_value)}
              className={cn(
                "relative bg-white rounded-lg overflow-hidden flex flex-col items-center transition-all hover:shadow-xl cursor-pointer group",
                isSelected && "ring-4 ring-gray-400/50"
              )}
            >
              {isSelected && (
                <div className="absolute top-1.5 right-1.5 md:top-2 md:right-2 w-4 h-4 md:w-5 md:h-5 rounded-full bg-gray-800 flex items-center justify-center z-10">
                  <div className="w-2 h-2 md:w-2.5 md:h-2.5 rounded-full bg-white" />
                </div>
              )}

              <DiamondOptionImage
                src={imageUrl}
                alt={shape.name}
                wrapperClassName="w-full aspect-[4/3] md:aspect-[4/3] overflow-hidden flex items-center justify-center"
                imgClassName="w-full h-full object-contain scale-[1.5] md:scale-[1.5]"
              />

              <span className="text-gray-800 font-medium text-[10px] md:text-sm text-center leading-tight py-1.5 md:py-2 w-full px-1 break-words">
                {shape.name}
              </span>
            </button>
          );
        })}
      </div>

      <Button
        variant="secondary"
        onClick={onBack}
        className="bg-black text-white hover:bg-gray-900 px-6 md:px-8 border border-black mt-auto"
      >
        Back
      </Button>
    </div>
  );
}
