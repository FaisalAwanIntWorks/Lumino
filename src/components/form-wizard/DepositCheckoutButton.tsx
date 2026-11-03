import { useState } from 'react';
import { Loader2, CreditCard } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { getCurrencySymbol } from '@/lib/pricing-utils';
import { extractCheckoutErrorAsync } from '@/lib/checkout-error-utils';
import { getContrastText } from '@/lib/color-utils';

interface DepositCheckoutButtonProps {
  clientId: string;
  formType: string;
  attributes: Record<string, string>;
  depositAmount: number;
  accentColor: string;
  fontColor: string;
  disabled?: boolean;
  currency?: string;
}

export function DepositCheckoutButton({
  clientId,
  formType,
  attributes,
  depositAmount,
  accentColor,
  fontColor,
  disabled,
  currency = 'USD',
}: DepositCheckoutButtonProps) {
  const [loading, setLoading] = useState(false);
  // Label must stay readable on light accents (e.g. a white brand colour) —
  // dark accents keep the previous white text.
  const labelColor = getContrastText(accentColor);

  const handleCheckout = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('shopify-form-checkout', {
        body: { clientId, formType, attributes },
      });
      if (error) {
        const msg = await extractCheckoutErrorAsync(error);
        toast.error(msg);
        return;
      }
      if (data?.error) { toast.error(data.error); return; }
      if (data?.checkoutUrl) {
        try {
          if (window.top) window.top.location.href = data.checkoutUrl;
          else window.location.href = data.checkoutUrl;
        } catch {
          window.location.href = data.checkoutUrl;
        }
        return;
      }
      toast.error('Could not get checkout URL. Your design was saved.');
    } catch (err) {
      console.error('Checkout error:', err);
      toast.error('Could not redirect to checkout. Your design was saved.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleCheckout}
      disabled={loading || disabled}
      className="w-full flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl text-sm font-bold uppercase tracking-wider transition-all"
      style={{
        backgroundColor: accentColor,
        color: labelColor,
        opacity: loading || disabled ? 0.7 : 1,
        boxShadow: `0 0 20px ${accentColor}40`,
      }}
    >
      {loading ? (
        <>
          <Loader2 className="w-4 h-4 animate-spin" />
          Redirecting to checkout...
        </>
      ) : (
        <>
          <CreditCard className="w-4 h-4" />
          PROCEED TO CHECKOUT — {getCurrencySymbol(currency)}{depositAmount} DEPOSIT
        </>
      )}
    </button>
  );
}
