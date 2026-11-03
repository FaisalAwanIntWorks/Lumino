import { useState, useMemo, useRef, useEffect } from 'react';
import { FormWizardShell, type WizardStep } from '@/components/form-wizard/FormWizardShell';
import { StepHeading } from '@/components/form-wizard/StepHeading';
import { WizardOptionGrid } from '@/components/form-wizard/WizardOptionGrid';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Info, Diamond, Check, Eye } from 'lucide-react';
import { useRingConfiguration } from '@/hooks/useRingConfiguration';
import { StyleOption, ShankOption, MetalOption, ShapeOption, Stone } from '@/types/ring-builder';
import { ClientCaratOption } from '@/hooks/useClientCaratOptions';
import { ClientDiamondPreset } from '@/hooks/useClientDiamondPresets';
import { getDiamondShapeIcon } from '@/lib/diamond-shape-icons';
import { fallbackToPngOnError } from '@/lib/webp-image-fallback';
import { MOCK_SIZES } from '@/data/ring-builder-mock';
import { StoneInfoDialog } from './StoneInfoDialog';
import { DiamondDetailInfoDialog } from './DiamondDetailInfoDialog';
import { MOCK_NATURAL_STONES, MOCK_LAB_STONES } from '@/data/ring-builder-mock';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import type { ClientRingFormConfig } from '@/hooks/useClientRingFormConfig';
import { CaratViewerDialog } from './CaratViewerDialog';
import { useCaratSizeImages } from '@/hooks/useCaratSizeImages';

// --- Types ---
interface WizardRingBuilderProps {
  clientId?: string;
  catalogOptions: {
    styles: StyleOption[];
    shanks: ShankOption[];
    metals: MetalOption[];
    shapes: ShapeOption[];
    caratOptions: ClientCaratOption[];
    diamondPresets: ClientDiamondPreset[];
  };
  branding?: {
    primaryColor?: string;
    secondaryColor?: string;
    themeColors?: any;
  };
  ringConfig: ReturnType<typeof useRingConfiguration>;
  ringFormConfig?: ClientRingFormConfig | null;
  onAddToCart: () => void;
  pricingMode?: string;
  depositAmount?: number;
}

// --- Band widths ---
const BAND_WIDTHS = ['2mm', '2.5mm', '3mm', '3.5mm', '4mm', '4.5mm+'];

// --- Theme helper ---
function useWizardTheme(branding?: WizardRingBuilderProps['branding']) {
  return {
    bg: '#0a0a0a',
    font: '#ffffff',
    accent: branding?.primaryColor || '#77bb41',
    submitBg: branding?.primaryColor || undefined,
    submitText: '#ffffff',
  };
}

// --- Helper to convert title ---
const toTitleCase = (value: string) =>
  value.split('-').map(w => w ? w.charAt(0).toUpperCase() + w.slice(1) : w).join(' ');

export function WizardRingBuilder({
  clientId,
  catalogOptions,
  branding,
  ringConfig,
  ringFormConfig,
  onAddToCart,
  pricingMode,
  depositAmount = 0,
}: WizardRingBuilderProps) {
  const theme = useWizardTheme(branding);
  const {
    configuration,
    currentStep,
    updateStyle,
    updateShank,
    updateMetal,
    updateShape,
    updateCaratRange,
    updateStone,
    updateEngraving,
    updateSize,
    calculatePrice,
    canAdvanceStep,
    goToNextStep,
    goToPreviousStep,
    goToStep,
  } = ringConfig;

  const [caratViewerOpen, setCaratViewerOpen] = useState(false);
  const [caratViewerInitialValue, setCaratViewerInitialValue] = useState(0.5);
  const { getCaratImage } = useCaratSizeImages();

  const handleViewCarat = (caratValue: number) => {
    setCaratViewerInitialValue(caratValue);
    setCaratViewerOpen(true);
  };

  // Auto-advance timer
  const autoAdvanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoAdvance = () => {
    if (autoAdvanceTimer.current) clearTimeout(autoAdvanceTimer.current);
    autoAdvanceTimer.current = setTimeout(() => {
      goToNextStep();
    }, 900);
  };
  useEffect(() => {
    return () => { if (autoAdvanceTimer.current) clearTimeout(autoAdvanceTimer.current); };
  }, []);

  // Stone dialog state
  const [infoDialogOpen, setInfoDialogOpen] = useState(false);
  const [infoStoneType, setInfoStoneType] = useState<'natural' | 'lab' | null>(null);
  const [detailPreset, setDetailPreset] = useState<ClientDiamondPreset | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [expandedType, setExpandedType] = useState<'natural' | 'lab' | null>(null);

  // Format price — WizardRingBuilder is only used internally, no embed/currency context yet
  const formatPrice = (price: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(price);

  // --- Stone logic ---
  // configuration.caratRange is the bucket start (e.g. 0.5 covers 0.50–0.99).
  const filteredPresets = useMemo(() => {
    if (!configuration.shape || configuration.caratRange == null || catalogOptions.diamondPresets.length === 0) return [];
    const bucketStart = Number(configuration.caratRange);
    const bucketEnd = bucketStart + 0.5; // exclusive
    return catalogOptions.diamondPresets.filter(p =>
      p.shape_id === configuration.shape &&
      p.carat_value >= bucketStart &&
      p.carat_value < bucketEnd
    );
  }, [catalogOptions.diamondPresets, configuration.shape, configuration.caratRange]);

  const naturalOptions = useMemo(() => filteredPresets.filter(p => p.stone_type === 'natural'), [filteredPresets]);
  const labOptions = useMemo(() => filteredPresets.filter(p => p.stone_type === 'lab'), [filteredPresets]);

  const presetToStone = (preset: ClientDiamondPreset): Stone => ({
    id: preset.id,
    type: preset.stone_type,
    price: preset.custom_price ?? preset.base_price,
    carat: preset.carat_value,
    color: preset.color,
    clarity: preset.clarity,
  });

  const handleTypeClick = (type: 'natural' | 'lab') => {
    setExpandedType(type);
    const options = type === 'natural' ? naturalOptions : labOptions;
    if (options.length > 0) {
      updateStone(presetToStone(options[0]));
    } else {
      updateStone(type === 'natural' ? MOCK_NATURAL_STONES[0] : MOCK_LAB_STONES[0]);
    }
  };

  const expandedOptions = useMemo(() => {
    if (!expandedType) return [];
    return expandedType === 'natural' ? naturalOptions : labOptions;
  }, [expandedType, naturalOptions, labOptions]);

  const selectedStoneType: 'natural' | 'lab' | null = (() => {
    if (!configuration.stone) return null;
    if (naturalOptions.some(s => s.id === configuration.stone?.id)) return 'natural';
    if (labOptions.some(s => s.id === configuration.stone?.id)) return 'lab';
    return null;
  })();

  const shapeIcon = configuration.shape ? getDiamondShapeIcon(configuration.shape) : null;

  // --- Build Steps ---
  const steps: WizardStep[] = [];

  // Step 1: Style
  steps.push({
    key: 'style',
    label: 'STYLE',
    content: (
      <div className="space-y-6">
        <StepHeading preText="CHOOSE YOUR" highlightText="STYLE" subtitle="Select the setting style for your ring" accentColor={theme.accent} fontColor={theme.font} />
        <WizardOptionGrid
          options={catalogOptions.styles.map(s => ({ value: s.id, label: s.name }))}
          selectedValue={configuration.style || ''}
          onSelect={(v) => { updateStyle(v); autoAdvance(); }}
          columns={2}
          accentColor={theme.accent}
          fontColor={theme.font}
        />
      </div>
    ),
  });

  // Step 2: Shank / Band Type
  steps.push({
    key: 'shank',
    label: 'BAND',
    content: (
      <div className="space-y-6">
        <StepHeading preText="SELECT YOUR" highlightText="BAND" subtitle="Choose the band type for your ring" accentColor={theme.accent} fontColor={theme.font} />
        <WizardOptionGrid
          options={catalogOptions.shanks.map(s => ({ value: s.id, label: s.name }))}
          selectedValue={configuration.shank || ''}
          onSelect={(v) => { updateShank(v); autoAdvance(); }}
          columns={2}
          accentColor={theme.accent}
          fontColor={theme.font}
        />
      </div>
    ),
  });

  // Step 3: Metal
  steps.push({
    key: 'metal',
    label: 'METAL',
    content: (
      <div className="space-y-6">
        <StepHeading preText="CHOOSE YOUR" highlightText="METAL" subtitle="Select the metal type and color" accentColor={theme.accent} fontColor={theme.font} />
        <WizardOptionGrid
          options={catalogOptions.metals.map(m => ({ value: m.id, label: m.name }))}
          selectedValue={configuration.metal || ''}
          onSelect={(v) => { updateMetal(v); autoAdvance(); }}
          columns={2}
          accentColor={theme.accent}
          fontColor={theme.font}
        />
      </div>
    ),
  });

  // Step 4: Shape
  steps.push({
    key: 'shape',
    label: 'SHAPE',
    content: (
      <div className="space-y-6">
        <StepHeading preText="SELECT DIAMOND" highlightText="SHAPE" subtitle="Choose the shape of your center stone" accentColor={theme.accent} fontColor={theme.font} />
        <WizardOptionGrid
          options={catalogOptions.shapes.map(s => ({ value: s.id, label: s.name }))}
          selectedValue={configuration.shape || ''}
          onSelect={(v) => { updateShape(v); autoAdvance(); }}
          columns={3}
          accentColor={theme.accent}
          fontColor={theme.font}
        />
      </div>
    ),
  });

  // Step 5: Carat
  steps.push({
    key: 'carat',
    label: 'CARAT',
    content: (
      <div className="space-y-6">
        <StepHeading preText="CHOOSE" highlightText="CARAT" subtitle="Select the carat weight for your diamond" accentColor={theme.accent} fontColor={theme.font} />
        <WizardOptionGrid
          options={catalogOptions.caratOptions
            .filter(c => c.is_enabled)
            .map(c => {
              const CARAT_RANGE_LABELS: Record<number, string> = { 0.5: '0.50 - 0.99', 1: '1.00 - 1.49', 1.5: '1.50 - 1.99', 2: '2.00 - 2.49', 2.5: '2.50 - 2.99', 3: '3.00 - 3.49', 3.5: '3.50 - 3.99', 4: '4.00 - 4.49', 4.5: '4.50 - 4.99', 5: '5.00 - 5.49', 5.5: '5.50 - 5.99', 6: '6.00 - 6.49', 6.5: '6.50 - 6.99', 7: '7.00 - 7.49', 7.5: '7.50 - 7.99', 8: '8.00 - 8.49' };
              const image = getCaratImage(configuration.shape, c.carat_value);
              return { value: String(c.carat_value), label: CARAT_RANGE_LABELS[c.carat_value] ?? c.display_name.replace(/carat/i, '').trim(), image };
            })}
          selectedValue={configuration.caratRange != null ? String(configuration.caratRange) : ''}
          onSelect={(v) => { updateCaratRange(Number(v)); autoAdvance(); }}
          columns={3}
          accentColor={theme.accent}
          fontColor={theme.font}
          renderExtra={(option) => (
            <button
              onClick={(e) => { e.stopPropagation(); handleViewCarat(Number(option.value)); }}
              className="absolute top-1.5 right-1.5 p-0.5 rounded-full opacity-60 hover:opacity-100 transition-opacity z-10"
              style={{ color: theme.accent }}
              aria-label="View carat on hand"
            >
              <Eye className="w-3.5 h-3.5" />
            </button>
          )}
        />
      </div>
    ),
  });

  // Step 6: Stone
  const hasNatural = naturalOptions.length > 0 || catalogOptions.diamondPresets.length === 0;
  const hasLab = labOptions.length > 0 || catalogOptions.diamondPresets.length === 0;

  steps.push({
    key: 'stone',
    label: 'STONE',
    content: (
      <div className="space-y-6">
        <StepHeading preText="SELECT YOUR" highlightText="STONE" subtitle="Choose between natural and lab-created" accentColor={theme.accent} fontColor={theme.font} />
        <div className="grid grid-cols-2 gap-3 px-4 md:px-8 max-w-lg mx-auto">
          {hasNatural && (
            <button
              type="button"
              onClick={() => handleTypeClick('natural')}
              className="relative p-4 rounded-xl border-2 transition-all duration-200 text-left"
              style={{
                backgroundColor: selectedStoneType === 'natural' ? `${theme.accent}20` : 'transparent',
                borderColor: selectedStoneType === 'natural' ? theme.accent : 'rgba(255,255,255,0.15)',
              }}
            >
              <div className="space-y-2">
                {shapeIcon ? (
                  <img src={shapeIcon} alt="diamond" className="w-12 h-12 object-contain" onError={fallbackToPngOnError} />
                ) : (
                  <Diamond className="w-10 h-10" style={{ color: theme.font }} />
                )}
                <div className="text-sm font-bold uppercase tracking-wide" style={{ color: theme.font }}>Natural</div>
                <p className="text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>
                  {naturalOptions.length > 0 ? `${naturalOptions[0].color} / ${naturalOptions[0].clarity}` : 'Traditional, mined diamond'}
                </p>
                {naturalOptions.length > 0 && (
                  <p className="text-sm font-semibold" style={{ color: theme.accent }}>
                    {formatPrice(naturalOptions[0].custom_price ?? naturalOptions[0].base_price)}
                  </p>
                )}
              </div>
            </button>
          )}
          {hasLab && (
            <button
              type="button"
              onClick={() => handleTypeClick('lab')}
              className="relative p-4 rounded-xl border-2 transition-all duration-200 text-left"
              style={{
                backgroundColor: selectedStoneType === 'lab' ? `${theme.accent}20` : 'transparent',
                borderColor: selectedStoneType === 'lab' ? theme.accent : 'rgba(255,255,255,0.15)',
              }}
            >
              <div className="space-y-2">
                {shapeIcon ? (
                  <img src={shapeIcon} alt="diamond" className="w-12 h-12 object-contain" onError={fallbackToPngOnError} />
                ) : (
                  <Diamond className="w-10 h-10" style={{ color: theme.font }} />
                )}
                <div className="text-sm font-bold uppercase tracking-wide" style={{ color: theme.font }}>Lab Created</div>
                <p className="text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>
                  {labOptions.length > 0 ? `${labOptions[0].color} / ${labOptions[0].clarity}` : 'Lab-grown, same chemistry'}
                </p>
                {labOptions.length > 0 && (
                  <p className="text-sm font-semibold" style={{ color: theme.accent }}>
                    {formatPrice(labOptions[0].custom_price ?? labOptions[0].base_price)}
                  </p>
                )}
              </div>
            </button>
          )}
        </div>

        {/* Expanded diamond list */}
        {expandedType && expandedOptions.length > 1 && (
          <div className="max-w-lg mx-auto px-4 md:px-8">
            <h3 className="text-sm font-semibold mb-2 text-center" style={{ color: `${theme.font}99` }}>
              Available {expandedType === 'natural' ? 'Natural' : 'Lab'} Diamonds
            </h3>
            <div className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.15)' }}>
              {expandedOptions.map((preset) => {
                const isChosen = configuration.stone?.id === preset.id;
                return (
                  <div
                    key={preset.id}
                    onClick={() => updateStone(presetToStone(preset))}
                    className="flex items-center justify-between p-3 cursor-pointer transition-all"
                    style={{
                      backgroundColor: isChosen ? 'rgba(255,255,255,0.06)' : 'transparent',
                      borderBottom: '1px solid rgba(255,255,255,0.1)',
                    }}
                  >
                    <div className="flex items-center gap-3">
                      {shapeIcon && <img src={shapeIcon} alt="shape" className="w-8 h-8 object-contain" onError={fallbackToPngOnError} />}
                      {Number.isFinite(preset.carat_value) && preset.carat_value > 0 && (
                        <span className="text-sm font-medium whitespace-nowrap" style={{ color: theme.font }}>{preset.carat_value} ct</span>
                      )}
                      <span className="text-sm font-medium" style={{ color: theme.font }}>{preset.color} Color</span>
                      <span className="text-sm" style={{ color: `${theme.font}80` }}>{preset.clarity}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold" style={{ color: theme.font }}>
                        {formatPrice(preset.custom_price ?? preset.base_price)}
                      </span>
                      {isChosen && <Check className="w-4 h-4" style={{ color: theme.accent }} />}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {catalogOptions.diamondPresets.length > 0 && filteredPresets.length === 0 && (
          <p className="text-center text-sm" style={{ color: `${theme.font}80` }}>
            No diamond options available for the selected shape and carat.
          </p>
        )}
      </div>
    ),
  });

  // Step 7: Engraving & Size
  const maxLength = 20;
  const charCount = configuration.engraving.text.replace(/\s/g, '').length;

  steps.push({
    key: 'personalize',
    label: 'PERSONALIZE',
    content: (
      <div className="space-y-6">
        <StepHeading preText="PERSONALIZE YOUR" highlightText="RING" subtitle="Add engraving and select your ring size" accentColor={theme.accent} fontColor={theme.font} />
        <div className="max-w-lg mx-auto w-full px-4 md:px-8 space-y-5">
          {/* Engraving toggle */}
          <div className="flex items-center space-x-3 p-4 rounded-xl" style={{ border: '1px solid rgba(255,255,255,0.15)' }}>
            <Checkbox
              id="wizard-engraving"
              checked={configuration.engraving.enabled}
              onCheckedChange={(checked) => updateEngraving({
                enabled: !!checked,
                text: configuration.engraving.text,
                bandWidth: configuration.engraving.bandWidth,
                otherRequest: configuration.engraving.otherRequest,
              })}
              className="h-5 w-5 border-white/30 data-[state=checked]:border-transparent"
              style={{ '--tw-ring-color': theme.accent } as any}
            />
            <Label htmlFor="wizard-engraving" className="text-sm font-semibold cursor-pointer" style={{ color: theme.font }}>
              Add Ring Engraving <span className="text-xs uppercase tracking-wider ml-1" style={{ color: theme.accent }}>Complimentary</span>
            </Label>
          </div>

          {configuration.engraving.enabled && (
            <div className="space-y-2">
              <Input
                placeholder="Enter your engraving text"
                value={configuration.engraving.text}
                onChange={(e) => {
                  const newText = e.target.value;
                  if (newText.replace(/\s/g, '').length <= maxLength) {
                    updateEngraving({ ...configuration.engraving, text: newText });
                  }
                }}
                className="bg-transparent border-2 rounded-xl text-sm"
                style={{ borderColor: 'rgba(255,255,255,0.15)', color: theme.font }}
              />
              <div className="flex justify-between text-xs" style={{ color: `${theme.font}60` }}>
                <span>Character limit does not include spaces</span>
                <span className="font-semibold">{charCount}/{maxLength}</span>
              </div>
            </div>
          )}

          {/* Ring Size */}
          <div className="space-y-3">
            <Label className="text-sm font-semibold uppercase tracking-wider" style={{ color: `${theme.font}99` }}>Ring Size</Label>
            <div className="grid grid-cols-5 gap-2">
              {MOCK_SIZES.map((s) => {
                const isSelected = configuration.size === s;
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => updateSize(s)}
                    className="h-10 rounded-xl text-sm font-semibold transition-all duration-200 border-2"
                    style={{
                      backgroundColor: isSelected ? theme.accent : 'transparent',
                      borderColor: isSelected ? theme.accent : 'rgba(255,255,255,0.15)',
                      color: isSelected ? '#fff' : theme.font,
                    }}
                  >
                    {s}
                  </button>
                );
              })}
            </div>
            <div className="flex items-center gap-2">
              <Info className="w-4 h-4" style={{ color: `${theme.font}60` }} />
              <span className="text-xs" style={{ color: `${theme.font}60` }}>If between sizes, go larger. Wide bands need half size up.</span>
            </div>
          </div>
        </div>
      </div>
    ),
  });

  // Step 8: Review
  const price = calculatePrice();

  // Build summary items
  const summaryItems = useMemo(() => {
    const items: { label: string; value: string }[] = [];
    if (configuration.style) {
      const opt = catalogOptions.styles.find(s => s.id === configuration.style);
      items.push({ label: 'Style', value: opt?.name || toTitleCase(configuration.style) });
    }
    if (configuration.shank) {
      const opt = catalogOptions.shanks.find(s => s.id === configuration.shank);
      items.push({ label: 'Band', value: opt?.name || toTitleCase(configuration.shank) });
    }
    if (configuration.metal) {
      const opt = catalogOptions.metals.find(m => m.id === configuration.metal);
      items.push({ label: 'Metal', value: opt?.name || toTitleCase(configuration.metal) });
    }
    if (configuration.shape) {
      const opt = catalogOptions.shapes.find(s => s.id === configuration.shape);
      items.push({ label: 'Shape', value: opt?.name || toTitleCase(configuration.shape) });
    }
    if (configuration.caratRange != null) {
      const opt = catalogOptions.caratOptions.find(c => c.carat_value === configuration.caratRange);
      items.push({ label: 'Carat', value: opt?.display_name || `${configuration.caratRange} ct` });
    }
    if (configuration.stone) {
      items.push({ label: 'Stone', value: `${configuration.stone.type === 'natural' ? 'Natural' : 'Lab'} — ${configuration.stone.color}/${configuration.stone.clarity}` });
    }
    if (configuration.size) items.push({ label: 'Size', value: configuration.size });
    if (configuration.engraving.enabled && configuration.engraving.text) {
      items.push({ label: 'Engraving', value: `"${configuration.engraving.text}"` });
    }
    return items;
  }, [configuration, catalogOptions]);

  steps.push({
    key: 'review',
    label: 'REVIEW',
    content: (
      <div className="space-y-6">
        <StepHeading preText="REVIEW &" highlightText="SUBMIT" subtitle="Review your custom ring design" accentColor={theme.accent} fontColor={theme.font} />
        <div className="max-w-lg mx-auto w-full px-4 md:px-8 space-y-5">
          {/* Summary */}
          <div className="space-y-2 p-4 rounded-xl" style={{ backgroundColor: 'rgba(255,255,255,0.05)' }}>
            {summaryItems.map((item) => (
              <div key={item.label} className="flex justify-between py-1.5" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                <span className="text-sm" style={{ color: `${theme.font}80` }}>{item.label}</span>
                <span className="text-sm font-semibold" style={{ color: theme.font }}>{item.value}</span>
              </div>
            ))}
            {price > 0 && (
              <div className="flex justify-between pt-3 mt-2" style={{ borderTop: '2px solid rgba(255,255,255,0.2)' }}>
                <span className="text-base font-bold" style={{ color: theme.font }}>Total</span>
                <span className="text-base font-bold" style={{ color: theme.accent }}>{formatPrice(price)}</span>
              </div>
            )}
          </div>

          {/* Band Width */}
          <div className="space-y-3">
            <Label className="text-sm font-semibold uppercase tracking-wider" style={{ color: `${theme.font}99` }}>Band Width</Label>
            <div className="flex flex-wrap gap-2">
              {BAND_WIDTHS.map((w) => (
                <button
                  key={w}
                  type="button"
                  onClick={() => updateEngraving({ ...configuration.engraving, bandWidth: w })}
                  className="px-4 py-2 rounded-xl text-sm font-medium transition-all border-2"
                  style={{
                    backgroundColor: configuration.engraving.bandWidth === w ? theme.accent : 'transparent',
                    borderColor: configuration.engraving.bandWidth === w ? theme.accent : 'rgba(255,255,255,0.15)',
                    color: configuration.engraving.bandWidth === w ? '#fff' : theme.font,
                  }}
                >
                  {w}
                </button>
              ))}
            </div>
          </div>

          {/* Other Request */}
          <div className="space-y-2">
            <Label className="text-sm font-semibold uppercase tracking-wider" style={{ color: `${theme.font}99` }}>Additional Notes</Label>
            <Textarea
              value={configuration.engraving.otherRequest}
              onChange={e => updateEngraving({ ...configuration.engraving, otherRequest: e.target.value.slice(0, 500) })}
              placeholder="Any special requests or preferences..."
              rows={3}
              maxLength={500}
              className="bg-transparent border-2 rounded-xl"
              style={{ borderColor: 'rgba(255,255,255,0.15)', color: theme.font }}
            />
          </div>

          <p className="text-xs text-center italic" style={{ color: `${theme.font}50` }}>
            * Prices may vary based on current gold market rates.
          </p>
        </div>
      </div>
    ),
  });

  // --- Navigation ---
  const isLastStep = currentStep === steps.length - 1;

  const isEstimates = pricingMode === 'estimates';

  const getNextLabel = () => {
    if (isLastStep) {
      if (isEstimates) {
        return depositAmount > 0
          ? `PAY ${formatPrice(depositAmount)} DEPOSIT`
          : 'COMPLETE REQUEST — NO DEPOSIT';
      }
      return `ADD TO CART — ${formatPrice(price)}`;

    }
    const nextStep = steps[currentStep + 1];
    if (isEstimates) {
      const prefix = currentStep < 5 ? 'STARTING AT' : 'ESTIMATE';
      return `${prefix} ${formatPrice(price)} · ${nextStep?.label} >`;
    }
    return `NEXT: ${nextStep?.label} >`;
  };

  const getSelectedLabel = () => {
    switch (currentStep) {
      case 0: return configuration.style ? `Style: ${toTitleCase(configuration.style)}` : undefined;
      case 1: return configuration.shank ? `Band: ${toTitleCase(configuration.shank)}` : undefined;
      case 2: {
        const m = catalogOptions.metals.find(m => m.id === configuration.metal);
        return m ? `Metal: ${m.name}` : undefined;
      }
      case 3: {
        const s = catalogOptions.shapes.find(s => s.id === configuration.shape);
        return s ? `Shape: ${s.name}` : undefined;
      }
      case 4: return configuration.caratRange != null ? `Carat: ${configuration.caratRange}` : undefined;
      case 5: return configuration.stone ? `Stone: ${configuration.stone.type === 'natural' ? 'Natural' : 'Lab'}` : undefined;
      default: return undefined;
    }
  };

  const handleNext = () => {
    if (isLastStep) {
      onAddToCart();
    } else {
      goToNextStep();
    }
  };

  const handleBack = () => {
    if (currentStep > 0) goToStep(currentStep - 1);
  };

  return (
    <>
      <FormWizardShell
        steps={steps}
        currentStep={currentStep}
        onNext={handleNext}
        onBack={handleBack}
        nextLabel={getNextLabel()
        }
        selectedLabel={getSelectedLabel()}
        isLastStep={isLastStep}
        canProceed={canAdvanceStep(currentStep)}
        backgroundColor={theme.bg}
        fontColor={theme.font}
        accentColor={theme.accent}
        submitButtonBg={theme.submitBg}
        submitButtonText={theme.submitText}
      />
      <StoneInfoDialog open={infoDialogOpen} onOpenChange={setInfoDialogOpen} stoneType={infoStoneType} />
      <DiamondDetailInfoDialog
        open={detailOpen}
        onOpenChange={setDetailOpen}
        preset={detailPreset}
        selectedShape={configuration.shape ?? null}
        onSelectDiamond={detailPreset ? () => updateStone(presetToStone(detailPreset)) : undefined}
      />
      <CaratViewerDialog
        open={caratViewerOpen}
        onOpenChange={setCaratViewerOpen}
        caratOptions={catalogOptions.caratOptions}
        availableCaratBuckets={catalogOptions.caratOptions.map((option) => option.carat_value)}
        initialCaratValue={caratViewerInitialValue}
        onSelectCarat={(v) => updateCaratRange(v as any)}
        configuration={configuration}
      />
    </>
  );
}
