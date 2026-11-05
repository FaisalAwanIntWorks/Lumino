import { Diamond } from 'lucide-react';

interface EmbedConfiguratorSkeletonProps {
  background?: string;
  text?: string;
  accent?: string;
}

export function EmbedConfiguratorSkeleton({
  background = '#000000',
  text = '#FFFFFF',
  accent,
}: EmbedConfiguratorSkeletonProps) {
  const accentColor = accent || text;
  return (
    <div
      className="flex items-center justify-center"
      style={{ height: 'var(--embed-vh, 100dvh)', backgroundColor: background, color: text }}
    >
      <div className="flex flex-col items-center gap-6 animate-fade-in">
        {/* Pulsing Diamond Icon */}
        <div className="animate-pulse">
          <Diamond className="w-12 h-12" strokeWidth={1.2} style={{ color: accentColor, opacity: 0.7 }} />
        </div>

        {/* Brand Text */}
        <div className="text-center space-y-2">
          <p className="text-sm tracking-[0.25em] uppercase font-light" style={{ color: text, opacity: 0.8 }}>
            Initializing
          </p>
          <p className="text-lg tracking-[0.3em] uppercase font-semibold" style={{ color: text }}>
            Aurezo Ring Builder
          </p>
        </div>

        {/* Thin Progress Bar */}
        <div className="w-48 h-0.5 rounded-full overflow-hidden" style={{ backgroundColor: `${text}1a` }}>
          <div
            className="h-full rounded-full"
            style={{
              width: '40%',
              backgroundColor: accentColor,
              opacity: 0.8,
              animation: 'shimmer 1.5s ease-in-out infinite',
            }}
          />
        </div>
      </div>

      <style>{`
        @keyframes shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(350%); }
        }
      `}</style>
    </div>
  );
}
