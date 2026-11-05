import { createPortal } from 'react-dom';
import { fallbackToPngOnError } from '@/lib/webp-image-fallback';
import { Button } from '@/components/ui/button';
import { StyleOption } from '@/types/ring-builder';
import { X } from 'lucide-react';
import { ASSET_CDN } from "@/lib/asset-cdn";

interface StyleInfoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  style: StyleOption | null;
}

// Same image URLs as the option cards in steps/StyleStep.tsx
// Sketches are served as WebP; every <img> showing one falls back to the .png twin on error.
const STYLE_IMAGES: Record<string, string> = {
  'solitaire': `${ASSET_CDN.main}/JewlxRingsSketches/Solitaire.webp`,
  'three-stone': `${ASSET_CDN.main}/JewlxRingsSketches/Three+stone.webp`,
  'halo': `${ASSET_CDN.main}/JewlxRingsSketches/Halo.webp`,
  'pave-rail': `${ASSET_CDN.main}/JewlxRingsSketches/Pave+Rail.webp`,
};

const STYLE_DETAILED_INFO: Record<string, string> = {
  'solitaire': 'The Solitaire setting emphasizes simplicity and elegance, with a single diamond (or gemstone) as its centerpiece. This timeless design allows the center stone to be the focal point, showcasing its brilliance and fire without distraction.',
  'three-stone': 'The Three Stone setting features a trio of diamonds (or gemstones), symbolizing the past, present, and future of a couple\'s journey together, with the center stone typically larger for prominence.',
  'halo': 'The Halo setting encircles the center stone with a ring of smaller diamonds, enhancing its size and brilliance for a pronounced effect. This design creates maximum sparkle and visual impact.',
  'pave-rail': 'The Pavé Rail setting features accent diamonds placed beneath the center stone and in between the prongs, rather than surrounding it from the top view. This subtle detail enhances the brilliance of the ring without overpowering the main gemstone.',
};

export const StyleInfoDialog = ({ open, onOpenChange, style }: StyleInfoDialogProps) => {
  if (!open || !style) return null;

  const styleImage = STYLE_IMAGES[style.id];
  const detailedInfo = STYLE_DETAILED_INFO[style.id] || style.description;

  return createPortal(
    <div className="fixed inset-0 z-[60] animate-in fade-in-0 duration-200">
      {/* Backdrop */}
      <div className="aurezo-info-backdrop fixed inset-0 bg-black/60" onClick={() => onOpenChange(false)} />
      
      {/* Full panel container */}
      <div className="fixed inset-0 md:left-[50%] flex items-stretch">
        <div className="relative w-full h-full overflow-y-auto bg-background">
          {/* Close button */}
          <button
            onClick={() => onOpenChange(false)}
            className="absolute top-4 right-4 p-1.5 rounded-full bg-muted hover:bg-muted/80 transition-colors z-10"
          >
            <X className="w-4 h-4 text-foreground" />
          </button>

          {/* Centered content */}
          <div className="flex flex-col items-center justify-center text-center min-h-full px-6 py-12 max-w-lg mx-auto">
            {/* Style Image */}
            <div className="w-24 h-24 rounded-lg border border-border flex items-center justify-center mb-5 bg-muted/20 p-1.5">
              {styleImage ? (
                <img src={styleImage} alt={style.name} className="w-full h-full object-contain" onError={fallbackToPngOnError} />
              ) : (
                <div className="w-full h-full bg-muted/20 flex items-center justify-center text-muted-foreground">?</div>
              )}
            </div>

            {/* Style Label */}
            <span className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground mb-2">
              Style
            </span>

            {/* Style Name */}
            <h2 className="font-serif text-2xl md:text-3xl text-foreground mb-4">
              {style.name}
            </h2>

            {/* Description */}
            <p className="text-muted-foreground text-xs md:text-sm leading-relaxed mb-6 max-w-xs">
              {detailedInfo}
            </p>

            {/* Got It Button */}
            <Button
              onClick={() => onOpenChange(false)}
              className="px-8 py-5 text-xs uppercase tracking-widest bg-foreground text-background hover:bg-foreground/90 transition-all duration-300"
            >
              Got It!
            </Button>
          </div>
        </div>
      </div>
    </div>
  , document.body);
};
