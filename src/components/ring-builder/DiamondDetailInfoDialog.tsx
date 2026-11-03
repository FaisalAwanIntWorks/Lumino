import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { ClientDiamondPreset } from '@/hooks/useClientDiamondPresets';
import { ShapeIcon } from '@/components/common/ShapeIcon';
import { useWidgetTheme } from '@/contexts/WidgetThemeContext';

interface DiamondDetailInfoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  preset: ClientDiamondPreset | null;
  selectedShape: string | null;
  onSelectDiamond?: () => void;
  currency?: string;
  hidePrice?: boolean;
}

// Educational content maps

const colorDescriptions: Record<string, string> = {
  D: 'D is the highest colour grade, meaning the diamond is completely colourless. These exceptionally rare stones allow maximum light to pass through, producing unmatched brilliance and fire.',
  E: 'E colour diamonds are virtually colourless. Only a trained gemologist can detect the minutest traces of colour under controlled conditions. To the naked eye, they appear identical to D grade.',
  F: 'F colour diamonds are also in the "colourless" category. They contain minute traces of colour detectable only by an expert gemologist, making them an excellent value within the top tier.',
  G: 'G colour is the top of the "near-colourless" range. Any colour present is virtually undetectable when the diamond is mounted, offering outstanding appearance at a more accessible price point.',
  H: 'H colour diamonds are near-colourless with a very slight warm tint that is difficult to perceive face-up. They represent excellent value, as the colour is essentially invisible once set in jewellery.',
  I: 'I colour diamonds show a very slight warmth that may be faintly detectable face-up. When mounted, especially in yellow or rose gold, any warmth blends naturally with the metal tone.',
  J: 'J colour diamonds have a faint warm tone. This warmth can complement yellow and rose gold settings beautifully, and they offer significant value while remaining eye-clean in many styles.',
  K: 'K colour diamonds display a noticeable warm tint. They pair exceptionally well with vintage-inspired settings and warm-toned metals, offering distinctive character and excellent value.',
};

const clarityDescriptions: Record<string, string> = {
  FL: 'Flawless — No inclusions or blemishes visible under 10× magnification. The rarest clarity grade, representing less than 1% of all gem-quality diamonds.',
  IF: 'Internally Flawless — No inclusions visible under 10× magnification, with only insignificant surface blemishes. Exceptionally rare and highly prized by collectors.',
  VVS1: 'Very, Very Slightly Included 1 — Contains minute inclusions so small they are difficult even for a skilled grader to see under 10× magnification. Eye-clean with outstanding transparency.',
  VVS2: 'Very, Very Slightly Included 2 — Contains minute inclusions visible only under 10× magnification with effort. Virtually identical to VVS1 to the naked eye and represents superb quality.',
  VS1: 'Very Slightly Included 1 — Contains minor inclusions that range from difficult to somewhat easy to see under 10× magnification. Eye-clean in virtually all cases, offering exceptional value.',
  VS2: 'Very Slightly Included 2 — Contains minor inclusions that are somewhat easily identified under 10× magnification but are typically eye-clean. A popular choice balancing quality and value.',
  SI1: 'Slightly Included 1 — Contains noticeable inclusions under 10× magnification and may be eye-visible upon close inspection. Often still eye-clean, especially in smaller carat sizes.',
  SI2: 'Slightly Included 2 — Contains inclusions easily identified under 10× magnification and may be visible to the naked eye. Careful selection can still yield beautiful stones.',
  I1: 'Included 1 — Contains inclusions that are obvious under 10× magnification and may be visible to the unaided eye. These can affect brilliance but offer the most accessible pricing.',
  I2: 'Included 2 — Contains obvious inclusions visible to the naked eye that may affect transparency and brilliance. The most budget-friendly option for those prioritising size.',
};

const cutDescriptions: Record<string, string> = {
  Excellent: 'Excellent cut maximises the diamond\'s fire, brilliance, and scintillation. Light enters and reflects back through the top with virtually no leakage, creating the most spectacular visual performance.',
  'Very Good': 'Very Good cut reflects nearly as much light as Excellent, with only slight deviations in proportions. These diamonds offer outstanding brilliance at a more accessible price point.',
  Good: 'Good cut captures most of the diamond\'s potential light return. While slightly less brilliant than higher grades, these diamonds offer solid beauty and represent excellent value.',
  Fair: 'Fair cut allows a noticeable amount of light to escape through the sides or bottom. While still attractive, the reduced brilliance is visible compared to higher cut grades.',
  Poor: 'Poor cut allows significant light leakage, resulting in noticeably less brilliance and fire. These diamonds may appear dull or glassy compared to better-cut stones.',
};

const fluorescenceDescriptions: Record<string, string> = {
  None: 'This diamond has no fluorescence, meaning it will not emit any visible glow under ultraviolet light. This is the most common preference and ensures consistent appearance in all lighting.',
  Faint: 'Faint fluorescence produces a very slight glow under UV light, virtually undetectable in normal conditions. It has no impact on the diamond\'s visual appearance or value.',
  Medium: 'Medium fluorescence creates a noticeable glow under UV light. In some cases, it can make lower-colour diamonds appear whiter in sunlight, which can be a desirable effect.',
  Strong: 'Strong fluorescence produces a clearly visible glow under UV light. In rare cases it can create a slightly hazy or oily appearance, though it may also enhance perceived whiteness.',
  'Very Strong': 'Very Strong fluorescence creates an intense glow under UV light. This can occasionally affect the diamond\'s transparency, though some buyers appreciate the unique characteristic.',
};

export function DiamondDetailInfoDialog({
  open,
  onOpenChange,
  preset,
  selectedShape,
  onSelectDiamond,
  currency = 'USD',
  hidePrice = false,
}: DiamondDetailInfoDialogProps) {
  const { theme } = useWidgetTheme();
  if (!open || !preset) return null;

  const shapeName = selectedShape ? selectedShape.charAt(0).toUpperCase() + selectedShape.slice(1).toLowerCase() : '';
  const stoneLabel = preset.stone_type === 'natural' ? 'NATURAL DIAMOND' : 'LAB GROWN DIAMOND';
  const iconVariant = theme === 'luxury' ? 'white-bg' : 'transparent';

  const specParts = [
    shapeName.toUpperCase(),
    `${preset.carat_value} CARAT`,
    `${preset.color} COLOUR`,
    `${preset.clarity} CLARITY`,
  ];
  if (preset.cut_grade) specParts.push(`CUT ${preset.cut_grade.toUpperCase()}`);
  const specsLine = specParts.join('  |  ');

  const price = preset.custom_price ?? preset.base_price;
  const formatPrice = (p: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency, minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(p);

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-start justify-center md:pl-[50%]" onClick={() => onOpenChange(false)}>
      <div className="jewlx-info-backdrop absolute inset-0 bg-black/60" />
      <div
        className="relative w-full h-full overflow-y-auto bg-background"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={() => onOpenChange(false)}
          className="absolute top-4 right-4 z-10 p-1 rounded-full hover:bg-white/10 transition-colors"
        >
          <X className="w-5 h-5 text-foreground" />
        </button>

        <div className="px-6 py-8 space-y-6 max-w-lg mx-auto">
          {/* Top section */}
          <div className="flex flex-col items-center text-center space-y-3">
            {selectedShape && (
              <ShapeIcon shapeId={selectedShape} size="xl" variant={iconVariant} />
            )}
            <p className="text-xs tracking-[0.2em] text-muted-foreground font-medium">{stoneLabel}</p>
            <p className="text-[10px] leading-relaxed tracking-[0.12em] text-muted-foreground">{specsLine}</p>
            {!hidePrice && <p className="text-lg font-semibold text-foreground">{formatPrice(price)}</p>}
          </div>

          {/* Select button */}
          {onSelectDiamond && (
            <button
              onClick={() => {
                onSelectDiamond();
                onOpenChange(false);
              }}
              className="w-full py-3 text-sm font-semibold tracking-wider bg-foreground text-background hover:opacity-90 transition-opacity"
            >
              SELECT THIS DIAMOND
            </button>
          )}

          {/* Divider */}
          <div className="border-t border-white/15" />

          {/* Attribute sections */}
          <div className="space-y-6 text-left">
            {/* Carat */}
            <div className="space-y-2">
              <h3 className="text-xs font-bold tracking-[0.15em] text-foreground">CARAT: {preset.carat_value}</h3>
              <p className="text-xs leading-relaxed text-muted-foreground">
                Carat refers to the weight of the diamond, not its size. One carat equals 0.2 grams. A {preset.carat_value}-carat diamond offers a balanced combination of visual presence and brilliance. As carat weight increases, the diamond becomes rarer and more valuable, though the relationship between carat and apparent size is not linear.
              </p>
            </div>

            {/* Colour */}
            <div className="space-y-2">
              <h3 className="text-xs font-bold tracking-[0.15em] text-foreground">COLOUR: {preset.color}</h3>
              <p className="text-xs leading-relaxed text-muted-foreground">
                {colorDescriptions[preset.color] || `Grade ${preset.color} represents a specific position on the diamond colour scale, which ranges from D (colourless) to Z (light yellow or brown). The closer to colourless, the more rare and valuable the diamond.`}
              </p>
            </div>

            {/* Clarity */}
            <div className="space-y-2">
              <h3 className="text-xs font-bold tracking-[0.15em] text-foreground">CLARITY: {preset.clarity}</h3>
              <p className="text-xs leading-relaxed text-muted-foreground">
                {clarityDescriptions[preset.clarity] || `${preset.clarity} clarity indicates the presence and visibility of natural inclusions within the diamond, evaluated under 10× magnification. Higher clarity grades indicate fewer and less visible inclusions.`}
              </p>
            </div>

            {/* Cut - only if available */}
            {preset.cut_grade && (
              <div className="space-y-2">
                <h3 className="text-xs font-bold tracking-[0.15em] text-foreground">CUT: {preset.cut_grade.toUpperCase()}</h3>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {cutDescriptions[preset.cut_grade] || `The ${preset.cut_grade} cut grade describes how well the diamond's facets interact with light. Cut is widely considered the most important factor in a diamond's beauty, as it directly determines brilliance, fire, and scintillation.`}
                </p>
              </div>
            )}

            {/* Fluorescence - only if available */}
            {preset.fluorescence && (
              <div className="space-y-2">
                <h3 className="text-xs font-bold tracking-[0.15em] text-foreground">FLUORESCENCE: {preset.fluorescence.toUpperCase()}</h3>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {fluorescenceDescriptions[preset.fluorescence] || `${preset.fluorescence} fluorescence describes the diamond's tendency to emit a soft glow when exposed to ultraviolet (UV) light. This is a natural characteristic and varies from diamond to diamond.`}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  , document.body);
}
