import { motion } from 'framer-motion';

export interface SummaryItem {
  label: string;
  value: string;
}

interface SelectionSummaryCardProps {
  items: SummaryItem[];
  fontColor: string;
  accentColor?: string;
}

export function SelectionSummaryCard({ items, fontColor, accentColor }: SelectionSummaryCardProps) {
  const filtered = items.filter(i => i.value);
  if (filtered.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3, duration: 0.5 }}
      className="w-full rounded-xl p-4 backdrop-blur-xl h-fit"
      style={{
        backgroundColor: 'rgba(255,255,255,0.06)',
        border: '1px solid rgba(255,255,255,0.12)',
        boxShadow: accentColor
          ? `0 0 20px ${accentColor}10, inset 0 1px 0 rgba(255,255,255,0.08)`
          : 'inset 0 1px 0 rgba(255,255,255,0.08)',
        borderTop: accentColor ? `1px solid ${accentColor}30` : undefined,
      }}
    >
      <p
        className="text-[11px] font-semibold uppercase tracking-widest mb-3"
        style={{ color: accentColor ? `${accentColor}aa` : `${fontColor}60` }}
      >
        Your Selections
      </p>
      <div className="grid grid-cols-2 gap-x-4 gap-y-2">
        {filtered.map((item, idx) => (
          <div key={idx} className="flex flex-col">
            <span
              className="text-[10px] uppercase tracking-wider"
              style={{ color: `${fontColor}50` }}
            >
              {item.label}
            </span>
            <span
              className="text-xs font-medium truncate"
              style={{ color: `${fontColor}cc` }}
            >
              {item.value}
            </span>
          </div>
        ))}
      </div>
    </motion.div>
  );
}