import { useState } from 'react';
import { motion } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import { ThankYouContactButton } from '@/components/form-wizard/ThankYouContactButton';
import type { ThankYouContact } from '@/lib/thank-you-contact';

interface SummaryItem {
  label: string;
  value: string;
}

interface WizardThankYouProps {
  onReset: () => void;
  backgroundColor: string;
  fontColor: string;
  accentColor: string;
  summaryItems?: SummaryItem[];
  /** Client-configured contact button (Call Us / Contact Us / Schedule). */
  thankYouContact?: ThankYouContact | null;
}

export function WizardThankYou({
  onReset,
  backgroundColor,
  fontColor,
  accentColor,
  summaryItems,
  thankYouContact,
}: WizardThankYouProps) {
  const filteredItems = summaryItems?.filter(i => i.value) || [];
  const [showSelections, setShowSelections] = useState(false);

  return (
    <div
      className="h-screen flex flex-col items-center justify-center space-y-6 px-4 animate-fade-in"
      style={{ backgroundColor, color: fontColor }}
    >
      {/* Minimal accent dot */}
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: 'spring', stiffness: 300, damping: 20 }}
        className="w-3 h-3 rounded-full"
        style={{ backgroundColor: accentColor }}
      />

      <h1 className="text-3xl md:text-5xl font-black uppercase tracking-tight leading-none text-center">
        <span style={{ color: fontColor }}>THANK </span>
        <span style={{ color: accentColor }}>YOU</span>
      </h1>
      <p
        className="text-sm text-center max-w-md px-4 leading-relaxed font-jost"
        style={{ color: `${fontColor}99` }}
      >
        We have received your details and will be in touch with you shortly.
      </p>

      {filteredItems.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.5 }}
          className="w-full max-w-sm rounded-xl p-4 backdrop-blur-sm"
          style={{
            backgroundColor: `${fontColor}08`,
            border: `1px solid ${fontColor}12`,
          }}
        >
          <button
            onClick={() => setShowSelections(!showSelections)}
            className="w-full flex items-center justify-between"
          >
            <p
              className="text-[11px] font-semibold uppercase tracking-widest font-jost"
              style={{ color: `${fontColor}60` }}
            >
              Your Selections
            </p>
            <ChevronDown
              className="w-4 h-4 transition-transform duration-300"
              style={{ color: `${fontColor}60`, transform: showSelections ? 'rotate(180deg)' : 'rotate(0deg)' }}
            />
          </button>
          <div
            className="overflow-hidden transition-all duration-300 ease-in-out"
            style={{ maxHeight: showSelections ? '400px' : '0px', marginTop: showSelections ? '12px' : '0px' }}
          >
            <div className="grid grid-cols-2 gap-x-4 gap-y-2">
              {filteredItems.map((item, idx) => (
                <div key={idx} className="flex flex-col">
                  <span
                    className="text-[10px] uppercase tracking-wider font-jost"
                    style={{ color: `${fontColor}50` }}
                  >
                    {item.label}
                  </span>
                  <span
                    className="text-xs font-medium truncate font-jost"
                    style={{ color: `${fontColor}cc` }}
                  >
                    {item.value}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </motion.div>
      )}

      <ThankYouContactButton contact={thankYouContact} accentColor={accentColor} />
    </div>
  );
}
