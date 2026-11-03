import { MOCK_SIZES } from '@/data/ring-builder-mock';
import { StepHeader } from './StepHeader';
import { Info } from 'lucide-react';

interface SizeStepProps {
  selected: string;
  onSelect: (size: string) => void;
}

export const SizeStep = ({ selected, onSelect }: SizeStepProps) => {
  return (
    <div className="p-2 md:p-4 space-y-2 md:space-y-4 max-w-2xl mx-auto">
      <StepHeader 
        title="Select Ring Size"
        description="Ensure the perfect fit"
      />

      <div className="grid grid-cols-5 md:grid-cols-4 gap-1.5 md:gap-2">
        {MOCK_SIZES.map((size) => {
          const isSelected = selected === size;
          return (
            <button
              key={size}
              type="button"
              onClick={() => onSelect(size)}
              className={`h-8 md:h-11 rounded-none border transition-all duration-200 text-[10px] md:text-sm font-semibold ${
                isSelected
                  ? 'bg-foreground text-background border-foreground shadow-[0_8px_24px_hsl(var(--foreground)/0.18)] -translate-y-0.5'
                  : 'bg-transparent text-foreground border-border/60 hover:border-border hover:-translate-y-0.5'
              }`}
              aria-pressed={isSelected}
            >
              {size}
            </button>
          );
        })}
      </div>

      <div className="space-y-1 md:space-y-2 pt-2 md:pt-3 border-t border-border/15">
        <div className="flex items-center gap-1.5 md:gap-2">
          <Info className="w-3 h-3 md:w-4 md:h-4 text-muted-foreground" />
          <h3 className="font-semibold text-[10px] md:text-sm">Sizing tips</h3>
        </div>
        <ul className="grid grid-cols-2 gap-x-2 md:gap-x-3 gap-y-0.5 md:gap-y-1 text-[8px] md:text-xs text-muted-foreground">
          <li className="flex items-start gap-1">
            <span className="text-muted-foreground font-bold">•</span>
            <span>Measure at end of day when warm</span>
          </li>
          <li className="flex items-start gap-1">
            <span className="text-muted-foreground font-bold">•</span>
            <span>If between sizes, go larger</span>
          </li>
          <li className="flex items-start gap-1">
            <span className="text-muted-foreground font-bold">•</span>
            <span>Wide bands need half size up</span>
          </li>
          <li className="flex items-start gap-1">
            <span className="text-muted-foreground font-bold">•</span>
            <span>Fingers smaller in cold weather</span>
          </li>
        </ul>
      </div>
    </div>
  );
};
