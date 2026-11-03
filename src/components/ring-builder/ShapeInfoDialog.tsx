import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/button';
import { ShapeOption } from '@/types/ring-builder';
import { X } from 'lucide-react';
import { ShapeIcon } from '@/components/common/ShapeIcon';

interface ShapeInfoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  shape: ShapeOption | null;
  theme?: string;
}

const SHAPE_DETAILED_INFO: Record<string, string> = {
  'round': 'The most popular diamond shape, precision engineered with 58 facets to maximize light reflection and deliver unmatched brilliance. Its symmetrical form makes it incredibly versatile, pairing beautifully with every ring style and setting.',
  'oval': 'An elegant elongated shape that creates the illusion of longer, slender fingers while delivering brilliance comparable to a Round diamond. Its larger surface area also gives the appearance of a bigger stone for its carat weight.',
  'princess': 'A modern square silhouette with sharp, clean angles that delivers exceptional fire and brilliance. Its contemporary geometric look makes it the second most popular choice for engagement rings, offering a bold alternative to the classic Round.',
  'radiant': 'A stunning hybrid that combines the refined rectangular outline of an Emerald shape with the dazzling sparkle of a Round. Its numerous facets create intense light performance, making it an excellent choice for those who want elegance and brilliance in one stone.',
  'emerald': 'A sophisticated step cut design with long, parallel facets that create dramatic flashes of light known as the "hall of mirrors" effect. This shape celebrates clarity and understated elegance over pure sparkle, favored by those who appreciate timeless refinement.',
  'cushion': 'A timeless shape that blends a square or slightly elongated outline with soft, rounded corners, resembling a pillow. Its larger facets beautifully showcase the diamond\'s clarity while producing a romantic, vintage warmth that has been cherished for centuries.',
  'pear': 'A distinctive teardrop silhouette that combines the brilliance of a Round with the elongated elegance of a Marquise. Worn with the pointed end facing the fingertip, it creates a graceful, slimming effect on the hand and makes a beautifully unique statement.',
  'marquise': 'A bold, eye catching shape with an elongated body and two refined points at each end. Its dramatic silhouette maximizes carat weight, making it appear larger than other shapes of the same size while creating an elegant, lengthening effect on the finger.',
};

export const ShapeInfoDialog = ({ open, onOpenChange, shape, theme }: ShapeInfoDialogProps) => {
  if (!open || !shape) return null;

  const detailedInfo = SHAPE_DETAILED_INFO[shape.id] || 'A beautiful diamond shape with unique characteristics.';
  const iconVariant = theme === 'luxury' ? 'white-bg' : 'transparent';

  return createPortal(
    <div className="fixed inset-0 z-[60] animate-in fade-in-0 duration-200">
      <div className="jewlx-info-backdrop fixed inset-0 bg-black/60" onClick={() => onOpenChange(false)} />
      
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
              <ShapeIcon shapeId={shape.id} size="lg" variant={iconVariant} />
            </div>

            <span className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground mb-2">
              Diamond Shape
            </span>

            <h2 className="font-serif text-2xl md:text-3xl text-foreground mb-4">
              {shape.name}
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
