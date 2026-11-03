import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { isImagePreloaded } from '@/lib/diamond-form-image-preload';
import { isQuoteV3StockImageUrl, quoteV3StockImageCardScale } from '@/lib/quote-v3-assets';

interface DiamondOptionImageProps {
  src: string;
  alt: string;
  /** Classes for the aspect-ratio box that wraps the image. */
  wrapperClassName?: string;
  /** Classes for the <img> itself. */
  imgClassName?: string;
}

/**
 * Option thumbnail for the Quote Estimator steps.
 *
 * The CDN artwork is heavy, so cards used to pop in one at a time in whatever
 * order the network happened to finish. Each card now holds a shimmering
 * placeholder and fades its image in once it has actually decoded, which reads
 * as a deliberate load instead of a ragged sequence. Images already warmed by
 * the preloader skip the placeholder entirely and appear instantly.
 */
export function DiamondOptionImage({ src, alt, wrapperClassName, imgClassName }: DiamondOptionImageProps) {
  // The original artwork carries its own white margin, so the steps zoom or
  // crop it to fill the card. The V3 set is square and edge-to-edge instead:
  // give it a square frame, a little breathing room and show it whole.
  const v3Artwork = isQuoteV3StockImageUrl(src);
  // Every card zooms the picture the same amount, except the stone pictures,
  // which are sized from their measured footprint so no cut looks bigger or
  // smaller than its neighbours.
  const v3Scale = quoteV3StockImageCardScale(src);
  const [loaded, setLoaded] = useState(() => isImagePreloaded(src));
  // The DTT artwork is served as WebP. The whole set exists on the CDN, but a
  // failed .webp still retries the original .png once so a future upload that
  // misses its WebP twin degrades instead of showing a broken card.
  const [currentSrc, setCurrentSrc] = useState(src);

  // A new `src` (e.g. the client swapped a custom image) restarts the placeholder.
  useEffect(() => {
    setCurrentSrc(src);
    setLoaded(isImagePreloaded(src));
  }, [src]);

  const handleError = () => {
    if (currentSrc.endsWith('.webp')) {
      setCurrentSrc(currentSrc.slice(0, -'.webp'.length) + '.png');
      return;
    }
    // Keep broken images from leaving a shimmer running forever.
    setLoaded(true);
  };

  return (
    <div className={cn('relative', wrapperClassName, v3Artwork && 'aspect-square md:aspect-square p-0 md:p-0')}>
      {!loaded && <div className="dtt-img-skeleton absolute inset-0" aria-hidden="true" />}
      <img
        src={currentSrc}
        alt={alt}
        loading="eager"
        decoding="async"
        draggable={false}
        onLoad={() => setLoaded(true)}
        onError={handleError}
        style={v3Artwork ? { transform: `scale(${v3Scale.toFixed(3)})` } : undefined}
        className={cn(
          imgClassName,
          v3Artwork && 'w-full h-full md:w-full md:h-full object-contain md:object-contain',
          'transition-opacity duration-300 ease-out',
          loaded ? 'opacity-100' : 'opacity-0'
        )}
      />
    </div>
  );
}
