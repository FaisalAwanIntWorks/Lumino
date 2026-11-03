import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Diamond } from "lucide-react";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getOrderRingAssetLookup } from "@/lib/order-utils";
import { constructCdnImageUrl } from "@/lib/cdn-utils";

interface RingImagePreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  configuration: Record<string, unknown> | null;
}

export default function RingImagePreviewDialog({ open, onOpenChange, configuration }: RingImagePreviewDialogProps) {
  const [images, setImages] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !configuration) {
      setImages([]);
      return;
    }

    const lookup = getOrderRingAssetLookup(configuration);
    if (!lookup?.combinationId) {
      setImages([]);
      return;
    }

    setLoading(true);
    const fetch = async () => {
      try {
        const { data } = await supabase
          .from('my_master_db_data')
          .select('folder_path, image_0_filename, image_1_filename, image_2_filename, image_3_filename')
          .eq('combination_id', lookup.combinationId)
          .limit(1)
          .maybeSingle();

        if (data?.folder_path) {
          const imgs: string[] = [];
          for (let i = 0; i < 4; i++) {
            const filename = (data as any)[`image_${i}_filename`];
            if (filename) {
              const url = constructCdnImageUrl(data.folder_path, filename);
              if (url) imgs.push(url);
            }
          }
          setImages(imgs);
        }
      } catch (err) {
        console.error('Failed to load ring images:', err);
      } finally {
        setLoading(false);
      }
    };
    fetch();
  }, [open, configuration]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Ring Preview</DialogTitle>
        </DialogHeader>
        {loading ? (
          <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">Loading images…</div>
        ) : images.length > 0 ? (
          <div className="grid grid-cols-2 gap-3">
            {images.map((url, idx) => (
              <a
                key={idx}
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="aspect-square rounded-lg border border-border bg-muted/30 overflow-hidden hover:border-primary transition-colors"
              >
                <img
                  src={url}
                  alt={`Angle ${idx + 1}`}
                  className="w-full h-full object-cover"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                />
              </a>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-40 text-muted-foreground">
            <Diamond className="h-8 w-8 mb-2 opacity-40" />
            <p className="text-sm">No ring images available</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
