import { useState } from 'react';
import { Eye } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { StepHeader } from './StepHeader';
import { RingSizeGuideDialog } from '../RingSizeGuideDialog';
import { RING_SIZE_OPTIONS_US } from '@/lib/ring-size-guide';

interface RingSizeDetailsStepProps {
  size: string;
  otherRequest: string;
  onSizeSelect: (size: string) => void;
  onOtherRequestChange: (value: string) => void;
  hidePriceNote?: boolean;
}

/** 24k Carat Jewelers final step: Ring size (US) + additional details, no band width. */
export const RingSizeDetailsStep = ({
  size,
  otherRequest,
  onSizeSelect,
  onOtherRequestChange,
  hidePriceNote = false,
}: RingSizeDetailsStepProps) => {
  const [guideOpen, setGuideOpen] = useState(false);

  return (
    <div className="p-3 md:p-6 space-y-3 md:space-y-5 max-w-2xl mx-auto">
      <StepHeader description="Ring size and final details" />

      <div className="space-y-1.5 md:space-y-2">
        <div className="flex items-center justify-between gap-2">
          <Label className="text-[11px] md:text-sm font-semibold">Ring Size (US)</Label>
          <button
            type="button"
            onClick={() => setGuideOpen(true)}
            aria-label="Find your ring size"
            title="Find your ring size"
            className="inline-flex items-center gap-1.5 text-[11px] md:text-sm text-accent hover:opacity-80 transition-opacity"
          >
            <Eye className="w-4 h-4 md:w-[18px] md:h-[18px]" />
            <span className="underline underline-offset-2">Not sure, find out</span>
          </button>
        </div>
        <div className="grid grid-cols-6 md:grid-cols-7 gap-1.5 md:gap-2">
          {RING_SIZE_OPTIONS_US.map((s) => {
            const isSelected = size === s;
            return (
              <button
                key={s}
                type="button"
                aria-pressed={isSelected}
                onClick={() => onSizeSelect(isSelected ? '' : s)}
                className={`h-8 md:h-10 border text-[11px] md:text-sm font-medium transition-all ${
                  isSelected
                    ? 'border-accent bg-accent/15 text-accent'
                    : 'border-border bg-card hover:border-accent/50 text-foreground'
                }`}
              >
                {s}
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-1 md:space-y-2">
        <Label className="text-[11px] md:text-sm font-semibold">Additional Details</Label>
        <Textarea
          placeholder="Add any special requests or preferences..."
          value={otherRequest}
          onChange={(e) => onOtherRequestChange(e.target.value.slice(0, 500))}
          className="min-h-[60px] md:min-h-[100px] resize-none text-xs md:text-sm text-foreground placeholder:text-muted-foreground border border-input bg-card focus-visible:border-accent"
        />
        <p className="text-[9px] md:text-[10px] text-muted-foreground text-right">{otherRequest.length}/500</p>
      </div>

      {!hidePriceNote && (
        <p className="text-[9px] md:text-[10px] text-muted-foreground text-center italic">
          * Prices may vary based on current gold market rates.
        </p>
      )}

      <RingSizeGuideDialog
        open={guideOpen}
        onOpenChange={setGuideOpen}
        selectedSize={size}
        onSelectSize={onSizeSelect}
      />
    </div>
  );
};
