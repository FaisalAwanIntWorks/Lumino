/**
 * Meta (Facebook) Pixel utility for conversion tracking.
 * Dynamically injects the Meta Pixel script and fires standard events.
 * 
 * Includes event queuing so events fired before the pixel script loads
 * are buffered and replayed once fbevents.js is ready.
 */

declare global {
  interface Window {
    fbq: (...args: any[]) => void;
    _fbq: any;
  }
}

let pixelInitialized = false;
let currentPixelId: string | null = null;

// Queue for events fired before pixel is fully initialized
const pendingEvents: Array<{ type: 'track' | 'trackCustom'; eventName: string; params?: Record<string, any>; options?: { eventID?: string } }> = [];

// Accounts with no pixel configured never flush the queue, so cap it to keep
// a long-lived widget page from growing an unbounded array.
const MAX_PENDING_EVENTS = 50;
function queueEvent(event: (typeof pendingEvents)[number]): void {
  pendingEvents.push(event);
  if (pendingEvents.length > MAX_PENDING_EVENTS) pendingEvents.shift();
}

/**
 * Flush any events that were queued before the pixel was initialized.
 */
function flushPendingEvents(): void {
  while (pendingEvents.length > 0) {
    const event = pendingEvents.shift()!;
    const args: any[] = [event.type, event.eventName];
    if (event.params) args.push(event.params);
    if (event.options?.eventID) {
      // fbq signature: fbq('track', name, params?, { eventID })
      if (!event.params) args.push({});
      args.push({ eventID: event.options.eventID });
    }
    (window.fbq as any)(...args);
  }
}

/**
 * Injects the Meta Pixel base code and initializes with the given Pixel ID.
 * Automatically fires a PageView event on init.
 * Safe to call multiple times — only initializes once per pixel ID.
 */
export function initMetaPixel(pixelId: string): void {
  if (!pixelId) return;

  // Already initialized with this pixel ID
  if (pixelInitialized && currentPixelId === pixelId) {
    // Flush any pending events that were queued before this call
    flushPendingEvents();
    return;
  }

  // Already loaded by something external
  if (pixelInitialized && window.fbq) {
    flushPendingEvents();
    return;
  }

  const f = window;
  const b = document;

  // If fbq already exists from external source, just init our pixel
  if (f.fbq && typeof f.fbq === 'function') {
    window.fbq('init', pixelId);
    window.fbq('track', 'PageView');
    pixelInitialized = true;
    currentPixelId = pixelId;
    flushPendingEvents();
    return;
  }

  // Create the fbq stub
  const n: any = (f.fbq = function (...args: any[]) {
    if (n.callMethod) {
      n.callMethod.apply(n, args);
    } else {
      n.queue.push(args);
    }
  });

  if (!f._fbq) f._fbq = n;
  n.push = n;
  n.loaded = true;
  n.version = '2.0';
  n.queue = [];

  // Inject the fbevents.js script with robust fallback
  const script = b.createElement('script');
  script.async = true;
  script.src = 'https://connect.facebook.net/en_US/fbevents.js';

  // On script load, flush any pending events
  script.onload = () => {
    flushPendingEvents();
  };

  // Handle script load failure (ad blockers, network issues, CSP)
  script.onerror = () => {
    console.warn('[Meta Pixel] fbevents.js failed to load — events will be queued through stub');
    flushPendingEvents();
  };

  const firstScript = b.getElementsByTagName('script')[0];
  if (firstScript?.parentNode) {
    firstScript.parentNode.insertBefore(script, firstScript);
  } else {
    // Fallback: append to head (works in iframes without script tags)
    (b.head || b.documentElement).appendChild(script);
  }

  // Add noscript fallback pixel for PageView
  try {
    const noscript = b.createElement('noscript');
    const img = b.createElement('img');
    img.height = 1;
    img.width = 1;
    img.style.display = 'none';
    img.src = `https://www.facebook.com/tr?id=${pixelId}&ev=PageView&noscript=1`;
    img.alt = '';
    noscript.appendChild(img);
    (b.body || b.documentElement).appendChild(noscript);
  } catch {
    // noscript fallback is non-critical
  }

  window.fbq('init', pixelId);
  window.fbq('track', 'PageView');

  pixelInitialized = true;
  currentPixelId = pixelId;

  // Immediately flush pending events through the stub so they're queued
  // internally and processed the instant fbevents.js finishes loading
  flushPendingEvents();
}

/**
 * Check if the Meta Pixel has been initialized.
 */
export function isPixelReady(): boolean {
  return pixelInitialized && typeof window.fbq === 'function';
}

/**
 * Fire a Meta standard event.
 * If pixel is not yet initialized, the event is queued and will be fired
 * automatically once initMetaPixel() completes.
 * 
 * Common events: 'Lead', 'ViewContent', 'InitiateCheckout', 'Contact', 'Schedule'
 */
export function trackMetaEvent(
  eventName: string,
  params?: Record<string, any>,
  options?: { eventID?: string }
): void {
  if (!pixelInitialized || typeof window.fbq !== 'function') {
    // Queue the event — it will be flushed when the pixel initializes
    queueEvent({ type: 'track', eventName, params, options });
    return;
  }

  if (options?.eventID) {
    window.fbq('track', eventName, params ?? {}, { eventID: options.eventID });
  } else if (params) {
    window.fbq('track', eventName, params);
  } else {
    window.fbq('track', eventName);
  }
}

/**
 * Fire a Meta custom event (non-standard).
 * If pixel is not yet initialized, the event is queued.
 */
export function trackCustomMetaEvent(eventName: string, params?: Record<string, any>): void {
  if (!pixelInitialized || typeof window.fbq !== 'function') {
    queueEvent({ type: 'trackCustom', eventName, params });
    return;
  }

  if (params) {
    window.fbq('trackCustom', eventName, params);
  } else {
    window.fbq('trackCustom', eventName);
  }
}
