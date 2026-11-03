import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { RotateCcw, Info } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { ThemeColorSet, THEME_COLOR_DEFAULTS, THEME_COLOR_LABELS } from '@/lib/theme-color-defaults';

interface ThemeColorEditorProps {
  theme: string;
  colors: ThemeColorSet;
  onChange: (colors: ThemeColorSet) => void;
}

const THEME_DISPLAY_NAMES: Record<string, string> = {
  luxury: 'Luxury (Option 1)',
  modern: 'Modern (Option 2)',
  chat: 'Chat-First (Option 3)',
  elegant: 'Elegant (Option 4)',
};

const COLOR_DESCRIPTIONS: Record<keyof ThemeColorSet, string> = {
  background: 'The main background color of your widget. This fills the entire configurator area behind all content.',
  text: 'The primary text color used for headings, labels, and body copy throughout the widget.',
  accent: 'Highlight color for active states, selected options, progress indicators, and decorative elements.',
  buttonFill: 'The background color of primary action buttons like "Next", "Add to Cart", and CTAs.',
  buttonText: 'The text color inside primary action buttons. Should contrast well with Button Fill for readability.',
};

export const ThemeColorEditor = ({ theme, colors, onChange }: ThemeColorEditorProps) => {
  const handleColorChange = (key: keyof ThemeColorSet, value: string) => {
    onChange({ ...colors, [key]: value });
  };

  const handleReset = () => {
    onChange({ ...THEME_COLOR_DEFAULTS[theme] });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-sm font-semibold">Theme Colors — {THEME_DISPLAY_NAMES[theme] || theme}</h4>
          <p className="text-xs text-muted-foreground">Customize the colors for the selected theme</p>
        </div>
        <Button variant="ghost" size="sm" onClick={handleReset} className="gap-1.5 text-xs">
          <RotateCcw className="h-3 w-3" />
          Reset
        </Button>
      </div>

      <TooltipProvider delayDuration={200}>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {THEME_COLOR_LABELS.map(({ key, label }) => (
            <div key={key}>
              <div className="flex items-center gap-1.5 mb-1">
                <Label className="text-xs">{label}</Label>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button type="button" className="inline-flex items-center justify-center rounded-full text-muted-foreground hover:text-foreground transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                      <Info className="h-3.5 w-3.5" />
                      <span className="sr-only">Info about {label}</span>
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-[220px] text-xs">
                    {COLOR_DESCRIPTIONS[key]}
                  </TooltipContent>
                </Tooltip>
              </div>
              <div className="flex gap-2">
                <Input
                  type="color"
                  value={colors[key]}
                  onChange={(e) => handleColorChange(key, e.target.value)}
                  className="w-10 h-9 p-1 cursor-pointer"
                />
                <Input
                  value={colors[key]}
                  onChange={(e) => handleColorChange(key, e.target.value)}
                  className="flex-1 text-xs font-mono"
                  maxLength={7}
                />
              </div>
            </div>
          ))}
        </div>
      </TooltipProvider>
    </div>
  );
};
