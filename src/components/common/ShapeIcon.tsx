import { Diamond } from 'lucide-react';
import { useIsDarkBackground } from '@/hooks/useIsDarkBackground';
import { fallbackToPngOnError } from '@/lib/webp-image-fallback';

// Icons are requested as WebP; the <img> falls back to the .png twin on error.

const CDN_TRANSPARENT_BASE = 'https://d3hry6a3ciae6y.cloudfront.net/DiamondsCatalog/TransparentDiamondIcons';

const transparentIconMap: Record<string, string> = {
  round: `${CDN_TRANSPARENT_BASE}/RounddiamondtransparentIcon.webp`,
  oval: `${CDN_TRANSPARENT_BASE}/OvaldiamondtransparentIcon.webp`,
  princess: `${CDN_TRANSPARENT_BASE}/PrincessdiamondtransparentIcon.webp`,
  radiant: `${CDN_TRANSPARENT_BASE}/RadiantdiamondtransparentIcon.webp`,
  emerald: `${CDN_TRANSPARENT_BASE}/EmeraldDiamondtransparentIcon.webp`,
  cushion: `${CDN_TRANSPARENT_BASE}/CushiondiamondtransparentIcon.webp`,
  pear: `${CDN_TRANSPARENT_BASE}/PeardiamondtransparentIcon.webp`,
  marquise: `${CDN_TRANSPARENT_BASE}/MarquisediamondtransparentIcon.webp`,
};

const CDN_BASE = 'https://d3hry6a3ciae6y.cloudfront.net/DiamondsCatalog/DiamondWhiteBackgroundIcons';

const whiteBgIconMap: Record<string, string> = {
  round: `${CDN_BASE}/Rounddiamondicon.webp`,
  oval: `${CDN_BASE}/OvaldiamondIcon.webp`,
  princess: `${CDN_BASE}/PrincessdiamondIcon.webp`,
  radiant: `${CDN_BASE}/RadiantdiamondIcon.webp`,
  emerald: `${CDN_BASE}/EmeraldDiamondIcon.webp`,
  cushion: `${CDN_BASE}/CushiondiamondIcon.webp`,
  pear: `${CDN_BASE}/PeardiamondIcon.webp`,
  marquise: `${CDN_BASE}/MarquisediamondIcon.webp`,
};

interface ShapeIconProps {
  shapeId: string;
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  variant?: 'transparent' | 'white-bg' | 'auto';
}

export function ShapeIcon({ shapeId, className = '', size = 'md', variant = 'auto' }: ShapeIconProps) {
  const isDark = useIsDarkBackground();
  const resolvedVariant = variant === 'auto' ? (isDark ? 'white-bg' : 'transparent') : variant;
  const normalizedId = shapeId.toLowerCase();
  const iconMap = resolvedVariant === 'white-bg' ? whiteBgIconMap : transparentIconMap;
  const iconSrc = iconMap[normalizedId];
  
  const sizeClasses = {
    sm: 'w-10 h-10',
    md: 'w-14 h-14',
    lg: 'w-16 h-16',
    xl: 'w-20 h-20',
  };

  if (!iconSrc) {
    return <Diamond className={`${sizeClasses[size]} ${className}`} />;
  }

  return (
    <img 
      src={iconSrc} 
      alt={`${shapeId} diamond shape`}
      className={`${sizeClasses[size]} ${className} object-contain`}
      loading="eager"
      decoding="sync"
      onError={fallbackToPngOnError}
    />
  );
}
