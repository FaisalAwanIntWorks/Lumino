// Unified bottom bar for the 24k Carat Jewelers Ring OS skin.
// White surface. Left: serif product title + "Powered by GEMIST" (gold).
// Right: white BOOK APPOINTMENT button + solid gold $X | NEXT button.

import { ArrowRight, ShoppingCart } from 'lucide-react';
import { getCurrencySymbol } from '@/lib/pricing-utils';

interface TwentyFourKBottomBarProps {
  productTitle: string;
  price: number;
  currency?: string;
  isLastStep: boolean;
  canAdvance: boolean;
  pricingMode?: string;
  depositAmount?: number;
  onNext: () => void;
  onAddToCart: () => void;
  onBookAppointment: () => void;
  /** Client setting: options auto-advance, so the "Next" label is dropped. */
  clickToContinue?: boolean;
  /** True when the current step is a pick-one step (auto-advances when clickToContinue). */
  autoAdvanceStep?: boolean;
  /** 24k natural path: no prices anywhere on the bar. */
  hidePrices?: boolean;
  /** Final button opens the contact form instead of the cart. */
  leadCapture?: boolean;
}

export const TwentyFourKBottomBar = ({
  productTitle,
  price,
  currency = 'USD',
  isLastStep,
  canAdvance,
  pricingMode,
  depositAmount = 0,
  onNext,
  onAddToCart,
  onBookAppointment,
  hidePrices = false,
  leadCapture = false,
}: TwentyFourKBottomBarProps) => {
  const sym = getCurrencySymbol(currency);
  const isEstimates = pricingMode === 'estimates';
  const pricePrefix = isEstimates && !isLastStep ? 'Starting at ' : '';
  const showDeposit = isLastStep && isEstimates && depositAmount >= 0;
  // 24k keeps an explicit action visible even when choosing an option also
  // auto-advances. This makes the price control read as a clear next action.
  const nextLabel = 'Next';

  return (
    <div className="border-t border-[#E5E5E5]" style={{ background: '#FFFFFF' }}>
      <div className="flex flex-col md:grid md:grid-cols-2 md:items-stretch w-full">
        {/* Left: product title only (no Powered by JewlX for 24k) */}
        <div className="hidden md:flex items-center justify-center px-5 lg:px-8 py-3 min-w-0">
          <span className="text-black text-sm lg:text-base font-serif tracking-wide truncate">
            {productTitle}
          </span>
        </div>

        {/* Mobile: compact product title only */}
        <div className="md:hidden px-4 pt-2 pb-1 flex items-center min-w-0">
          <span className="text-black text-xs font-serif tracking-wide truncate">
            {productTitle}
          </span>
        </div>

        {/* Action buttons */}
        <div className="grid grid-cols-2 items-stretch w-full min-w-0">
          <button
            onClick={onBookAppointment}
            className="min-w-0 min-h-[48px] h-12 md:h-14 px-2 md:px-4 border-t md:border-t-0 md:border-l border-[#E5E5E5] bg-white text-black text-[10px] lg:text-sm tracking-[0.08em] lg:tracking-[0.16em] font-medium uppercase whitespace-nowrap hover:bg-black/5 transition-colors"
          >
            <span className="md:hidden">Book Appt.</span>
            <span className="hidden md:inline">Book Appointment</span>
          </button>

          <button
            onClick={isLastStep ? onAddToCart : onNext}
            disabled={!canAdvance}
            className="min-w-0 min-h-[48px] h-12 md:h-14 px-2 md:px-4 flex items-center justify-center gap-1.5 lg:gap-2 text-[10px] lg:text-sm tracking-[0.06em] lg:tracking-[0.12em] font-semibold uppercase whitespace-nowrap disabled:opacity-50 transition-opacity"
            style={{
              background: 'hsl(var(--accent-gold))',
              color: '#000000',
            }}
          >
            {isLastStep && leadCapture && hidePrices ? (
              <>Request Your Quote</>
            ) : !isLastStep && hidePrices ? (
              <>
                <span>{nextLabel ?? 'Continue'}</span>
                <ArrowRight className="w-4 h-4" />
              </>
            ) : isLastStep ? (
              showDeposit ? (
                <>
                  <ShoppingCart className="w-4 h-4" />
                  {depositAmount > 0 ? `Pay ${sym}${depositAmount.toLocaleString()} Deposit` : 'Complete Request — No Deposit'}
                </>

              ) : (
                <>
                  <ShoppingCart className="w-4 h-4" />
                  {sym}{price.toLocaleString()} | Add to Cart
                </>
              )
            ) : (
              <>
                <span>{pricePrefix}{sym}{price.toLocaleString()}</span>
                <span className="opacity-60">|</span>
                <span>{nextLabel}</span>
                <ArrowRight className="w-4 h-4 flex-none" />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
