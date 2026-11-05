import { createPortal } from 'react-dom';
import { fallbackToPngOnError } from '@/lib/webp-image-fallback';
import { Button } from '@/components/ui/button';
import { ShankOption } from '@/types/ring-builder';
import { X } from 'lucide-react';
import { ASSET_CDN } from "@/lib/asset-cdn";

interface ShankInfoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  shank: ShankOption | null;
}

// Same image URLs as the option cards in steps/ShankStep.tsx
// Sketches are served as WebP; every <img> showing one falls back to the .png twin on error.
const SHANK_IMAGES: Record<string, string> = {
  'high-polish': `${ASSET_CDN.main}/JewlxRingsSketches/High-polish-icon.webp`,
  'castel-pave': `${ASSET_CDN.main}/JewlxRingsSketches/Castel+Pave-icon.webp`,
  '3-row-pave': `${ASSET_CDN.main}/JewlxRingsSketches/3+row+pave-icon.webp`,
  'tapered': `${ASSET_CDN.main}/JewlxRingsSketches/Tapered.webp`,
  'eternity': `${ASSET_CDN.main}/JewlxRingsSketches/Eternity.webp`,
  'marquise-cut': `${ASSET_CDN.main}/JewlxRingsSketches/Marquise+.webp`,
};

const SHANK_DETAILED_INFO: Record<string, string> = {
  'high-polish': 'A high polish shank features a smooth, mirror-like finish that reflects light beautifully. This classic design offers timeless elegance and is easy to maintain, making it perfect for those who prefer understated sophistication.',
  'castel-pave': 'The castle pavé shank features small diamonds set into the shoulders of the band in a raised castle-style setting. This design adds subtle sparkle and dimension while maintaining an elegant profile.',
  '3-row-pave': 'The 3-row pavé shank showcases three rows of meticulously set small diamonds along the band. This design maximizes brilliance and creates a stunning display of light from every angle.',
  'tapered': 'A shank that gradually narrows as it approaches the center stone, drawing the eye naturally toward the diamond. This elegant design creates a slimming effect on the finger while giving the center stone a more prominent, elevated appearance. A versatile choice that enhances both classic and modern settings.',
  'eternity': 'A band adorned with a continuous row of small diamonds or gemstones along the shank, adding extra sparkle from every angle. This classic design beautifully complements the center stone while making the ring feel more luxurious and eye catching on the finger.',
  'marquise-cut': 'A shank featuring elegant marquise shaped stone accents set along the band, adding a vintage inspired detail with a touch of sophistication. The elongated leaf like shapes create a delicate, decorative look that draws attention to the center stone while keeping the overall design refined.',
};

export const ShankInfoDialog = ({ open, onOpenChange, shank }: ShankInfoDialogProps) => {
  if (!open || !shank) return null;

  const shankImage = SHANK_IMAGES[shank.id];
  const detailedInfo = SHANK_DETAILED_INFO[shank.id] || shank.description;

  return createPortal(
    <div className="fixed inset-0 z-[60] animate-in fade-in-0 duration-200">
      <div className="aurezo-info-backdrop fixed inset-0 bg-black/60" onClick={() => onOpenChange(false)} />
      
      <div className="fixed inset-0 md:left-[50%] flex items-stretch">
        <div className="relative w-full h-full overflow-y-auto bg-background">
          <button
            onClick={() => onOpenChange(false)}
            className="absolute top-4 right-4 p-1.5 rounded-full bg-muted hover:bg-muted/80 transition-colors z-10"
          >
            <X className="w-4 h-4 text-foreground" />
          </button>

          <div className="flex flex-col items-center justify-center text-center min-h-full px-6 py-12 max-w-lg mx-auto">
            <div className="w-24 h-24 rounded-lg border border-border flex items-center justify-center mb-5 bg-muted/20 p-1.5">
              {shankImage ? (
                <img src={shankImage} alt={shank.name} className="w-full h-full object-contain" onError={fallbackToPngOnError} />
              ) : (
                <div className="w-10 h-10 text-muted-foreground" />
              )}
            </div>

            <span className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground mb-2">
              Shank
            </span>

            <h2 className="font-serif text-2xl md:text-3xl text-foreground mb-4">
              {shank.name}
            </h2>

            <p className="text-muted-foreground text-xs md:text-sm leading-relaxed mb-6 max-w-xs">
              {detailedInfo}
            </p>

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
