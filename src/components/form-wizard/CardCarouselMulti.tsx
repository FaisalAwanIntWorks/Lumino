import { useState, useRef, useCallback, useEffect } from 'react';
import { Check } from 'lucide-react';
import { CarouselArrow } from './CarouselArrow';
import { fallbackToPngOnError } from '@/lib/webp-image-fallback';
import type { CarouselCard } from './CardCarousel';

interface CardCarouselMultiProps {
  cards: CarouselCard[];
  selectedValues: string[];
  onToggle: (value: string) => void;
  accentColor?: string;
  fontColor?: string;
}

/** Build a stable key from value+src so stale entries are never reused. */
function imgKey(value: string, src: string) {
  return `${value}::${src}`;
}

/**
 * Multi-select variant of CardCarousel. Visual + scroll behavior mirrors
 * CardCarousel exactly (snap-x scroll, edge-aware chevron arrows, accent
 * theming) so Ring Builder multi-select steps match Grillz / Custom Enquiry.
 * Differences: multiple cards can show the check badge, and tapping a card
 * toggles it without auto-advancing.
 */
export function CardCarouselMulti({
  cards,
  selectedValues,
  onToggle,
  accentColor,
  fontColor,
}: CardCarouselMultiProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const imgRefs = useRef<Map<string, HTMLImageElement>>(new Map());

  const [loadedImages, setLoadedImages] = useState<Set<string>>(new Set());
  const [canScroll, setCanScroll] = useState({ left: false, right: false });
  const accent = accentColor || 'hsl(142, 53%, 53%)';

  const cardsFingerprint = cards.map(c => `${c.value}|${c.image}`).join(',');

  const checkScrollability = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    // Use full row width so arrow gutters never create their own overflow.
    const needsControls = el.scrollWidth > el.clientWidth + 5;
    setCanScroll({
      left: needsControls && el.scrollLeft > 5,
      right: needsControls && el.scrollLeft < el.scrollWidth - el.clientWidth - 5,
    });
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    checkScrollability();
    el.addEventListener('scroll', checkScrollability, { passive: true });
    const ro = new ResizeObserver(checkScrollability);
    ro.observe(el);
    return () => {
      el.removeEventListener('scroll', checkScrollability);
      ro.disconnect();
    };
  }, [checkScrollability, cardsFingerprint]);

  const scrollBy = useCallback((dir: number) => {
    scrollRef.current?.scrollBy({
      left: dir * 280,
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
    });
  }, []);

  useEffect(() => {
    const alreadyLoaded = new Set<string>();
    cards.forEach(card => {
      const el = imgRefs.current.get(card.value);
      if (el && el.complete && el.naturalWidth > 0) {
        alreadyLoaded.add(imgKey(card.value, card.image));
      }
    });
    setLoadedImages(alreadyLoaded);
  }, [cardsFingerprint]); // eslint-disable-line react-hooks/exhaustive-deps

  const markLoaded = useCallback((value: string, src: string) => {
    const key = imgKey(value, src);
    setLoadedImages(prev => {
      if (prev.has(key)) return prev;
      const next = new Set(prev);
      next.add(key);
      return next;
    });
  }, []);

  const setImgRef = useCallback((value: string, el: HTMLImageElement | null) => {
    if (el) {
      imgRefs.current.set(value, el);
    }
  }, []);

  return (
    <div className={`relative group/carousel ${canScroll.left || canScroll.right ? 'custom-x-carousel' : ''}`}>
      <CarouselArrow direction="left" available={canScroll.left} onClick={() => scrollBy(-1)} />
      <CarouselArrow direction="right" available={canScroll.right} onClick={() => scrollBy(1)} />

      <div
        ref={scrollRef}
        className={`flex gap-5 md:gap-8 overflow-x-auto pb-4 snap-x snap-mandatory scrollbar-hide px-4 md:px-8 [&>*:first-child]:ml-auto [&>*:last-child]:mr-auto`}
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none', overscrollBehaviorX: 'contain' }}
      >
        {cards.map((card) => {
          const isSelected = selectedValues.includes(card.value);
          const key = imgKey(card.value, card.image);
          const isLoaded = loadedImages.has(key);
          return (
            <button
              key={card.value}
              type="button"
              onClick={() => onToggle(card.value)}
              className={`relative flex-shrink-0 snap-center flex flex-col items-center gap-3 group transition-all duration-200`}
              style={{
                width: 'clamp(160px, 34vw, 260px)',
              }}
            >
              <div className="relative w-full aspect-square flex items-center justify-center">
                {!isLoaded && (
                  <div className="absolute inset-0 rounded-xl bg-muted/20 animate-pulse" />
                )}
                <img
                  ref={(el) => setImgRef(card.value, el)}
                  src={card.image}
                  alt={card.label}
                  width={300}
                  height={300}
                  loading="eager"
                  decoding="async"
                  onLoad={() => markLoaded(card.value, card.image)}
                  onError={(e) => { if (!fallbackToPngOnError(e)) markLoaded(card.value, card.image); }}
                  className="w-full h-full object-contain transition-opacity duration-200"
                  style={{ opacity: isLoaded ? 1 : 0 }}
                />
                {isSelected && (
                  <div
                    className="absolute top-2 right-2 w-7 h-7 rounded-full flex items-center justify-center shadow-lg animate-scale-in"
                    style={{ backgroundColor: accent }}
                  >
                    <Check className="w-4 h-4 text-white" strokeWidth={3} />
                  </div>
                )}
              </div>
              <span
                className="text-sm md:text-base font-semibold uppercase tracking-wide transition-colors duration-150"
                style={{
                  color: isSelected ? accent : (fontColor || '#ffffff'),
                }}
              >
                {card.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
