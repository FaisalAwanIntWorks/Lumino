/**
 * Background image warmer for the Quote Estimator (DTT) form.
 *
 * The option images live on CloudFront and are large (the legacy DTT set is
 * ~1.5 MB per PNG). Previously nothing was requested until a step mounted, so
 * every "Next" click started a fresh burst of downloads and the cards filled in
 * one-by-one at different speeds.
 *
 * This module keeps a single global queue: as soon as a client's option data
 * lands we enqueue every image in step order, so later steps are already in the
 * browser HTTP cache by the time the user reaches them. The step currently on
 * screen can jump the queue via `prioritizeImagePreload`.
 */

/** Parallel requests. Kept low so the visible step is never starved. */
const MAX_CONCURRENT = 4;

const loaded = new Set<string>();
const inFlight = new Set<string>();
let queue: string[] = [];
let active = 0;

/** True when the browser already has this image decoded/cached by us. */
export function isImagePreloaded(url: string | null | undefined): boolean {
  return !!url && loaded.has(url);
}

/** Respect the user's data-saver preference — skip speculative downloads. */
function saveDataEnabled(): boolean {
  const conn = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  return !!conn?.saveData;
}

function pump() {
  while (active < MAX_CONCURRENT && queue.length > 0) {
    const url = queue.shift()!;
    if (loaded.has(url) || inFlight.has(url)) continue;

    inFlight.add(url);
    active += 1;

    const img = new Image();
    img.decoding = 'async';
    const done = () => {
      inFlight.delete(url);
      loaded.add(url);
      active -= 1;
      pump();
    };
    img.onload = done;
    // Mark failures as "done" too: a broken URL must not block the queue, and
    // the <img> tag will surface its own error state.
    img.onerror = done;
    img.src = url;
  }
}

function normalize(urls: (string | null | undefined)[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const url of urls) {
    if (!url || seen.has(url)) continue;
    // data:/blob: URLs are already local — nothing to warm.
    if (url.startsWith('data:') || url.startsWith('blob:')) continue;
    seen.add(url);
    if (!loaded.has(url) && !inFlight.has(url)) out.push(url);
  }
  return out;
}

/** Queue images to be fetched in the background, in the order given. */
export function queueImagePreload(urls: (string | null | undefined)[]): void {
  if (saveDataEnabled()) return;
  const fresh = normalize(urls).filter((url) => !queue.includes(url));
  if (fresh.length === 0) return;
  queue.push(...fresh);
  pump();
}

/**
 * Move these images to the front of the queue — used by the step that is
 * currently on screen so its cards win over speculative look-ahead work.
 */
export function prioritizeImagePreload(urls: (string | null | undefined)[]): void {
  const fresh = normalize(urls);
  if (fresh.length === 0) return;
  const frontSet = new Set(fresh);
  queue = [...fresh, ...queue.filter((url) => !frontSet.has(url))];
  pump();
}
