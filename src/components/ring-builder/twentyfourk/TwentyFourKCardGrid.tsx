// Shared horizontal-card grid used by the 24k Carat Jewelers theme.
// Each card: image on the LEFT, name centered on the RIGHT, small (i) info
// icon under the name. White card on the light surface. Gold border when
// selected. No StepHeader description above (single source of label).

import { Info } from 'lucide-react';
import { ReactNode } from 'react';

export interface TwentyFourKCardItem {
  id: string;
  name: string;
}

interface TwentyFourKCardGridProps<T extends TwentyFourKCardItem> {
  items: T[];
  selectedId: string | null;
  onSelect: (item: T) => void;
  onInfo?: (item: T) => void;
  /** Renders the visual (image or icon) shown on the left half of each card. */
  renderVisual: (item: T) => ReactNode;
  /** Tailwind grid-cols class. Defaults to grid-cols-2 (matches reference). */
  columnsClassName?: string;
}

export function TwentyFourKCardGrid<T extends TwentyFourKCardItem>({
  items,
  selectedId,
  onSelect,
  onInfo,
  renderVisual,
  columnsClassName = 'grid-cols-2',
}: TwentyFourKCardGridProps<T>) {
  return (
    <div className={`grid ${columnsClassName} gap-2 max-w-3xl mx-auto`}>
      {items.map((item) => {
        const isSelected = selectedId === item.id;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onSelect(item)}
            className={`relative flex items-center bg-white text-black transition-colors duration-150 overflow-hidden ${
              isSelected
                ? 'border-[2px] border-[hsl(var(--accent-gold))]'
                : 'border border-[#D9D9D9] hover:border-[hsl(var(--accent-gold)/0.6)]'
            }`}
            style={{ minHeight: 120 }}
          >
            {/* Left: visual */}
            <div className="w-1/2 h-full flex items-center justify-center p-3">
              {renderVisual(item)}
            </div>

            {/* Right: name + info */}
            <div className="w-1/2 h-full flex flex-col items-center justify-center gap-2 p-3">
              <span className="text-[13px] md:text-sm font-medium text-black text-center">
                {item.name}
              </span>
              {onInfo && (
                <span
                  role="button"
                  tabIndex={0}
                  aria-label={`More info about ${item.name}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onInfo(item);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      e.stopPropagation();
                      onInfo(item);
                    }
                  }}
                  className="p-1 rounded-full hover:bg-black/5 transition-colors cursor-pointer"
                >
                  <Info className="w-3.5 h-3.5 text-[#9A9A9A]" />
                </span>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}
