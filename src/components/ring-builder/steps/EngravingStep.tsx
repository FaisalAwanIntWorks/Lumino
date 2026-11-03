import { useState } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { StepHeader } from './StepHeader';
import { RingSizeGuideDialog } from '../RingSizeGuideDialog';
import { MOCK_SIZES } from '@/data/ring-builder-mock';
import { Info, Eye } from 'lucide-react';
import { useWidgetTheme } from '@/contexts/WidgetThemeContext';

interface EngravingStepProps {
  enabled: boolean;
  text: string;
  bandWidth: string;
  otherRequest: string;
  size: string;
  onUpdate: (data: {
    enabled: boolean;
    text: string;
    bandWidth: string;
    otherRequest: string;
  }) => void;
  onSizeSelect: (size: string) => void;
  hideRingSize?: boolean;
}

export const EngravingStep = ({ 
  enabled, 
  text, 
  bandWidth,
  otherRequest,
  size,
  onUpdate,
  onSizeSelect,
  hideRingSize = false,
}: EngravingStepProps) => {
  const { theme } = useWidgetTheme();
  const [guideOpen, setGuideOpen] = useState(false);
  const isModern = theme === 'modern';
  const isTwentyFourK = theme === 'twentyfourk';
  const maxLength = 20;
  const charCount = text.replace(/\s/g, '').length;

  const handleEngravingChange = (newEnabled: boolean, newText?: string) => {
    onUpdate({
      enabled: newEnabled,
      text: newText ?? text,
      bandWidth,
      otherRequest,
    });
  };

  return (
    <div className="p-3 md:p-6 space-y-2 md:space-y-4 max-w-2xl mx-auto">
      <StepHeader 
        description="Add a personal touch to your ring"
      />

      {/* Engraving Option */}
      <div className={`flex items-center space-x-2 md:space-x-3 p-2.5 md:p-5 border transition-all ${
        isTwentyFourK ? 'border-border hover:border-accent/50 bg-card' : 'border-white/15 hover:border-white/30 bg-card/40 backdrop-blur-xl'
      }`}>
        <Checkbox
          id="engraving"
          checked={enabled}
          onCheckedChange={(checked) => handleEngravingChange(!!checked)}
          className="h-4 w-4 md:h-5 md:w-5 data-[state=checked]:bg-foreground data-[state=checked]:border-foreground data-[state=checked]:text-background"
        />
        <Label
          htmlFor="engraving"
          className="text-[10px] md:text-base font-semibold leading-none cursor-pointer flex items-center gap-1.5 md:gap-2"
        >
          Add Ring Engraving
          <span className="text-[8px] md:text-xs text-foreground font-bold uppercase tracking-wider">Complimentary</span>
        </Label>
      </div>

      {enabled && (
        <div className="space-y-1.5 md:space-y-4 animate-fade-in">
          <Input
            placeholder="Add your engraving text here"
            value={text}
            onChange={(e) => {
              const newText = e.target.value;
              if (newText.replace(/\s/g, '').length <= maxLength) {
                handleEngravingChange(enabled, newText);
              }
            }}
            className={`text-xs md:text-sm text-foreground placeholder:text-muted-foreground border focus-visible:border-accent ${
              isTwentyFourK ? 'border-input bg-card' : 'border-white/15 bg-transparent'
            }`}
          />
          <div className="flex justify-between text-[8px] md:text-[10px]">
            <span className="text-muted-foreground">Character limit does not include spaces</span>
            <span className={`font-semibold ${charCount >= maxLength ? 'text-foreground' : 'text-muted-foreground'}`}>
              {charCount}/{maxLength}
            </span>
          </div>
        </div>
      )}

      {!hideRingSize && (
        <div className={`space-y-1 md:space-y-2 pt-2 md:pt-3 border-t ${isTwentyFourK ? 'border-border' : 'border-white/15'}`}>
          <div className="flex items-center justify-between gap-2">
            <Label className="text-[10px] md:text-sm font-semibold">Ring Size</Label>
            <button
              type="button"
              onClick={() => setGuideOpen(true)}
              aria-label="Find your ring size"
              title="Find your ring size"
              className={`inline-flex items-center gap-1.5 text-[10px] md:text-sm transition-opacity hover:opacity-80 ${
                isTwentyFourK ? 'text-accent' : 'text-foreground/80'
              }`}
              style={isModern ? { color: 'hsl(var(--client-accent))' } : undefined}
            >
              <Eye className="w-4 h-4 md:w-[18px] md:h-[18px]" />
              <span className="underline underline-offset-2">Find your size</span>
            </button>
          </div>
          <div className="grid grid-cols-5 md:grid-cols-4 gap-1.5 md:gap-2">
            {MOCK_SIZES.map((s) => {
              const isSelected = size === s;
              const modernSelectedStyle = isModern && isSelected
                ? {
                    backgroundColor: 'hsl(var(--client-accent))',
                    borderColor: 'hsl(var(--client-accent))',
                    color: 'hsl(var(--client-accent-foreground, 0 0% 100%))',
                  }
                : undefined;
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => onSizeSelect(s)}
                  style={modernSelectedStyle}
                  className={`h-8 md:h-11 rounded-none border transition-all duration-200 text-[10px] md:text-sm font-semibold ${
                    isSelected
                      ? (isModern
                          ? 'shadow-[0_8px_24px_hsl(var(--client-accent)/0.25)] -translate-y-0.5'
                          : 'bg-foreground text-background border-foreground shadow-[0_8px_24px_hsl(var(--foreground)/0.18)] -translate-y-0.5')
                      : isTwentyFourK
                        ? 'bg-card text-foreground border-border hover:border-accent/50 hover:-translate-y-0.5'
                        : 'bg-transparent text-foreground border-white/15 hover:border-white/30 hover:-translate-y-0.5'
                  }`}
                  aria-pressed={isSelected}
                >
                  {s}
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-1.5 md:gap-2 mt-2">
            <Info className="w-3 h-3 md:w-4 md:h-4 text-muted-foreground" />
            <span className="text-[8px] md:text-xs text-muted-foreground">If between sizes, go larger. Wide bands need half size up.</span>
          </div>

          <RingSizeGuideDialog
            open={guideOpen}
            onOpenChange={setGuideOpen}
            selectedSize={size}
            onSelectSize={onSizeSelect}
          />
        </div>
      )}
    </div>
  );
};
