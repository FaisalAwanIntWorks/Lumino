import { useState } from 'react';
import { Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useDiamondFormOptions } from '@/hooks/useDiamondFormOptions';
import { getDiamondFormImageUrl } from '@/lib/diamond-form-cdn';
import { DEFAULT_DTT_STEP_HEADINGS } from './step-headings';
import { DiamondOptionImage } from './DiamondOptionImage';
import { DiamondStepSpinner } from './DiamondStepSpinner';
import { getCurrencySymbol } from '@/lib/pricing-utils';
import {
  getEnabledMetalKaratVariants,
  getEnabledTwoToneCombos,
  toMetalPriceMap,
  type MetalKaratsConfig,
  type TwoToneCombosConfig,
} from '@/lib/dtt-metal-karats';
import { DiamondMetalKaratStep } from './DiamondMetalKaratStep';

interface DiamondMetalStepProps {
  selected: string | null;
  onSelect: (metal: string) => void;
  onBack: () => void;
  /**
   * Karat / purity variant picked for the selected metal. When the selected
   * metal has enabled variants, a second screen asks for the karat before
   * advancing (via `onNext`); metals without variants advance straight away.
   */
  selectedKarat?: string | null;
  onSelectKarat?: (karat: string) => void;
  /** Two Tone only: which two metals are combined (asked on the second screen). */
  selectedCombo?: string | null;
  onSelectCombo?: (combo: string) => void;
  onNext?: () => void;
  /** Per-client karat overrides (`form_content.metalKarats`). */
  karatConfig?: MetalKaratsConfig | null;
  /** Per-client Two Tone combination overrides (`form_content.twoToneCombos`). */
  comboConfig?: TwoToneCombosConfig | null;
  showPrices?: boolean;
  clientId?: string | null;
  title?: string;
  subtitle?: string;
  currency?: string;
}

// DTT-only hardcoded metal options (this component is exclusively used by DTT)
const DTT_METAL_OPTIONS = [
  { id: '1', option_value: '14k-yellow-gold', name: '14K Yellow Gold', price: 0, display_order: 1, image_url: null },
  { id: '2', option_value: '14k-white-gold', name: '14K White Gold', price: 0, display_order: 2, image_url: null },
  { id: '3', option_value: '18k-yellow-gold', name: '18K Yellow Gold', price: 400, display_order: 3, image_url: null },
  { id: '4', option_value: '18k-white-gold', name: '18K White Gold', price: 400, display_order: 4, image_url: null },
  { id: '5', option_value: '14k-rose-gold', name: '14K Rose Gold', price: 0, display_order: 5, image_url: null },
  { id: '6', option_value: 'platinum', name: 'Platinum', price: 650, display_order: 6, image_url: null },
  { id: '7', option_value: 'two-tone', name: 'Two Tone Ring', price: 500, display_order: 7, image_url: null },
];

export const DiamondMetalStep = ({ selected, onSelect, onBack, selectedKarat = null, onSelectKarat, selectedCombo = null, onSelectCombo, onNext, karatConfig, comboConfig, showPrices = true, clientId, title, subtitle, currency = 'USD' }: DiamondMetalStepProps) => {
  const { data: configuredOptions = [], isLoading } = useDiamondFormOptions('ring_metal_options', clientId);
  const options = clientId ? configuredOptions : DTT_METAL_OPTIONS;

  // Variants only exist for the client-configured (DB) metal set; the legacy
  // hardcoded DTT list has the karat baked into the option itself.
  const subStepsEnabled = !!clientId && !!onNext;
  const variantsFor = (metalValue: string) =>
    subStepsEnabled ? getEnabledMetalKaratVariants(metalValue, karatConfig) : [];
  // Combination prices default to the two metals' configured prices added
  // together, unless the client overrode a combination in Configure.
  const combosFor = (metalValue: string) =>
    subStepsEnabled && metalValue === 'two-tone' ? getEnabledTwoToneCombos(comboConfig, toMetalPriceMap(options)) : [];
  const needsSecondScreen = (metalValue: string) =>
    variantsFor(metalValue).length > 0 || combosFor(metalValue).length > 0;

  // 'metal' = the metal grid; 'karat' = the follow-up screen for the chosen
  // metal. When the visitor comes back from a later step we land on the
  // follow-up screen (it was the last thing they saw), otherwise on the grid.
  const [phase, setPhase] = useState<'metal' | 'karat'>(() =>
    selected && needsSecondScreen(selected) ? 'karat' : 'metal',
  );

  const handleSelectMetal = (metalValue: string) => {
    onSelect(metalValue);
    // No karat / combination choice for this metal → move on immediately
    // (original behaviour). Otherwise show the follow-up screen.
    if (needsSecondScreen(metalValue)) setPhase('karat');
    else onNext?.();
  };

  const selectedVariants = selected ? variantsFor(selected) : [];
  const selectedCombos = selected ? combosFor(selected) : [];

  // Advance once every required choice on the follow-up screen is made. The
  // handlers receive the value just tapped because parent state updates
  // asynchronously.
  const handleSelectKarat = (karatValue: string) => {
    onSelectKarat?.(karatValue);
    const comboDone = selectedCombos.length === 0 || !!selectedCombo;
    if (comboDone) onNext?.();
  };
  const handleSelectCombo = (comboValue: string) => {
    onSelectCombo?.(comboValue);
    const karatDone = selectedVariants.length === 0 || !!selectedKarat;
    if (karatDone) onNext?.();
  };
  const titleText = title || DEFAULT_DTT_STEP_HEADINGS.metal.title;
  const subText = subtitle || DEFAULT_DTT_STEP_HEADINGS.metal.subtitle;

  const sym = getCurrencySymbol(currency);
  const formatPrice = (price: number) => {
    if (price === 0) return `+${sym}0`;
    return `+${sym}${price.toLocaleString()}`;
  };


  const firstRow = options.slice(0, 4);
  const secondRow = options.slice(4);

  if (isLoading) {
    return (
      <div className="min-h-[100dvh] md:min-h-[500px] bg-[#EDE8E3] rounded-lg flex items-center justify-center">
        <DiamondStepSpinner />
      </div>
    );
  }

  if (phase === 'karat' && selected && needsSecondScreen(selected)) {
    const metalOpt = options.find(o => o.option_value === selected);
    return (
      <DiamondMetalKaratStep
        metalValue={selected}
        metalName={metalOpt?.name || selected}
        variants={selectedVariants}
        selectedKarat={selectedKarat}
        onSelectKarat={handleSelectKarat}
        combos={selectedCombos}
        selectedCombo={selectedCombo}
        onSelectCombo={handleSelectCombo}
        onBack={() => setPhase('metal')}
        showPrices={showPrices}
        currency={currency}
      />
    );
  }

  const renderCard = (metal: typeof options[0]) => {
    const isSelected = selected === metal.option_value;
    const imageUrl = metal.image_url || getDiamondFormImageUrl('ring_metal_options', metal.option_value);
    
    return (
      <div
        key={metal.id}
        onClick={() => handleSelectMetal(metal.option_value)}
        className={`
          relative bg-white rounded-lg overflow-hidden cursor-pointer 
          transition-all duration-200 hover:shadow-lg
          ${isSelected ? 'ring-2 ring-gray-400 shadow-lg' : ''}
        `}
      >
        {isSelected && (
          <div className="absolute top-1.5 right-1.5 md:top-2 md:right-2 w-4 h-4 md:w-5 md:h-5 bg-gray-800 rounded-full flex items-center justify-center border-2 border-white z-10">
            <Check className="w-2.5 h-2.5 md:w-3 md:h-3 text-white" />
          </div>
        )}
        
        <DiamondOptionImage
          src={imageUrl}
          alt={metal.name}
          wrapperClassName="aspect-[4/3] md:aspect-[4/3] bg-gray-50 flex items-center justify-center p-2 md:p-2"
          imgClassName="w-full h-full object-contain"
        />
        
        <div className="p-1.5 md:p-3 text-center bg-white flex items-center justify-center min-h-[2.3rem] md:min-h-[3.7rem]">
          <p className="font-medium text-gray-800 text-[10px] md:text-sm leading-tight">
            {metal.name}{showPrices ? ` (${formatPrice(metal.price)})` : ''}
          </p>
        </div>
      </div>
    );
  };

  return (
    <div className="bg-[#EDE8E3] rounded-lg p-4 md:p-10 relative min-h-[100dvh] md:min-h-0">
      <div className="text-center mb-3 md:mb-6">
        <h2 className="text-lg md:text-3xl font-bold text-gray-900 mb-1 md:mb-2">
          {titleText}
        </h2>
        {subText && (
          <p className="text-gray-600 text-xs md:text-base">
            {subText}
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3 max-w-2xl mx-auto mb-2 md:mb-4">
        {firstRow.map(renderCard)}
      </div>

      {secondRow.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3 max-w-2xl mx-auto mb-4 md:mb-4">
          {secondRow.map(renderCard)}
        </div>
      )}

      <div className="flex justify-center">
        <Button
          variant="secondary"
          onClick={onBack}
          className="bg-black text-white hover:bg-gray-900 px-6 md:px-8 border border-black"
        >
          Back
        </Button>
      </div>
    </div>
  );
};
