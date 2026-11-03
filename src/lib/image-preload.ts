export type ImagePreloadStatus = "loading" | "loaded" | "error";

type CacheEntry = {
  status: ImagePreloadStatus;
  promise: Promise<void>;
};

/**
 * In-session (in-memory) image preload cache.
 * De-dupes concurrent downloads and allows instant swaps once an image was loaded once.
 */
const imageCache = new Map<string, CacheEntry>();

export function isImagePreloaded(url: string) {
  return imageCache.get(url)?.status === "loaded";
}

export function preloadImage(url: string): Promise<void> {
  const existing = imageCache.get(url);
  if (existing) return existing.promise;

  const entry: CacheEntry = {
    status: "loading",
    // placeholder, replaced below
    promise: Promise.resolve(),
  };

  entry.promise = new Promise<void>((resolve, reject) => {
    const img = new Image();
    img.decoding = "async";
    img.loading = "eager";

    img.onload = () => {
      entry.status = "loaded";
      resolve();
    };

    img.onerror = () => {
      entry.status = "error";
      reject(new Error("Image failed to load"));
    };

    img.src = url;
  });

  imageCache.set(url, entry);
  return entry.promise;
}
