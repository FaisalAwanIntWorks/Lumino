import { useEffect, useRef, useState } from "react";
import { isImagePreloaded, preloadImage } from "@/lib/image-preload";
import { toPngImageUrl } from "@/lib/webp-image-fallback";

interface UsePreloadedImageOptions {
  /** Debounce image swaps to avoid firing multiple downloads during rapid config changes */
  debounceMs?: number;
}

/**
 * Preloads an image URL and only swaps `displayedSrc` once fully loaded.
 * Guarantees that callers can always render `displayedSrc ?? desiredSrc` to avoid blank states.
 *
 * A `.webp` URL that fails to load is retried once as its `.png` twin, so CDN
 * images served WebP-first still display in browsers without WebP support (or
 * when the WebP file is missing) — `displayedSrc` then holds the `.png` URL.
 */
export function usePreloadedImage(
  desiredSrc: string | null,
  options: UsePreloadedImageOptions = {}
) {
  const { debounceMs = 0 } = options;
  const [displayedSrc, setDisplayedSrc] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastDesiredRef = useRef<string | null>(null);

  useEffect(() => {
    if (!desiredSrc) {
      lastDesiredRef.current = null;
      setDisplayedSrc(null);
      setIsLoading(false);
      setError(null);
      return;
    }

    if (desiredSrc === lastDesiredRef.current) return;
    lastDesiredRef.current = desiredSrc;

    // If we've already loaded this URL in this session, swap instantly.
    if (isImagePreloaded(desiredSrc)) {
      setDisplayedSrc(desiredSrc);
      setIsLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    let debounceTimer: number | undefined;
    setIsLoading(true);
    setError(null);

    debounceTimer = window.setTimeout(() => {
      const pngFallback = toPngImageUrl(desiredSrc);
      const hasPngFallback = pngFallback !== desiredSrc;

      const onFailed = () => {
        if (cancelled) return;
        // Never block rendering forever: allow caller to fall back to desiredSrc.
        setError("Image failed to load");
        setIsLoading(false);
        // If we have nothing on-screen yet, keep UI from going blank.
        setDisplayedSrc((prev) => prev ?? desiredSrc);
      };

      preloadImage(desiredSrc)
        .then(() => {
          if (cancelled) return;
          setDisplayedSrc(desiredSrc);
          setIsLoading(false);
        })
        .catch(() => {
          if (cancelled) return;
          if (!hasPngFallback) {
            onFailed();
            return;
          }
          // WebP failed (unsupported browser or missing file): show the .png twin.
          preloadImage(pngFallback)
            .then(() => {
              if (cancelled) return;
              setDisplayedSrc(pngFallback);
              setIsLoading(false);
            })
            .catch(onFailed);
        });
    }, debounceMs);

    return () => {
      cancelled = true;
      if (debounceTimer) window.clearTimeout(debounceTimer);
    };
  }, [desiredSrc, debounceMs]);

  return { displayedSrc, isLoading, error };
}
