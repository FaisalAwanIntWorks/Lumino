import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, Package, Video, FileBox, Camera } from 'lucide-react';
import { getProductCdnImageUrl, constructCdnImageUrl } from '@/lib/cdn-utils';
import { fallbackToPngOnError, toWebpImageUrl } from '@/lib/webp-image-fallback';
import { ASSET_CDN } from "@/lib/asset-cdn";

interface MasterDbItem {
  id: string;
  unique_id: string;
  combination_id: string;
  style_id: string | null;
  style_name: string | null;
  shank_id: string | null;
  shank_name: string | null;
  visual_color: string | null;
  visual_color_name: string | null;
  shape_id: string | null;
  shape_name: string | null;
  base_price: number | null;
  product_name: string | null;
  folder_path: string | null;
  image_0_filename: string | null;
  image_1_filename: string | null;
  image_2_filename: string | null;
  image_3_filename: string | null;
  image_url_0: string | null;
  image_url_1: string | null;
  image_url_2: string | null;
  image_url_3: string | null;
  video_filename: string | null;
  video_url: string | null;
  video_status: boolean | null;
  glb_model_filename: string | null;
  glb_model_status: boolean | null;
  model_3d_url: string | null;
  model_photo_filename: string | null;
  model_photo_url: string | null;
  model_photo_status: boolean | null;
  rendered_cad_filename: string | null;
  rendered_cad_url: string | null;
  rendered_cad_status: boolean | null;
  manufacture_cad_filename: string | null;
  manufacture_cad_url: string | null;
  manufacture_cad_status: boolean | null;
  transparent_0_filename: string | null;
  transparent_1_filename: string | null;
  transparent_2_filename: string | null;
  transparent_3_filename: string | null;
  transparent_url_0: string | null;
  transparent_url_1: string | null;
  transparent_url_2: string | null;
  transparent_url_3: string | null;
  notes: string | null;
  drive_link: string | null;
  all_upload_complete: boolean | null;
  total_files: number | null;
  files_uploaded: string | null;
  created_at: string | null;
}

interface ProductDetailDialogProps {
  item: MasterDbItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const formatProductTitle = (combinationId: string): string => {
  return combinationId
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
};

export function ProductDetailDialog({ item, open, onOpenChange }: ProductDetailDialogProps) {
  const [currentSlide, setCurrentSlide] = useState(0);

  if (!item) return null;

  const title = item.product_name || formatProductTitle(item.combination_id);

  // Collect all media items for the carousel
  type MediaItem = { type: 'image' | 'video'; url: string; label: string };
  const mediaItems: MediaItem[] = [];

  // Add ring images (angles 0-3)
  for (let i = 0; i < 4; i++) {
    const url = getProductCdnImageUrl(item, i);
    if (url) {
      mediaItems.push({ type: 'image', url, label: `Angle ${i + 1}` });
    }
  }

  // Add 5th image from ring-description CDN bucket (image_4_filename)
  const image4Filename = (item as unknown as { image_4_filename?: string | null }).image_4_filename;
  if (image4Filename && item.folder_path) {
    const folderPathNoRings = item.folder_path
      .replace(/^rings\//, '')
      .replace(/\bhalo\b/g, 'Halo')
      .replace(/\bsolitaire\b/g, 'Solitaire');
    // Served as WebP; the <img> falls back to the .png twin on error.
    const url = toWebpImageUrl(`${ASSET_CDN.rings}/ring-description/${folderPathNoRings}/${image4Filename}`);
    mediaItems.push({ type: 'image', url, label: `Angle 5` });
  }

  // Only show ring images (angles 0-4), no transparent/model/video

  const goNext = () => setCurrentSlide((prev) => (prev + 1) % mediaItems.length);
  const goPrev = () => setCurrentSlide((prev) => (prev - 1 + mediaItems.length) % mediaItems.length);

  // Reset slide when dialog opens with new item
  const handleOpenChange = (open: boolean) => {
    if (!open) setCurrentSlide(0);
    onOpenChange(open);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto p-0">
        <DialogHeader className="p-4 sm:p-6 pb-0">
          <DialogTitle className="text-lg sm:text-xl">{title}</DialogTitle>
        </DialogHeader>

        <div className="px-4 sm:px-6 pb-4 sm:pb-6 space-y-5">
          {/* Carousel */}
          {mediaItems.length > 0 ? (
            <div className="relative">
              <div className="aspect-square bg-muted rounded-lg overflow-hidden">
                {mediaItems[currentSlide]?.type === 'video' ? (
                  <video
                    src={mediaItems[currentSlide].url}
                    controls
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <a
                    href={mediaItems[currentSlide]?.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block w-full h-full"
                  >
                    <img
                      src={mediaItems[currentSlide]?.url}
                      alt={mediaItems[currentSlide]?.label}
                      className="w-full h-full object-contain cursor-zoom-in"
                      onError={fallbackToPngOnError}
                    />
                  </a>
                )}
              </div>

              {mediaItems.length > 1 && (
                <>
                  <Button
                    variant="outline"
                    size="icon"
                    className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-background/80 backdrop-blur-sm h-8 w-8"
                    onClick={goPrev}
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-background/80 backdrop-blur-sm h-8 w-8"
                    onClick={goNext}
                  >
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </>
              )}

              {/* Thumbnail strip */}
              <div className="flex gap-2 mt-3 overflow-x-auto pb-1">
                {mediaItems.map((media, idx) => (
                  <button
                    key={idx}
                    onClick={() => setCurrentSlide(idx)}
                    className={`flex-shrink-0 w-14 h-14 rounded-md overflow-hidden border-2 transition-colors ${
                      idx === currentSlide ? 'border-primary' : 'border-transparent'
                    }`}
                  >
                    {media.type === 'video' ? (
                      <div className="w-full h-full bg-muted flex items-center justify-center">
                        <Video className="w-5 h-5 text-muted-foreground" />
                      </div>
                    ) : (
                      <img src={media.url} alt={media.label} className="w-full h-full object-cover" onError={fallbackToPngOnError} />
                    )}
                  </button>
                ))}
              </div>

              {/* Slide label */}
              <p className="text-xs text-muted-foreground text-center mt-1">
                {mediaItems[currentSlide]?.label} · {currentSlide + 1} / {mediaItems.length}
              </p>
            </div>
          ) : (
            <div className="aspect-video bg-muted rounded-lg flex items-center justify-center">
              <Package className="w-16 h-16 text-muted-foreground" />
            </div>
          )}

          {/* Ring Details */}
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <DetailRow label="Combination ID" value={item.combination_id} />
              <DetailRow label="Style" value={item.style_name} />
              <DetailRow label="Shank" value={item.shank_name} />
              <DetailRow label="Shape" value={item.shape_name} />
              <DetailRow label="Color" value={item.visual_color_name} />
              <DetailRow label="Base Price" value={item.base_price ? `$${item.base_price.toLocaleString()}` : null} />
            </div>

            {/* Asset Status */}
            <div>
              <h4 className="text-sm font-semibold mb-2">Asset Status</h4>
              <div className="flex flex-wrap gap-2">
                <AssetBadge label="Images" count={mediaItems.filter(m => m.label.startsWith('Angle')).length} total={5} />
                <AssetBadge label="Transparent" count={mediaItems.filter(m => m.label.startsWith('Transparent')).length} total={4} />
                <StatusBadge label="Video" status={item.video_status} />
                <StatusBadge label="3D Model" status={item.glb_model_status} />
                <StatusBadge label="Model Photo" status={item.model_photo_status} />
                <StatusBadge label="Rendered CAD" status={item.rendered_cad_status} />
                <StatusBadge label="Manufacture CAD" status={item.manufacture_cad_status} />
              </div>
            </div>


            {item.drive_link && (
              <a
                href={item.drive_link}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-primary hover:underline"
              >
                View on Google Drive →
              </a>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function DetailRow({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div>
      <span className="text-xs text-muted-foreground">{label}</span>
      <p className="text-sm font-medium">{value}</p>
    </div>
  );
}

function AssetBadge({ label, count, total }: { label: string; count: number; total: number }) {
  return (
    <Badge variant={count === total ? 'default' : count > 0 ? 'secondary' : 'outline'} className="text-xs">
      {label}: {count}/{total}
    </Badge>
  );
}

function StatusBadge({ label, status }: { label: string; status: boolean | null | undefined }) {
  return (
    <Badge variant={status ? 'default' : 'outline'} className="text-xs">
      {label}: {status ? '✓' : '✗'}
    </Badge>
  );
}
