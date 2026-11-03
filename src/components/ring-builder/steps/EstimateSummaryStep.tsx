import { getCurrencySymbol } from '@/lib/pricing-utils';

interface EstimateSummaryStepProps {
  estimatedPrice: number;
  depositAmount: number;
  currency?: string;
}

export const EstimateSummaryStep = ({ estimatedPrice, depositAmount, currency = 'USD' }: EstimateSummaryStepProps) => {
  const sym = getCurrencySymbol(currency);

  return (
    <div className="px-4 py-6 md:px-6 md:py-8 space-y-6 animate-fade-in">
      {/* Estimated Price Display */}
      <div className="text-center space-y-3">
        <p className="text-sm text-muted-foreground font-medium tracking-wide uppercase">
          Based on your selections
        </p>
        <p className="text-base text-foreground/80">
          Your estimated ring price is
        </p>
        <p className="text-4xl font-sans font-bold tracking-tight tabular-nums text-foreground">
          {sym}{estimatedPrice.toLocaleString()}
        </p>
      </div>

      {/* Deposit Message */}
      <div className="bg-primary/5 border border-primary/20 rounded-xl p-5 text-center space-y-2">
        {depositAmount > 0 ? (
          <p className="text-sm text-foreground leading-relaxed">
            Please proceed with a <span className="font-bold text-primary">{sym}{depositAmount.toLocaleString()}</span> deposit
            and we will get in touch for further in-depth discussion.
          </p>
        ) : (
          <p className="text-sm text-foreground leading-relaxed">
            <span className="font-bold text-primary">No deposit required</span> — submit your request and we will get in touch for further in-depth discussion.
          </p>
        )}
      </div>


      {/* Disclaimer */}
      <p className="text-xs text-muted-foreground text-center leading-relaxed italic px-2">
        This estimate is based on current diamond and metal prices. We'll review your specifications and market values before starting production.
      </p>
    </div>
  );
};
