import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Package, DollarSign, Save, Loader2, ChevronLeft, ChevronRight } from 'lucide-react';
import { getProductCdnImageUrl } from '@/lib/cdn-utils';
import { fallbackToPngOnError } from '@/lib/webp-image-fallback';

// Type for my_master_db_data entries
interface MasterDbData {
  id: string;
  unique_id: string;
  combination_id: string;
  style_id: string;
  style_name: string | null;
  shank_id: string;
  shank_name: string | null;
  visual_color: string;
  visual_color_name: string | null;
  shape_id: string;
  shape_name: string | null;
  base_price: number | null;
  image_url_0: string | null;
  image_url_1: string | null;
  image_url_2: string | null;
  image_url_3: string | null;
  image_0_filename: string | null;
  image_1_filename: string | null;
  image_2_filename: string | null;
  image_3_filename: string | null;
  folder_path: string | null;
  product_name: string | null;
}

interface ClientCatalogItem {
  id: string;
  master_db_id: string | null;
  is_enabled: boolean;
  markup_percentage: number | null;
  custom_price: number | null;
  my_master_db_data: MasterDbData | null;
}

interface CatalogProductEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: ClientCatalogItem;
  calculatedDefaultPrice: number;
  onSave: (itemId: string, updates: { is_enabled: boolean; custom_price: number | null }) => Promise<void>;
}

// Helper function to format combination_id: "solitaire-high-polish-yellow-pear" -> "Solitaire High Polish Yellow Pear"
const formatProductTitle = (combinationId: string): string => {
  return combinationId
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
};

export const CatalogProductEditDialog = ({
  open,
  onOpenChange,
  item,
  calculatedDefaultPrice,
  onSave,
}: CatalogProductEditDialogProps) => {
  const masterItem = item.my_master_db_data;
  const [isEnabled, setIsEnabled] = useState(item.is_enabled);
  const [customPrice, setCustomPrice] = useState<string>(
    item.custom_price?.toString() || calculatedDefaultPrice.toString()
  );
  const [isSaving, setIsSaving] = useState(false);

  const [currentSlide, setCurrentSlide] = useState(0);

  // Collect ring images
  const mediaItems: { url: string; label: string }[] = [];
  if (masterItem) {
    for (let i = 0; i < 4; i++) {
      const url = getProductCdnImageUrl(masterItem, i);
      if (url) {
        mediaItems.push({ url, label: `Angle ${i + 1}` });
      }
    }
  }

  const goNext = () => setCurrentSlide((prev) => (prev + 1) % mediaItems.length);
  const goPrev = () => setCurrentSlide((prev) => (prev - 1 + mediaItems.length) % mediaItems.length);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSave(item.id, {
        is_enabled: isEnabled,
        custom_price: customPrice ? Number(customPrice) : null,
      });
      onOpenChange(false);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Product</DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          {/* Product Title */}
          <div>
            <h3 className="font-medium text-sm">
              {masterItem ? formatProductTitle(masterItem.combination_id) : 'Unknown Product'}
            </h3>
            <div className="flex flex-wrap gap-1 mt-1.5">
              <Badge variant="outline" className="text-xs">{masterItem?.style_id}</Badge>
              <Badge variant="outline" className="text-xs">{masterItem?.shank_id}</Badge>
              <Badge variant="outline" className="text-xs">{masterItem?.shape_id}</Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-1">Color: {masterItem?.visual_color}</p>
          </div>

          {/* Image Carousel */}
          {mediaItems.length > 0 ? (
            <div className="relative">
              <div className="aspect-square bg-muted rounded-lg overflow-hidden">
                <img
                  src={mediaItems[currentSlide]?.url}
                  alt={mediaItems[currentSlide]?.label}
                  className="w-full h-full object-contain"
                  onError={fallbackToPngOnError}
                />
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
              <div className="flex gap-2 mt-2 justify-center">
                {mediaItems.map((media, idx) => (
                  <button
                    key={idx}
                    onClick={() => setCurrentSlide(idx)}
                    className={`flex-shrink-0 w-12 h-12 rounded-md overflow-hidden border-2 transition-colors ${
                      idx === currentSlide ? 'border-primary' : 'border-transparent'
                    }`}
                  >
                    <img src={media.url} alt={media.label} className="w-full h-full object-cover" onError={fallbackToPngOnError} />
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="aspect-square bg-muted rounded-lg flex items-center justify-center max-h-48">
              <Package className="w-12 h-12 text-muted-foreground" />
            </div>
          )}

          {/* Enable/Disable Toggle */}
          <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
            <div>
              <Label htmlFor="enabled" className="font-medium">Product Enabled</Label>
              <p className="text-xs text-muted-foreground">
                Disabled products won't appear in your embed widget
              </p>
            </div>
            <Switch
              id="enabled"
              checked={isEnabled}
              onCheckedChange={setIsEnabled}
            />
          </div>

          {/* Base Price (read-only) */}
          <div className="space-y-2">
            <Label className="text-muted-foreground">Base Price</Label>
            <div className="flex items-center gap-2 p-3 bg-muted/30 rounded-lg">
              <DollarSign className="w-4 h-4 text-muted-foreground" />
              <span className="text-lg font-medium">
                {masterItem?.base_price?.toLocaleString() || '0'}
              </span>
              <span className="text-xs text-muted-foreground">(from master catalog)</span>
            </div>
          </div>

          {/* Custom Price Override */}
          <div className="space-y-2">
            <Label htmlFor="custom-price">Your Custom Price</Label>
            <div className="flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-muted-foreground" />
              <Input
                id="custom-price"
                type="number"
                placeholder="Enter custom price"
                value={customPrice}
                onChange={(e) => setCustomPrice(e.target.value)}
                min={0}
                step={1}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Leave empty to use the base price
            </p>
          </div>

          {/* Save Button */}
          <Button onClick={handleSave} disabled={isSaving} className="w-full">
            {isSaving ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="w-4 h-4 mr-2" />
                Save Changes
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
