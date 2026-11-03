import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface CarouselArrowProps {
  direction: 'left' | 'right';
  available: boolean;
  onClick: () => void;
}

/** Neutral, fixed-contrast controls shared only by Custom X picture rows. */
export function CarouselArrow({ direction, available, onClick }: CarouselArrowProps) {
  const Icon = direction === 'left' ? ChevronLeft : ChevronRight;
  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      aria-label={`Scroll ${direction}`}
      title={`Scroll ${direction}`}
      disabled={!available}
      tabIndex={available ? 0 : -1}
      aria-hidden={!available}
      onClick={onClick}
      className={`custom-x-carousel-arrow absolute top-1/2 -translate-y-1/2 z-10 ${direction === 'left' ? 'left-1' : 'right-1'} ${available ? '' : 'invisible'}`}
    >
      <Icon strokeWidth={2.5} />
    </Button>
  );
}