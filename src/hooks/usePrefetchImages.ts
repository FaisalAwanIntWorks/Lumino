import { useEffect } from "react";
import { preloadImage } from "@/lib/image-preload";

/**
 * Best-effort background prefetching for a set of image URLs.
 * Uses an in-memory cache to avoid re-fetching the same URL repeatedly.
 */
export function usePrefetchImages(
  urls: Array<string | null | undefined>,
  enabled: boolean,
  cacheKey: string
) {
  useEffect(() => {
    if (!enabled) return;

    // cacheKey is intentionally unused beyond the dep-array.
    // It controls when we attempt to prefetch a new set of URLs.
    void cacheKey;

    urls
      .filter((u): u is string => Boolean(u))
      .forEach((url) => {
        // Best effort: ignore errors; the main viewer will handle failed loads.
        preloadImage(url).catch(() => undefined);
      });
  }, [enabled, cacheKey, urls]);
}
