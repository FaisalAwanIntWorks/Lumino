import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { StepHeader } from './StepHeader';
import { useState } from 'react';
import { Info } from 'lucide-react';
import { BandWidthInfoDialog } from '../BandWidthInfoDialog';
import { useWidgetTheme } from '@/contexts/WidgetThemeContext';

const BAND_WIDTHS = ['2mm', '2.5mm', '3mm', '3.5mm', '4mm', '4.5mm+'];

interface DetailsStepProps {
  bandWidth: string;
  otherRequest: string;
  onUpdate: (data: {
    bandWidth: string;
    otherRequest: string;
  }) => void;
}

export const DetailsStep = ({ 
  bandWidth,
  otherRequest,
  onUpdate 
}: DetailsStepProps) => {
  const { theme } = useWidgetTheme();
  const isModern = theme === 'modern';
  const isTwentyFourK = theme === 'twentyfourk';
  const [infoDialogOpen, setInfoDialogOpen] = useState(false);

  const handleBandWidthChange = (width: string) => {
    onUpdate({ bandWidth: width, otherRequest });
  };

  const handleOtherRequestChange = (value: string) => {
    onUpdate({ bandWidth, otherRequest: value });
  };

  return (
    <div className="p-3 md:p-6 space-y-2 md:space-y-5 max-w-2xl mx-auto">
      <StepHeader 
        description="Final details to complete your design"
      />

      {/* Band Width Selection */}
      <div className="space-y-1 md:space-y-2">
        <div className="flex items-center gap-1.5 md:gap-2">
          <Label className="text-[10px] md:text-sm font-semibold">Band Width</Label>
          <button
            type="button"
            onClick={() => setInfoDialogOpen(true)}
            className="p-0.5 rounded-full hover:bg-white/10 transition-colors"
            aria-label="Band width information"
          >
            <Info className="w-3 h-3 md:w-4 md:h-4 text-muted-foreground" />
          </button>
        </div>
        <div className="flex flex-wrap gap-1.5 md:gap-2">
          {BAND_WIDTHS.map((width) => {
            const isSelected = bandWidth === width;
            const modernSelectedStyle = isModern && isSelected
              ? {
                  borderColor: 'hsl(var(--client-accent))',
                  backgroundColor: 'hsl(var(--client-accent) / 0.15)',
                  color: 'hsl(var(--client-accent))',
                }
              : undefined;
            return (
              <button
                key={width}
                type="button"
                onClick={() => handleBandWidthChange(width)}
                style={modernSelectedStyle}
                className={`px-2.5 py-1 md:px-4 md:py-2 border text-[10px] md:text-sm font-medium transition-all ${
                  isSelected
                    ? (isModern ? '' : 'border-accent bg-accent/15 text-accent')
                    : isTwentyFourK
                      ? 'border-border bg-card hover:border-accent/50 text-foreground'
                      : 'border-white/15 hover:border-accent/40 text-foreground'
                }`}
              >
                {width}
              </button>
            );
          })}
        </div>
      </div>

      {/* Any Other Request */}
      <div className="space-y-1 md:space-y-2">
        <Label className="text-[10px] md:text-sm font-semibold">Any Other Request</Label>
        <Textarea
          placeholder="Add any special requests or preferences..."
          value={otherRequest}
          onChange={(e) => handleOtherRequestChange(e.target.value.slice(0, 500))}
          className={`min-h-[50px] md:min-h-[100px] resize-none text-xs md:text-sm text-foreground placeholder:text-muted-foreground border focus-visible:border-accent ${
            isTwentyFourK ? 'border-input bg-card' : 'border-white/15 bg-transparent'
          }`}
        />
        <p className="text-[8px] md:text-[10px] text-muted-foreground text-right">{otherRequest.length}/500</p>
      </div>

      {/* Disclaimer */}
      <p className="text-[8px] md:text-[10px] text-muted-foreground text-center italic">
        * Prices may vary based on current gold market rates.
      </p>

      <BandWidthInfoDialog open={infoDialogOpen} onOpenChange={setInfoDialogOpen} />
    </div>
  );
};
