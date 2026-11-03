/**
 * A styled option grid for wizard steps.
 * Supports optional images per option for a premium floating PNG look.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { Check } from 'lucide-react';
import { ReactNode } from 'react';
import { fallbackToPngOnError } from '@/lib/webp-image-fallback';

export interface WizardOptionGridProps {
  options: { value: string; label: string; image?: string }[];
  selectedValue: string;
  onSelect: (value: string) => void;
  columns?: 2 | 3 | 4;
  accentColor?: string;
  fontColor?: string;
  renderExtra?: (option: { value: string; label: string }) => ReactNode;
}

function imgKey(value: string, src: string) {
  return `${value}::${src}`;
}

export function WizardOptionGrid({
  options,
  selectedValue,
  onSelect,
  columns = 3,
  accentColor,
  fontColor,
  renderExtra,
}: WizardOptionGridProps) {
  const accent = accentColor || 'hsl(142, 53%, 53%)';
  const font = fontColor || '#ffffff';
  const hasImages = options.some(o => o.image);
  const [loadedImages, setLoadedImages] = useState<Set<string>>(new Set());
  const imgRefs = useRef<Map<string, HTMLImageElement>>(new Map());

  // Reset loaded state when options/images change
  const optionsFingerprint = options.map(o => `${o.value}|${o.image || ''}`).join(',');
  useEffect(() => {
    const alreadyLoaded = new Set<string>();
    options.forEach(opt => {
      if (!opt.image) return;
      const el = imgRefs.current.get(opt.value);
      if (el && el.complete && el.naturalWidth > 0) {
        alreadyLoaded.add(imgKey(opt.value, opt.image));
      }
    });
    setLoadedImages(alreadyLoaded);
  }, [optionsFingerprint]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const gridCols = {
    2: 'grid-cols-2',
    3: 'grid-cols-2 md:grid-cols-3',
    4: 'grid-cols-2 md:grid-cols-4',
  }[columns];

  const isSmallImageSet = hasImages && options.length < 4;

  if (hasImages) {
    return (
      <div className={isSmallImageSet
        ? 'flex flex-wrap justify-center gap-6 px-4 md:px-8 max-w-4xl mx-auto w-full'
        : `grid ${gridCols} gap-6 px-4 md:px-8 max-w-4xl mx-auto w-full`
      }>
        {options.map((opt, index) => {
          const isSelected = selectedValue === opt.value;
          const key = opt.image ? imgKey(opt.value, opt.image) : '';
          const isLoaded = !opt.image || loadedImages.has(key);
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onSelect(opt.value)}
              className={`relative flex flex-col items-center gap-2 group ${isSmallImageSet ? 'w-[clamp(180px,35vw,280px)]' : ''}`}
              style={{
                animationDelay: `${index * 10}ms`,
                animationFillMode: 'both',
              }}
            >
              {opt.image && (
                <div className="relative w-full aspect-square flex items-center justify-center">
                  {!isLoaded && (
                    <div className="absolute inset-0 rounded-xl bg-muted/20 animate-pulse" />
                  )}
                  <img
                    ref={(el) => setImgRef(opt.value, el)}
                    src={opt.image}
                    alt={opt.label}
                    width={300}
                    height={300}
                    /* C6: Only the first option is eagerly loaded so the LCP
                       image still paints fast; everything below is lazy. */
                    loading={index === 0 ? 'eager' : 'lazy'}
                    decoding="async"
                    onLoad={() => markLoaded(opt.value, opt.image!)}
                    onError={(e) => { if (!fallbackToPngOnError(e)) markLoaded(opt.value, opt.image!); }}
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
              )}
              <span
                className="text-sm md:text-base font-semibold uppercase tracking-wide transition-colors duration-150"
                style={{
                  color: isSelected ? accent : font,
                }}
              >
                {opt.label}
              </span>
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div className={options.length < 4
      ? 'flex flex-wrap justify-center gap-3 px-4 md:px-8 max-w-2xl mx-auto w-full'
      : `grid ${gridCols} gap-3 px-4 md:px-8 max-w-2xl mx-auto w-full`
    }>
      {options.map((opt, index) => {
        const isSelected = selectedValue === opt.value;
        return (
          <div key={opt.value} className={`relative ${options.length < 4 ? 'w-[clamp(140px,40vw,200px)]' : ''}`} style={{ animationDelay: `${index * 10}ms`, animationFillMode: 'both' }}>
            {renderExtra && renderExtra(opt)}
            <button
              type="button"
              onClick={() => onSelect(opt.value)}
              className="w-full px-4 py-3 rounded-xl text-sm md:text-base font-semibold uppercase tracking-wide transition-colors duration-150 border-2"
              style={{
                backgroundColor: isSelected ? `${accent}20` : 'transparent',
                borderColor: isSelected ? accent : 'rgba(255,255,255,0.15)',
                color: font,
              }}
            >
              {opt.label}
            </button>
          </div>
        );
      })}
    </div>
  );
}
