import { ChevronLeft, ChevronRight, Maximize, Minimize, Diamond, Info } from 'lucide-react';

import { useEffect, useMemo, useRef, useState } from 'react';
import { RingConfiguration } from '@/types/ring-builder';
import { Ring3DViewer } from './Ring3DViewer';

import { useRingVariantImages } from '@/hooks/useRingVariantImages';
import { usePreloadedImage } from '@/hooks/usePreloadedImage';
import { usePrefetchImages } from '@/hooks/usePrefetchImages';
import { fallbackToPngOnError } from '@/lib/webp-image-fallback';
import { Skeleton } from '@/components/ui/skeleton';
import { useWidgetTheme } from '@/contexts/WidgetThemeContext';
import { motion, AnimatePresence } from 'framer-motion';
import { ASSET_CDN } from "@/lib/asset-cdn";

interface ProductViewerProps {
  configuration: RingConfiguration;
  calculatePrice: () => number;
  isChatMode?: boolean; // When true, dynamically updates as selections are made via chat
  isCelebrating?: boolean; // When true, freeze the image display (don't reset or re-render)
  frozenConfiguration?: RingConfiguration | null; // When provided, use this for display instead of live configuration
  videoFirst?: boolean; // When true (outside chat mode), show the product video as the first carousel slide
}

// Map metal variant names to color families for image fetching
const getColorFamilyFromMetal = (metal: string | null | undefined): string | null => {
  if (!metal) return null;
  
  const metalLower = metal.toLowerCase();
  
  // Check for yellow gold
  if (metalLower.includes('yellow')) return 'yellow';
  
  // Check for rose gold
  if (metalLower.includes('rose') || metalLower.includes('pink')) return 'rose';
  
  // Check for white gold or platinum (both are "white" color family)
  if (metalLower.includes('white') || metalLower.includes('platinum')) return 'white';
  
  // Fallback - try to detect by common patterns
  if (metalLower.includes('gold')) {
    // Default gold to yellow if no color specified
    return 'yellow';
  }
  
  return null;
};

/**
 * The previous carousel slide, kept underneath the incoming one so a slide
 * change never shows a blank stage. It mounts at full opacity, dims after a
 * short grace period if the new slide is still downloading (next to the
 * skeleton), and fades out together with the new slide's fade-in.
 */
const HeldFrame = ({
  src,
  fadeOut,
  fadeMs,
  onFadedOut,
}: {
  src: string;
  fadeOut: boolean;
  fadeMs: number;
  onFadedOut: () => void;
}) => {
  // Dim only once the frame has painted at full opacity (and the new slide is
  // taking a while), so a cached slide never sees the previous one flicker.
  const [dimmed, setDimmed] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setDimmed(true), 150);
    return () => window.clearTimeout(timer);
  }, []);
  const opacity = fadeOut ? 0 : dimmed ? 0.35 : 1;
  return (
    <img
      src={src}
      alt=""
      aria-hidden="true"
      className="absolute inset-0 m-auto z-10 w-full h-full max-w-[330px] md:max-w-[480px] lg:max-w-[600px] object-contain drop-shadow-2xl pointer-events-none"
      draggable={false}
      style={{ opacity, transition: `opacity ${fadeMs}ms ease` }}
      onTransitionEnd={(e) => {
        if (fadeOut && e.propertyName === 'opacity') onFadedOut();
      }}
    />
  );
};

export const ProductViewer = ({
  configuration,
  calculatePrice,
  isChatMode = false,
  isCelebrating = false,
  frozenConfiguration = null,
  videoFirst = false,
}: ProductViewerProps) => {
  const [currentImage, setCurrentImage] = useState(0);
  
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showInfoPopover, setShowInfoPopover] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const { theme } = useWidgetTheme();

  // Detect whether the Fullscreen API is available (unsupported on iOS Safari / iframes)
  const fullscreenSupported = typeof document !== 'undefined' && 
    (document.fullscreenEnabled || (document as any).webkitFullscreenEnabled);

  // Listen for fullscreen changes (user can exit via Escape key)
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
    };
  }, []);

  const toggleFullscreen = async () => {
    if (!containerRef.current) return;
    
    if (document.fullscreenElement) {
      await document.exitFullscreen();
    } else {
      // Request fullscreen on the main embed container (parent of ProductViewer)
      const embedRoot = containerRef.current.closest('[data-theme]') as HTMLElement || containerRef.current;
      if (embedRoot.requestFullscreen) {
        await embedRoot.requestFullscreen();
      } else if ((embedRoot as any).webkitRequestFullscreen) {
        await (embedRoot as any).webkitRequestFullscreen();
      }
    }
  };
  
  // Use frozen configuration for display if provided (preserves state after celebration)
  const displayConfiguration = frozenConfiguration ?? configuration;
  
  // Fetch images from my_master_db_data based on display configuration
  const { images: variantImages, loading: imagesLoading } = useRingVariantImages(displayConfiguration);

  // Check if video is available to determine total media count (4 angles + optional model photo + optional video)
  const hasVideo = Boolean(variantImages?.video_url);
  const hasModelPhoto = Boolean(variantImages?.model_photo);
  const hasImage4 = false;
  const totalImages = 4 + (hasModelPhoto ? 1 : 0) + (hasVideo ? 1 : 0);

  // model photo sits right after the 4 angle images; video is always last by default.
  // When `videoFirst` is enabled (and not in chat mode), the product video moves to slot 0
  // and all other slides shift by one. Chat mode already reserves slot 0 for video.
  const videoFirstSlot = !isChatMode && videoFirst && hasVideo;
  const image4Index = -1;
  const modelPhotoIndex = hasModelPhoto ? (videoFirstSlot ? 5 : 4) : -1;
  // In chat mode, always reserve slide 0 for video to prevent race condition
  // where variantImages hasn't loaded yet but currentImage is already 0
  const videoIndex = isChatMode ? 0 : (videoFirstSlot ? 0 : (4 + (hasModelPhoto ? 1 : 0)));
  const imageAngleOffset = isChatMode || videoFirstSlot ? 1 : 0; // offset to map slide index → image angle


  const productTitle = useMemo(() => {
    const parts: string[] = [];

    if (displayConfiguration.style) {
      parts.push(displayConfiguration.style.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '));
    }

    if (displayConfiguration.shank) {
      parts.push(displayConfiguration.shank.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '));
    }

    // Show color family in title instead of metal ID/UUID
    if (displayConfiguration.metal) {
      const colorFamily = getColorFamilyFromMetal(displayConfiguration.metal);
      if (colorFamily) {
        const colorName = colorFamily.charAt(0).toUpperCase() + colorFamily.slice(1);
        if (colorFamily === 'white' && displayConfiguration.metal.toLowerCase().includes('platinum')) {
          parts.push('Platinum');
        } else {
          parts.push(`${colorName} Gold`);
        }
      }
    }

    if (displayConfiguration.shape) {
      parts.push(displayConfiguration.shape.charAt(0).toUpperCase() + displayConfiguration.shape.slice(1));
    }

    return parts.filter(Boolean).join(' ') || 'Custom Ring';
  }, [displayConfiguration.metal, displayConfiguration.shape, displayConfiguration.shank, displayConfiguration.style]);

  // When the user changes any ring-defining selection, reset to angle 0.
  // This ensures we always start from `image_0_filename` for the newly selected combination
  // (and avoids showing a previous angle filename that belongs to the prior configuration).
  // Skip this reset when celebration modal is active to prevent background image refresh.
  useEffect(() => {
    // Only reset image index when live configuration changes AND we're not using frozen config
    if (!isCelebrating && !frozenConfiguration) {
      setCurrentImage(0);
    }
  }, [displayConfiguration.style, displayConfiguration.shank, displayConfiguration.metal, displayConfiguration.shape, isCelebrating, frozenConfiguration]);



  // Default fallback image only used when no selection at all AND not in chat mode
  const INITIAL_FALLBACK_CDN_BASE = `${ASSET_CDN.rings}/Solitaire/high-polish/rose/round`;
  // Served as WebP (the Solitaire set has WebP twins); usePreloadedImage and the
  // <img> onError handler fall back to the .png if it cannot load.
  const INITIAL_FALLBACK_IMAGE = `${INITIAL_FALLBACK_CDN_BASE}/wex20aa6goaktc6150i1r.webp`;

  // Check if configuration is truly empty (chat reset state)
  const isConfigEmpty = !displayConfiguration.style && !displayConfiguration.shank && !displayConfiguration.metal && !displayConfiguration.shape;

  // Get image from database variant — NO hardcoded fallback to wrong combination
  const getImageForAngle = (slideIndex: number): string | null => {
    // If this slide is the video slot, return null (handled separately)
    if (slideIndex === videoIndex && hasVideo) return null;

    // If this slide is the 5th image slot (image_4), return it
    if (slideIndex === image4Index && hasImage4) {
      return variantImages?.image_angle_4 ?? null;
    }

    // If this slide is the model photo slot, return the model photo
    if (slideIndex === modelPhotoIndex && hasModelPhoto) {
      return variantImages?.model_photo ?? null;
    }

    // Convert slide index to image angle, accounting for video offset in chat mode
    const angle = slideIndex - imageAngleOffset;

    // Only use images from DB match for the current selection
    if (variantImages) {
      const angleKey = `image_angle_${angle}` as keyof typeof variantImages;
      const dbImage = variantImages[angleKey];
      if (dbImage) return dbImage as string;
    }

    const colorFamily = getColorFamilyFromMetal(displayConfiguration.metal);
    const hasFullSelection = Boolean(
      displayConfiguration.style &&
        displayConfiguration.shank &&
        colorFamily &&
        displayConfiguration.shape
    );

    // Full selection but no DB match → return null (don't show wrong ring images)
    if (hasFullSelection) return null;

    // If user has interacted with ANY option, never fall back to the hardcoded
    // rose-gold solitaire image — that causes the flicker on every click.
    // Returning null lets usePreloadedImage keep the last good frame on screen.
    if (!isConfigEmpty) return null;

    // Truly initial state only: allow style-only placeholder fallbacks (icons)
    return getProgressiveImagePath(angle);
  };

  // Progressive image path builder (fallback for partial selection)
  const getProgressiveImagePath = (angle?: number): string | null => {
    if (!displayConfiguration.style) return INITIAL_FALLBACK_IMAGE;

    const style = displayConfiguration.style;

    if (!displayConfiguration.shank) {
      if (style === 'solitaire') return `/images/rings/solitaire.png`;
      if (style === 'three-stone') return `/images/rings/three-stone.jpeg`;
      if (style === 'halo') return `/images/rings/halo.jpeg`;
      return `/images/rings/${style}.png`;
    }

    return null;
  };

  const desiredSrc = useMemo(() => getImageForAngle(currentImage), [currentImage, variantImages, displayConfiguration.style, displayConfiguration.shank, displayConfiguration.metal, displayConfiguration.shape, isChatMode, imageAngleOffset, videoIndex, hasVideo, modelPhotoIndex, hasModelPhoto, image4Index, hasImage4]);

  const showCarousel = useMemo(() => {
    // Only show carousel if we actually have DB-backed multi-angle images
    return Boolean(
      variantImages &&
        (variantImages.image_angle_0 ||
          variantImages.image_angle_1 ||
          variantImages.image_angle_2 ||
          variantImages.image_angle_3)
    );
  }, [variantImages]);

  // Keep showing the last known good image whenever desiredSrc is null (either because
  // the DB is still loading, or because no image exists for this combination).
  // This prevents flashing the wrong solitaire fallback when a shank/shape has no DB entry.
  const lastNonNullDesiredRef = useRef<string | null>(null);
  if (desiredSrc !== null) lastNonNullDesiredRef.current = desiredSrc;
  const effectiveDesiredSrc = (desiredSrc === null && !isConfigEmpty)
    ? lastNonNullDesiredRef.current
    : desiredSrc;

  const { displayedSrc, isLoading: isImageLoading } = usePreloadedImage(effectiveDesiredSrc);

  const visibleSrc = useMemo(() => {
    if (displayedSrc) return displayedSrc;
    if (effectiveDesiredSrc?.startsWith('/')) return effectiveDesiredSrc;
    return null;
  }, [displayedSrc, effectiveDesiredSrc]);

  // ── Carousel frames ───────────────────────────────────────────────────────
  // The slide's <img>/<video> mounts with the new URL straight away, so until
  // the browser finishes downloading it the slide would be blank. Two layers
  // avoid any flash or jump while switching slides:
  //   • `heldFrame`  – the last frame that fully faded in. It stays on screen,
  //                    underneath, until the incoming image has faded in.
  //   • incoming     – the <img> for the current slide, invisible until it has
  //                    really painted, then crossfaded over the held frame.
  // Both layers are absolutely positioned inside a fixed-size stage, so the
  // layout never changes mid-transition (the old popLayout exit made the
  // previous image jump while it faded out).
  // `src` is what the browser actually loaded (a .webp may have fallen back
  // to its .png twin), `key` is the slide URL React keys the <img> by.
  type Frame = { key: string; src: string };
  const imgSrc = effectiveDesiredSrc ?? visibleSrc ?? INITIAL_FALLBACK_IMAGE;
  const [loadedImg, setLoadedImg] = useState<Frame | null>(null);
  const [heldFrame, setHeldFrame] = useState<Frame | null>(null);
  const [readyVideoUrl, setReadyVideoUrl] = useState<string | null>(null);
  const FADE_MS = 200;

  // Once the current slide has loaded and the crossfade has finished, promote it
  // to the held frame so the previous slide underneath is dropped. The held
  // frame's own `transitionend` does this precisely; the timer is a fallback
  // (first slide, or a transition the browser skipped).
  useEffect(() => {
    if (!loadedImg || loadedImg.key !== imgSrc || heldFrame?.key === imgSrc) return;
    const timer = window.setTimeout(() => setHeldFrame(loadedImg), FADE_MS + 300);
    return () => window.clearTimeout(timer);
  }, [loadedImg, imgSrc, heldFrame]);

  // Prefetch all angles when carousel is relevant
  const angleSrcs = useMemo(() => {
    // Prefetch image slides only (skip video index)
    return Array.from({ length: totalImages }).map((_, i) => i === videoIndex ? null : getImageForAngle(i)).filter((s): s is string | null => true);
  }, [variantImages, displayConfiguration.style, displayConfiguration.shank, displayConfiguration.metal, displayConfiguration.shape, imageAngleOffset, videoIndex, totalImages, modelPhotoIndex, hasModelPhoto, image4Index, hasImage4]);

  const prefetchKey = useMemo(() => {
    const family = getColorFamilyFromMetal(displayConfiguration.metal) ?? '';
    return [displayConfiguration.style, displayConfiguration.shank, family, displayConfiguration.shape, variantImages?.image_angle_0].filter(Boolean).join('|');
  }, [displayConfiguration.style, displayConfiguration.shank, displayConfiguration.metal, displayConfiguration.shape, variantImages?.image_angle_0]);

  // Start warming all 4 angles as soon as we have any ring image to show.
  usePrefetchImages(angleSrcs, Boolean(desiredSrc), prefetchKey);

  const shouldShow3DModel = () => {
    return false;
  };

  const shouldShowCarousel = () => showCarousel;

  const getProductTitle = () => productTitle;

  const nextImage = () => {
    setCurrentImage(prev => (prev + 1) % totalImages);
  };

  const prevImage = () => {
    setCurrentImage(prev => (prev - 1 + totalImages) % totalImages);
  };

  // Which slide is on screen mirrors the render branches below. Placeholder
  // slides (3D notice, chat empty state, chat video placeholder) draw their own
  // content, so they never get the media skeleton.
  const isVideoSlide = currentImage === videoIndex && hasVideo && Boolean(variantImages?.video_url);
  const isPlaceholderSlide =
    shouldShow3DModel() ||
    (isChatMode && isConfigEmpty) ||
    (isChatMode && currentImage === 0 && (!hasVideo || imagesLoading) && !isConfigEmpty);
  const imgReady = loadedImg?.key === imgSrc;
  // Previous frame to keep on screen while the current slide is still loading
  // or fading in. Dropped once the incoming image is fully visible.
  const previousFrame = heldFrame && heldFrame.key !== imgSrc ? heldFrame : null;
  const showMediaSkeleton =
    !isPlaceholderSlide &&
    (isVideoSlide ? readyVideoUrl !== variantImages?.video_url : !imgReady);

  // Theme-based styles
  const isModern = theme === 'modern';
  const containerBg = isModern ? 'bg-card' : 'bg-background';
  const brandColor = isModern ? 'text-foreground' : 'text-white';
  // 24k has its own bottom identity bar, so avoid duplicating the ring name below the image.
  const showProductInfo = theme !== 'twentyfourk';
  const productTitleText = displayConfiguration.style ? getProductTitle() : 'Custom Ring';
  const isVideoActive = currentImage === videoIndex && hasVideo;

  return (
    <div ref={containerRef} className={`relative ${isVideoActive ? 'bg-black' : containerBg} h-full flex flex-col p-3 md:p-4 lg:p-6 transition-colors duration-300`}>
      {/* Fullscreen Toggle Button - Top Left (hidden when API unavailable, e.g. iOS/iframes) */}
      {fullscreenSupported && (
        <button
          onClick={toggleFullscreen}
          className={`absolute top-3 left-3 z-20 p-2 rounded-full transition-colors ${
            isModern 
              ? 'bg-muted hover:bg-muted/80' 
              : 'bg-foreground/10 hover:bg-foreground/20'
          }`}
          aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
          title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
        >
          {isFullscreen ? (
            <Minimize className="w-5 h-5 text-foreground" />
          ) : (
            <Maximize className="w-5 h-5 text-foreground" />
          )}
        </button>
      )}

      {/* Info Icon - click-to-toggle for mobile support */}
      <div className="absolute top-3 right-3 z-20">
        <button
          onClick={() => setShowInfoPopover(prev => !prev)}
          className="p-2 rounded-full transition-colors bg-[hsl(var(--background))] shadow-sm"
          aria-label="Image information"
        >
          <Info className="w-4 h-4 text-[hsl(var(--accent-gold))]" />
        </button>
        {showInfoPopover && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setShowInfoPopover(false)} />
            <div className="absolute right-0 top-full mt-2 z-20 w-[220px] rounded-lg border border-[hsl(var(--accent-gold))] bg-[hsl(var(--background))] p-3 shadow-lg text-foreground text-xs leading-relaxed">
              <p>Render image is</p>
              <ul className="list-disc pl-4 mt-1">
                <li>Size 6 ring</li>
                <li>3 carat</li>
                <li>3mm band width</li>
              </ul>
            </div>
          </>
        )}
      </div>

      {/* Navigation Arrows */}
      {showCarousel && (() => {
        // Videos have a black background — force white arrows on the video slide
        // so users can still see the prev/next controls. All other slides keep the
        // themed foreground color (typically dark on light backgrounds).
        const isVideoSlide = hasVideo && currentImage === videoIndex;
        const nonModernColor = isVideoSlide
          ? 'text-white/90 hover:text-white'
          : 'text-foreground/70 hover:text-foreground';
        return (
          <>
            <button
              onClick={prevImage}
              className={`absolute left-2 md:left-4 top-1/2 -translate-y-1/2 transition-all duration-200 hover:scale-110 z-10 active:scale-95 ${
                isModern
                  ? 'p-1.5 md:p-2.5 rounded-full bg-black/40 hover:bg-black/55 backdrop-blur-sm text-white hover:text-white'
                  : `p-1 md:p-2 ${nonModernColor}`
              }`}
            >
              <ChevronLeft className="w-5 h-5 md:w-6 md:h-6" />
            </button>
            <button
              onClick={nextImage}
              className={`absolute right-2 md:right-4 top-1/2 -translate-y-1/2 transition-all duration-200 hover:scale-110 z-10 active:scale-95 ${
                isModern
                  ? 'p-1.5 md:p-2.5 rounded-full bg-black/40 hover:bg-black/55 backdrop-blur-sm text-white hover:text-white'
                  : `p-1 md:p-2 ${nonModernColor}`
              }`}
            >
              <ChevronRight className="w-5 h-5 md:w-6 md:h-6" />
            </button>
          </>
        );
      })()}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col pt-2 md:pt-14 min-h-0 md:min-h-[auto]">
        {/* Image Area. Mobile: the media box fills the space it is given (up to
            28vh) so the ring scales down when the viewer shrinks for a crowded
            step, instead of being clipped. Fixed heights from md up. */}
        <div className="flex-1 flex items-center justify-center min-h-0">
          <div className="relative w-full max-w-[280px] md:max-w-[500px] lg:max-w-[620px] mx-auto flex items-center justify-center h-full max-h-[28vh] md:h-[400px] md:max-h-none lg:h-[500px]">
            {/* Static glow — lives outside AnimatePresence so it never re-mounts */}
            <div 
              className="absolute inset-0 bg-foreground/5 rounded-full blur-2xl pointer-events-none"
              style={{ opacity: 0.8, transform: 'scale(0.8)' }}
            />
            {/* Skeleton while the current slide's image/video is still downloading.
                Delayed slightly so cached images never flash it. */}
            <AnimatePresence>
              {showMediaSkeleton && (
                <motion.div
                  key="media-skeleton"
                  role="status"
                  aria-busy="true"
                  className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1, transition: { delay: 0.15, duration: 0.2 } }}
                  exit={{ opacity: 0, transition: { duration: 0.15 } }}
                >
                  <span className="sr-only">Loading image…</span>
                  <div className="h-[85%] max-h-[440px] aspect-square max-w-full rounded-2xl bg-neutral-500/30 animate-pulse flex items-center justify-center">
                    <Diamond className="w-12 h-12 md:w-16 md:h-16 text-neutral-500/60" />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
            <AnimatePresence mode="wait">
              {shouldShow3DModel() ? (
                <motion.div 
                  key="3d-model"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="w-full h-full relative"
                >
                  {/* 3D model removed from repo for size – upload via Asset Sheet and load from cloud storage */}
                  <div className="w-full h-full flex items-center justify-center">
                    <p className="text-muted-foreground text-sm text-center px-4">3D preview unavailable — upload a model via Asset Sheet</p>
                  </div>
                  <div className={`absolute bottom-3 left-1/2 -translate-x-1/2 text-muted-foreground text-xs md:text-sm px-3 py-1 backdrop-blur-sm border border-border/30 ${
                    isModern ? 'bg-card/80 rounded-full' : 'bg-card/60 rounded-full'
                  }`}>
                    Drag to rotate • Scroll to zoom
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key="ring-image-container"
                  initial={{ opacity: 1 }}
                  animate={{ opacity: 1 }}
                  className="relative w-full h-full flex items-center justify-center"
                >
                  
                  {/* Show video when on video slide */}
                  {/* Show skeleton in chat mode when config is empty (after reset) */}
                  {isChatMode && isConfigEmpty ? (
                    <motion.div
                      className="relative z-10 w-full max-w-[330px] md:max-w-[480px] lg:max-w-[600px] flex flex-col items-center justify-center gap-4"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ duration: 0.3 }}
                    >
                      <Diamond className="w-12 h-12 md:w-16 md:h-16 text-muted-foreground/30" />
                      <p className="text-muted-foreground text-sm text-center px-4">Chat with the AI to start designing your ring</p>
                    </motion.div>
                  ) : isChatMode && currentImage === 0 && (!hasVideo || imagesLoading) && !isConfigEmpty ? (
                    /* Chat mode: slide 0 is reserved for video. Show skeleton while loading or if no video yet */
                    <motion.div
                      className="relative z-10 w-full max-w-[330px] md:max-w-[480px] lg:max-w-[600px] flex items-center justify-center"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ duration: 0.3 }}
                    >
                      <Skeleton className="h-[280px] md:h-[400px] lg:h-[500px] w-full rounded-xl" />
                    </motion.div>
                  ) : currentImage === videoIndex && hasVideo && variantImages?.video_url ? (
                    <motion.div
                      className="relative z-10 w-full h-full md:h-auto max-w-[330px] md:max-w-[480px] lg:max-w-[600px] flex items-center justify-center"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ duration: 0.3 }}
                    >
                      <video
                        key={variantImages.video_url}
                        src={variantImages.video_url}
                        className="w-full max-h-full md:max-h-[400px] lg:max-h-[500px] object-contain rounded-lg drop-shadow-2xl"
                        autoPlay
                        loop
                        muted
                        playsInline
                        controls={false}
                        onLoadedData={() => setReadyVideoUrl(variantImages.video_url)}
                        onError={() => setReadyVideoUrl(variantImages.video_url)}
                      />
                    </motion.div>
                  ) : (
                    <>
                      {/* Previous slide, held underneath until the new one has faded in.
                          Dims (after the same delay as the skeleton) only when the
                          incoming image is slow, so cached slides crossfade cleanly. */}
                      {/* Plain CSS transitions here, not framer-motion: its WAAPI
                          opacity tween drops to 0 for one frame when it commits,
                          which reads as a flicker on every slide change. */}
                      {previousFrame && (
                        <HeldFrame
                          key={`held:${previousFrame.key}`}
                          src={previousFrame.src}
                          fadeOut={imgReady}
                          fadeMs={FADE_MS}
                          onFadedOut={() => { if (loadedImg?.key === imgSrc) setHeldFrame(loadedImg); }}
                        />
                      )}
                      <img
                        key={imgSrc}
                        src={imgSrc}
                        alt={effectiveDesiredSrc ? getProductTitle() : 'Custom Ring'}
                        className="absolute inset-0 m-auto z-10 w-full h-full max-w-[330px] md:max-w-[480px] lg:max-w-[600px] object-contain drop-shadow-2xl"
                        loading="eager"
                        draggable={false}
                        decoding="async"
                        onLoad={(e) => {
                          const el = e.currentTarget;
                          const frame: Frame = { key: imgSrc, src: el.getAttribute('src') || imgSrc };
                          // Wait for the decode too: flipping opacity on a loaded-but-undecoded
                          // image stalls the first frame of the fade (visible as a hitch).
                          const decoded = typeof el.decode === 'function' ? el.decode().catch(() => undefined) : Promise.resolve();
                          decoded.then(() => setLoadedImg(frame));
                        }}
                        onError={(e) => {
                          // No .png retry left: the image is broken, so end the skeleton.
                          if (!fallbackToPngOnError(e)) setLoadedImg({ key: imgSrc, src: imgSrc });
                        }}
                        style={{ opacity: imgReady ? 1 : 0, transition: `opacity ${FADE_MS}ms ease` }}
                      />
                    </>
                  )}

                  {(imagesLoading || isImageLoading) && !visibleSrc && (
                    <motion.div 
                      className="absolute inset-0 flex items-center justify-center z-20"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                    >
                      <div className="relative">
                        <Skeleton className="h-[280px] md:h-[400px] lg:h-[500px] w-full rounded-xl" />
                      </div>
                    </motion.div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Carousel Dots + Product Name (combined for mobile visibility) */}
        <div className="flex-shrink-0 flex flex-col items-center justify-center gap-1 md:gap-2 py-0.5 md:py-2">
          {/* Dots */}
          {showCarousel && (
            <div className="flex gap-2 items-center">
              {Array.from({ length: totalImages }).map((_, index) => (
                <button 
                  key={index} 
                  onClick={() => setCurrentImage(index)} 
                  className={`transition-all duration-300 hover:scale-110 ${
                    isModern ? 'rounded-full' : 'rounded-full'
                  } ${
                    index === currentImage 
                      ? `w-6 h-1.5 ${isModern ? 'bg-primary' : 'bg-foreground'} shadow-lg shadow-foreground/25` 
                      : `w-1.5 h-1.5 ${isModern ? 'bg-primary/30 hover:bg-primary/50' : 'bg-foreground/30 hover:bg-foreground/50'}`
                  }`}
                  aria-label={index === videoIndex ? 'View video' : `View image ${index === videoIndex ? index : (isChatMode && hasVideo ? index : index + 1)}`}
                />
              ))}
            </div>
          )}
          
          {/* Product Name - Always visible on mobile */}
          {showProductInfo && (
            <div className="text-center space-y-0.5 md:space-y-1 pt-0.5 md:pt-2">
              <h2 className={`font-display text-xs md:text-xl lg:text-2xl font-semibold tracking-wide px-2 leading-tight line-clamp-1 italic ${isVideoActive ? 'text-white' : 'text-foreground'}`}>
                {productTitleText}
              </h2>
              <p className={`text-[6px] md:text-[9px] tracking-widest uppercase ${isVideoActive ? 'text-white' : brandColor}`}>
                Powered By Aurezo
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
