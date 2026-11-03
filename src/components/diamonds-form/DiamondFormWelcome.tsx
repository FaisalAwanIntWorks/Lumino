import { Button } from '@/components/ui/button';

const DEFAULT_TITLE = "Let's build your Ring!";
const DEFAULT_SUBTITLE = 'Get An Instant Quote';

interface DiamondFormWelcomeProps {
  onStart: () => void;
  /** Client-configured copy; blank or missing falls back to the defaults. */
  title?: string | null;
  subtitle?: string | null;
}

export function DiamondFormWelcome({ onStart, title, subtitle }: DiamondFormWelcomeProps) {
  // Blank means "not customised" — fall back to the shipped wording so a
  // half-filled config never renders an empty screen.
  const heading = title?.trim() || DEFAULT_TITLE;
  const sub = subtitle?.trim() || DEFAULT_SUBTITLE;

  return (
    <div className="relative overflow-hidden rounded-2xl bg-[#EDE8E3] min-h-[100dvh] md:min-h-[500px] flex flex-col items-center justify-center p-4 md:p-10">

      <h2 className="text-xl md:text-4xl font-bold text-gray-900 text-center mb-2 md:mb-4">
        {heading}
      </h2>

      <p className="text-gray-600 text-center text-sm md:text-lg mb-4 md:mb-8">
        {sub}
      </p>

      <Button
        onClick={onStart}
        size="lg"
        className="bg-black text-white hover:bg-gray-900 rounded-full px-8 py-4 md:px-10 md:py-6 text-base md:text-lg font-semibold shadow-lg transition-all hover:scale-105 border border-black"
      >
        <span>Let's Begin</span>
        <span>→</span>
      </Button>
    </div>
  );
}
