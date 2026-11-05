import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Ring3DViewer } from './Ring3DViewer';
import { Gem } from 'lucide-react';

interface Ring3DViewerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  modelPath: string;
}

export function Ring3DViewerDialog({ open, onOpenChange, modelPath }: Ring3DViewerDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl h-[80vh]">
        <DialogHeader>
          <DialogTitle className="text-2xl font-semibold">3D Ring Preview</DialogTitle>
        </DialogHeader>
        <div className="flex-1 relative h-full">
          <Ring3DViewer modelPath={modelPath} />
          <div className="absolute bottom-4 right-4 flex items-center gap-2 bg-background/80 backdrop-blur-sm px-3 py-2 rounded-full border border-border shadow-lg">
            <Gem className="h-3 w-3 text-primary" />
            <span className="text-xs font-medium text-foreground">
              Powered by <span className="gradient-text font-semibold">Aurezo</span>
            </span>
          </div>
        </div>
        <div className="text-center text-sm text-muted-foreground mt-4">
          <p>Use mouse to rotate • Scroll to zoom</p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
