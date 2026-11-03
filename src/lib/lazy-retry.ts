import { lazy, ComponentType } from "react";

const SESSION_KEY = "lazy_retry_reloaded";

/**
 * Wraps React.lazy() with automatic retry logic for failed chunk imports.
 * - Retries up to `maxRetries` times with a delay between attempts.
 * - After all retries fail, forces a page reload (once) to clear stale cache.
 * - Uses sessionStorage to prevent infinite reload loops.
 */
export function lazyRetry<T extends ComponentType<any>>(
  importFn: () => Promise<{ default: T }>,
  maxRetries = 3,
  retryDelay = 1000
) {
  return lazy(() => attemptImport(importFn, maxRetries, retryDelay));
}

async function attemptImport<T extends ComponentType<any>>(
  importFn: () => Promise<{ default: T }>,
  retriesLeft: number,
  retryDelay: number
): Promise<{ default: T }> {
  try {
    const module = await importFn();
    // Successful load — clear any reload flag
    sessionStorage.removeItem(SESSION_KEY);
    return module;
  } catch (error) {
    if (retriesLeft > 0) {
      await new Promise((r) => setTimeout(r, retryDelay));
      return attemptImport(importFn, retriesLeft - 1, retryDelay);
    }

    // All retries exhausted — reload page once to bust stale cache
    const hasReloaded = sessionStorage.getItem(SESSION_KEY);
    if (!hasReloaded) {
      sessionStorage.setItem(SESSION_KEY, "true");
      window.location.reload();
      // Return a never-resolving promise so React doesn't throw before reload
      return new Promise(() => {});
    }

    // Already reloaded once — surface the real error
    throw error;
  }
}
