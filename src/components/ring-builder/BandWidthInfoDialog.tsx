import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/button';
import { X, Ruler } from 'lucide-react';

interface BandWidthInfoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const BandWidthInfoDialog = ({ open, onOpenChange }: BandWidthInfoDialogProps) => {
  if (!open) return null;

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
            <div className="w-20 h-20 rounded-full flex items-center justify-center mb-5 border border-border bg-muted/20">
              <Ruler className="w-10 h-10 text-foreground/80" />
            </div>

            <span className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground mb-2">
              Details
            </span>

            <h2 className="font-serif text-2xl md:text-3xl text-foreground mb-4">
              Band Width
            </h2>

            <p className="text-muted-foreground text-xs md:text-sm leading-relaxed mb-6 max-w-xs">
              Minimum 3mm is recommended to avoid any bending of the ring.
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
