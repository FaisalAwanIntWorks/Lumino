import { useState, useCallback } from 'react';
import { ChevronLeft, ChevronRight, ZoomIn, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

interface ImageGalleryProps {
  images: string[];
  alt?: string;
}

export function ImageGallery({ images, alt = 'Product image' }: ImageGalleryProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isZoomed, setIsZoomed] = useState(false);
  const [imageError, setImageError] = useState<Set<number>>(new Set());

  const handlePrev = useCallback(() => {
    setCurrentIndex(prev => (prev === 0 ? images.length - 1 : prev - 1));
  }, [images.length]);

  const handleNext = useCallback(() => {
    setCurrentIndex(prev => (prev === images.length - 1 ? 0 : prev + 1));
  }, [images.length]);

  const handleThumbnailClick = useCallback((index: number) => {
    setCurrentIndex(index);
  }, []);

  const handleImageError = useCallback((index: number) => {
    setImageError(prev => new Set(prev).add(index));
  }, []);

  if (images.length === 0) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-muted/20 rounded-lg">
        <p className="text-muted-foreground">No images available</p>
      </div>
    );
  }

  const currentImage = images[currentIndex];
  const hasMultipleImages = images.length > 1;

  return (
    <div className="relative w-full h-full flex flex-col">
      {/* Main image container */}
      <div className="relative flex-1 flex items-center justify-center bg-black/20 rounded-lg overflow-hidden">
        {imageError.has(currentIndex) ? (
          <div className="flex flex-col items-center gap-2 text-muted-foreground">
            <div className="w-16 h-16 bg-muted/30 rounded-lg flex items-center justify-center">
              <ZoomIn className="w-8 h-8 opacity-50" />
            </div>
            <span className="text-sm">Image unavailable</span>
          </div>
        ) : (
          <img
            src={currentImage}
            alt={`${alt} ${currentIndex + 1}`}
            className="max-w-full max-h-full object-contain cursor-zoom-in transition-transform duration-200 hover:scale-[1.02]"
            onClick={() => setIsZoomed(true)}
            onError={() => handleImageError(currentIndex)}
          />
        )}

        {/* Navigation arrows */}
        {hasMultipleImages && (
          <>
            <Button
              variant="outline"
              size="icon"
              className="absolute left-2 top-1/2 -translate-y-1/2 bg-background/80 backdrop-blur-sm hover:bg-background"
              onClick={handlePrev}
            >
              <ChevronLeft className="w-5 h-5" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="absolute right-2 top-1/2 -translate-y-1/2 bg-background/80 backdrop-blur-sm hover:bg-background"
              onClick={handleNext}
            >
              <ChevronRight className="w-5 h-5" />
            </Button>
          </>
        )}

        {/* Zoom button */}
        {!imageError.has(currentIndex) && (
          <Button
            variant="outline"
            size="icon"
            className="absolute top-3 right-3 bg-background/80 backdrop-blur-sm"
            onClick={() => setIsZoomed(true)}
          >
            <ZoomIn className="w-4 h-4" />
          </Button>
        )}

        {/* Image counter */}
        {hasMultipleImages && (
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-background/80 backdrop-blur-sm px-3 py-1 rounded-full text-sm">
            {currentIndex + 1} / {images.length}
          </div>
        )}
      </div>

      {/* Thumbnails */}
      {hasMultipleImages && (
        <div className="mt-3 flex gap-2 overflow-x-auto pb-2 px-1">
          {images.map((image, index) => (
            <button
              key={index}
              onClick={() => handleThumbnailClick(index)}
              className={cn(
                'flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden border-2 transition-all',
                currentIndex === index
                  ? 'border-primary ring-2 ring-primary/30'
                  : 'border-border/50 hover:border-primary/50'
              )}
            >
              {imageError.has(index) ? (
                <div className="w-full h-full bg-muted/30 flex items-center justify-center">
                  <X className="w-4 h-4 text-muted-foreground" />
                </div>
              ) : (
                <img
                  src={image}
                  alt={`${alt} thumbnail ${index + 1}`}
                  className="w-full h-full object-cover"
                  onError={() => handleImageError(index)}
                />
              )}
            </button>
          ))}
        </div>
      )}

      {/* Zoom modal */}
      <Dialog open={isZoomed} onOpenChange={setIsZoomed}>
        <DialogContent className="max-w-[95vw] max-h-[95vh] p-0 bg-black/95 border-none">
          <div className="relative w-full h-[90vh] flex items-center justify-center p-4">
            <img
              src={currentImage}
              alt={`${alt} ${currentIndex + 1} zoomed`}
              className="max-w-full max-h-full object-contain"
            />
            
            {hasMultipleImages && (
              <>
                <Button
                  variant="outline"
                  size="icon"
                  className="absolute left-4 top-1/2 -translate-y-1/2 bg-background/20 border-white/20 hover:bg-background/40"
                  onClick={handlePrev}
                >
                  <ChevronLeft className="w-6 h-6" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  className="absolute right-4 top-1/2 -translate-y-1/2 bg-background/20 border-white/20 hover:bg-background/40"
                  onClick={handleNext}
                >
                  <ChevronRight className="w-6 h-6" />
                </Button>
              </>
            )}

            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white/80 text-sm">
              {currentIndex + 1} / {images.length}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
