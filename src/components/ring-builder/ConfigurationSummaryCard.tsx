import { motion } from 'framer-motion';
import { Diamond } from 'lucide-react';
import { formatCartPrice } from '@/lib/pricing-utils';

interface SummaryItem {
  label: string;
  value: string;
  price?: number;
}

interface ConfigurationSummaryCardProps {
  style?: { name: string; price?: number };
  shank?: { name: string; price?: number };
  metal?: { name: string; price?: number };
  shape?: { name: string };
  carat?: { value: number; price?: number; displayName?: string };
  stone?: { name: string; price?: number; reportNo?: string | null };
  currency?: string;
  onAddToCart?: () => void;
}

export const ConfigurationSummaryCard = ({
  style,
  shank,
  metal,
  shape,
  carat,
  stone,
  currency = 'USD',
  onAddToCart,
}: ConfigurationSummaryCardProps) => {
  const items: SummaryItem[] = [];
  let totalPrice = 0;

  if (style) {
    items.push({ label: 'Style', value: style.name, price: style.price });
    if (style.price) totalPrice += style.price;
  }
  if (shank) {
    items.push({ label: 'Band', value: shank.name, price: shank.price });
    if (shank.price) totalPrice += shank.price;
  }
  if (metal) {
    items.push({ label: 'Metal', value: metal.name, price: metal.price });
    if (metal.price) totalPrice += metal.price;
  }
  if (shape) {
    items.push({ label: 'Shape', value: shape.name });
  }
  if (carat) {
    const caratLabel = carat.displayName || `${carat.value} ct`;
    items.push({ label: 'Carat', value: caratLabel, price: carat.price });
    if (carat.price) totalPrice += carat.price;
  }
  if (stone) {
    items.push({ label: 'Diamond', value: stone.name, price: stone.price });
    if (stone.price) totalPrice += stone.price;
  }

  if (items.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      className="flex items-end gap-1.5 sm:gap-2 justify-start"
    >
      {/* AI Avatar */}
      <div className="w-5 h-5 sm:w-7 sm:h-7 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 shadow-sm">
        <Diamond className="w-3 h-3 sm:w-4 sm:h-4 text-primary" />
      </div>

      <div className="max-w-[75%] sm:max-w-[70%] bg-foreground/[0.06] rounded-2xl rounded-bl-sm shadow-sm overflow-hidden">
        {/* Header */}
        <div className="px-3 sm:px-4 pt-2.5 sm:pt-3 pb-1.5">
          <p className="text-[11px] sm:text-[12px] font-semibold text-foreground uppercase tracking-wider">
            Your Ring Summary
          </p>
        </div>

        {/* Line items */}
        <div className="px-3 sm:px-4 space-y-1.5 sm:space-y-2">
          {items.map((item, i) => (
            <div key={i} className="flex items-center justify-between gap-3">
              <div className="flex items-center min-w-0">
                <span className="text-[12px] sm:text-[13px] text-foreground/50 truncate">{item.label}</span>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <span className="text-[12px] sm:text-[13px] font-medium text-foreground">
                  {item.value}
                </span>
                {item.price !== undefined && item.price > 0 && (
                  <span className="text-[11px] sm:text-[12px] text-foreground/50">
                    {formatCartPrice(item.price, currency)}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Total */}
        {totalPrice > 0 && (
          <div className="mx-3 sm:mx-4 mt-2 pt-2 border-t border-foreground/10 pb-2.5 sm:pb-3">
            <div className="flex items-center justify-between">
              <span className="text-[12px] sm:text-[13px] font-semibold text-foreground">
                Total
              </span>
              <span className="text-[13px] sm:text-[14px] font-bold text-primary">
                {formatCartPrice(totalPrice, currency)}
              </span>
            </div>
          </div>
        )}
        {totalPrice === 0 && <div className="pb-2.5 sm:pb-3" />}
      </div>
    </motion.div>
  );
};
