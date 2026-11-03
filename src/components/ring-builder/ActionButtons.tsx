import { ChevronRight, Bookmark, ShoppingCart, Calendar } from 'lucide-react';
import { useWidgetTheme } from '@/contexts/WidgetThemeContext';
import { getCurrencySymbol } from '@/lib/pricing-utils';

interface ActionButtonsProps {
  productTitle?: string;
  price: number;
  currency?: string;
  onNext: () => void;
  onBookAppointment: () => void;
  onAIAssistant: () => void;
  onCompare: () => void;
  onSaveDesign: () => void;
  onAddToCart: () => void;
  canAdvance: boolean;
  isLastStep: boolean;
  showAIAssistant?: boolean;
  showComparison?: boolean;
  showSaveDesign?: boolean;
  pricingMode?: string;
  depositAmount?: number;
  currentStep?: number;
  /** Client setting: options auto-advance, so the "Next" label is dropped. */
  clickToContinue?: boolean;
  /** True when the current step is a pick-one step (auto-advances when clickToContinue). */
  autoAdvanceStep?: boolean;
}

export const ActionButtons = ({ 
  productTitle,
  price,
  currency = 'USD',
  onNext, 
  onBookAppointment,
  onAIAssistant,
  onSaveDesign,
  onAddToCart,
  canAdvance,
  isLastStep,
  showAIAssistant = true,
  showSaveDesign = true,
  pricingMode,
  depositAmount = 0,
  currentStep = 0,
  clickToContinue = true,
  autoAdvanceStep = false,
}: ActionButtonsProps) => {
  const { theme } = useWidgetTheme();
  const sym = getCurrencySymbol(currency);
  const isEstimates = pricingMode === 'estimates';
  const pricePrefix = isEstimates ? (currentStep < 5 ? 'Starting at ' : 'Estimate ') : '';
  // Click-to-Continue: pick-one steps advance on selection, so the button only
  // shows the price. Free-form steps (engraving/details) still need a press,
  // so they get "Continue" instead of "Next".
  const nextLabel: string | null = clickToContinue ? (autoAdvanceStep ? null : 'Continue') : 'Next';

  // UI Option 4: Elegant Gold
  if (theme === 'elegant') {
    return (
      <div className="border-t border-primary/20 bg-background">
        <div className="px-3 py-2 md:px-5 md:py-4">
          <div className="flex items-center gap-2">
            <button
              onClick={isLastStep ? onAddToCart : onNext}
              disabled={!canAdvance}
              className="flex-1 h-11 md:h-12 font-semibold rounded-lg shadow-sm hover:opacity-90 disabled:opacity-50 transition-all duration-200 flex items-center justify-center gap-2 text-sm"
              style={{ background: `hsl(var(--cta-bg, var(--primary)))`, color: `hsl(var(--cta-text, var(--primary-foreground)))` }}
            >
              {isLastStep ? (
                isEstimates ? (
                  <>
                    {depositAmount > 0 ? `Pay ${sym}${depositAmount.toLocaleString()} Deposit` : 'Complete Request — No Deposit'}
                    <span className="mx-1 text-white/50">|</span>
                    <ShoppingCart className="w-4 h-4" />
                    Add to Cart
                  </>
                ) : (
                  <>
                    {sym}{price.toLocaleString()}
                    <span className="mx-1 text-white/50">|</span>
                    <ShoppingCart className="w-4 h-4" />
                    Add to Cart
                  </>
                )

              ) : (
                <>
                 {pricePrefix}{sym}{price.toLocaleString()}
                  {nextLabel && (
                    <>
                      <span className="mx-1 text-white/50">|</span>
                      {nextLabel}
                      <ChevronRight className="w-4 h-4" />
                    </>
                  )}
                </>
              )}
            </button>
            {showSaveDesign && (
              <button
                onClick={onSaveDesign}
                className="h-11 md:h-12 w-11 md:w-12 border border-primary/30 rounded-lg bg-card hover:bg-primary/10 transition-all duration-200 flex items-center justify-center"
              >
                <Bookmark className="w-4 h-4 text-muted-foreground" />
              </button>
            )}
          </div>
          <div className="flex items-center justify-center gap-4 mt-2">
            <button
              onClick={onBookAppointment}
              className="text-xs text-muted-foreground hover:text-primary transition-colors flex items-center gap-1"
            >
              <Calendar className="w-3 h-3" />
              Book Consultation
            </button>
            {showAIAssistant && (
              <button
                onClick={onAIAssistant}
                className="text-xs text-muted-foreground hover:text-primary transition-colors flex items-center gap-1"
              >
                AI Help
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // UI Option 1: Luxury - 2x2 Grid Layout
  if (theme === 'luxury') {
    return (
      <div className="border-t border-white/15 bg-background/95 backdrop-blur-xl">
        <div className="px-2 py-1.5 md:px-5 md:py-4">
          <div
            className="border border-white/15 grid grid-rows-2"
            style={{ gridTemplateColumns: showSaveDesign || showAIAssistant ? '1fr 2fr' : '1fr' }}
          >
            {/* Top Left: Book */}
            <button
              onClick={onBookAppointment}
              className="h-8 md:h-10 border-r border-b border-white/15 bg-transparent text-foreground/90 hover:bg-foreground hover:text-background transition-all duration-200 text-sm font-medium flex items-center justify-center gap-1.5"
            >
              <Calendar className="w-3.5 h-3.5" />
              Book
            </button>

            {/* Top Right (spans 2 rows if JewlX Agent is hidden): Next/Add to Cart */}
            <button
              onClick={isLastStep ? onAddToCart : onNext}
              disabled={!canAdvance}
              className={`h-8 md:h-10 border-l border-white/15 font-semibold tracking-wide hover:opacity-90 disabled:opacity-50 transition-all duration-200 flex items-center justify-center gap-2 text-sm ${showAIAssistant ? 'border-b' : 'row-span-2 h-auto md:h-auto'}`}
              style={{ background: `hsl(var(--cta-bg, 0 0% 100%))`, color: `hsl(var(--cta-text, 0 0% 0%))` }}
            >
              {isLastStep ? (
                isEstimates ? (
                  <>
                    <ShoppingCart className="w-4 h-4" />
                    {depositAmount > 0 ? `Pay ${sym}${depositAmount.toLocaleString()} Deposit` : 'Complete Request — No Deposit'}
                  </>
                ) : (
                  <>
                    <ShoppingCart className="w-4 h-4" />
                    Add to Cart
                  </>
                )

              ) : (
                <>
                  {pricePrefix}{sym}{price.toLocaleString()}
                  {nextLabel && (
                    <>
                      <span className="mx-1 text-black/50">|</span>
                      {nextLabel}
                      <ChevronRight className="w-4 h-4" />
                    </>
                  )}
                </>
              )}
            </button>

            {/* Bottom Left: Save */}
            {showSaveDesign && (
              <button
                onClick={onSaveDesign}
                className="h-8 md:h-10 border-r border-white/15 bg-transparent text-foreground/90 hover:bg-foreground hover:text-background transition-all duration-200 flex items-center justify-center gap-1.5 text-sm font-medium"
              >
                <Bookmark className="w-3 h-3" />
                Save
              </button>
            )}

            {/* Bottom Right: JewlX Agent */}
            {showAIAssistant && (
              <button
                onClick={onAIAssistant}
                className="h-8 md:h-10 bg-transparent text-foreground/90 hover:bg-foreground hover:text-background transition-all duration-200 flex items-center justify-center gap-1.5 text-sm font-medium"
              >
                
                JewlX Agent
              </button>
            )}
          </div>

        </div>
      </div>
    );
  }

  // UI Option 2: Modern
  return (
    <div className="border-t border-border bg-background/95 backdrop-blur-xl">
        <div className="px-4 py-2 md:px-6 md:py-5">
        <div className="flex flex-col gap-2 md:gap-3 max-w-xl mx-auto">
          <button
            onClick={isLastStep ? onAddToCart : onNext}
            disabled={!canAdvance}
            className="w-full h-12 font-semibold rounded-lg shadow-sm hover:opacity-90 disabled:opacity-50 transition-all duration-200 flex items-center justify-center gap-2 text-sm"
            style={{ background: `hsl(var(--cta-bg, var(--primary)))`, color: `hsl(var(--cta-text, var(--primary-foreground)))` }}
          >
            {isLastStep ? (
              isEstimates ? (
                <>
                  <ShoppingCart className="w-4 h-4" />
                  {depositAmount > 0 ? `Pay ${sym}${depositAmount.toLocaleString()} Deposit` : 'Complete Request — No Deposit'}
                </>
              ) : (
                <>
                  <ShoppingCart className="w-4 h-4" />
                  Add to Cart - {sym}{price.toLocaleString()}
                </>
              )

            ) : (
              <>
                {pricePrefix}{sym}{price.toLocaleString()}
                {nextLabel && (
                  <>
                    <span className="mx-1 opacity-50">|</span>
                    {nextLabel}
                    <ChevronRight className="w-4 h-4" />
                  </>
                )}
              </>
            )}
          </button>

          <div className="flex items-center gap-2">
            <button
              onClick={onBookAppointment}
              className="flex-1 h-10 bg-muted text-foreground font-medium rounded-lg hover:bg-muted/80 transition-all duration-200 text-sm"
            >
              Book Consultation
            </button>

            {showSaveDesign && (
              <button
                onClick={onSaveDesign}
                className="h-10 px-4 bg-muted text-foreground font-medium rounded-lg hover:bg-muted/80 transition-all duration-200 flex items-center gap-1.5 text-sm"
              >
                <Bookmark className="w-4 h-4" />
                Save
              </button>
            )}

            {showAIAssistant && (
              <button
                onClick={onAIAssistant}
                className="h-10 px-4 bg-primary/10 text-primary font-medium rounded-lg hover:bg-primary/20 transition-all duration-200 flex items-center gap-1.5 text-sm"
              >
                
                AI Help
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
