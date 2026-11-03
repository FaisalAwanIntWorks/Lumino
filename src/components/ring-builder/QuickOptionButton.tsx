import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface QuickOptionButtonProps {
  option: string;
  price?: number;
  index: number;
  onClick: () => void;
  category?: 'style' | 'shank' | 'metal' | 'shape' | 'carat' | 'size' | null;
  currency?: string;
}

const formatOptionPrice = (price: number, currency: string = 'USD'): string => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(price);
};

export const QuickOptionButton = ({ 
  option, 
  price,
  index, 
  onClick, 
  category,
  currency = 'USD'
}: QuickOptionButtonProps) => {
  return (
    <motion.button
      initial={{ opacity: 0, scale: 0.9, y: 8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95, y: -4 }}
      transition={{ 
        delay: index * 0.05,
        type: "spring",
        stiffness: 400,
        damping: 25
      }}
      whileHover={{ 
        scale: 1.02,
        transition: { duration: 0.15 }
      }}
      whileTap={{ scale: 0.97 }}
      onClick={onClick}
      className={cn(
        "flex-shrink-0 flex items-center gap-2",
        "px-4 py-2 rounded-full",
        "bg-primary/15 border border-primary/30",
        "hover:bg-primary/25 transition-colors duration-200",
        "cursor-pointer"
      )}
    >
      <span className="text-[13px] font-medium text-primary whitespace-nowrap">
        {option}
      </span>
      {price !== undefined && price > 0 && (
        <span className="text-[11px] font-semibold text-primary/70 whitespace-nowrap">
          {formatOptionPrice(price, currency)}
        </span>
      )}
    </motion.button>
  );
};
