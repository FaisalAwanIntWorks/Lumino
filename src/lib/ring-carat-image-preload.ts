import { preloadImage } from '@/lib/image-preload';
import { toPngImageUrl } from '@/lib/webp-image-fallback';

const MAX_CONCURRENT = 3;

let active = 0;
let queue: string[] = [];
const queued = new Set<string>();

const saveDataEnabled = (): boolean => {
  if (typeof navigator === 'undefined') return false;
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  return Boolean(connection?.saveData);
};

const warmWithFallback = async (url: string): Promise<void> => {
  try {
    await preloadImage(url);
  } catch {
    const pngUrl = toPngImageUrl(url);
    if (pngUrl !== url) await preloadImage(pngUrl).catch(() => undefined);
  }
};

const pump = () => {
  while (active < MAX_CONCURRENT && queue.length > 0) {
    const url = queue.shift();
    if (!url) continue;
    queued.delete(url);
    active += 1;
    void warmWithFallback(url).finally(() => {
      active -= 1;
      pump();
    });
  }
};

/** Current bucket first, then nearest neighbors, then the remaining buckets. */
export const prioritizeCaratImageUrls = (
  entries: ReadonlyArray<{ bucket: number; url: string | null | undefined }>,
  currentBucket: number,
): string[] => {
  const unique = new Map<string, number>();
  entries.forEach(({ bucket, url }) => {
    if (url && !unique.has(url)) unique.set(url, bucket);
  });

  return Array.from(unique.entries())
    .sort(([, bucketA], [, bucketB]) => {
      const distance = Math.abs(bucketA - currentBucket) - Math.abs(bucketB - currentBucket);
      return distance || bucketA - bucketB;
    })
    .map(([url]) => url);
};

/** Best-effort speculative warming. Visible images still load when data saver is enabled. */
export const queueRingCaratImagePreload = (urls: ReadonlyArray<string>): void => {
  if (saveDataEnabled()) return;

  urls.forEach((url) => {
    if (!url || queued.has(url) || queue.includes(url)) return;
    queued.add(url);
    queue.push(url);
  });
  pump();
};
