/**
 * Google Tag Manager (GTM) utility.
 * Dynamically injects the GTM container script and provides a helper
 * to push custom events into the dataLayer for conversion tracking.
 *
 * Safe to call initGTM multiple times — only injects once per container ID.
 */

declare global {
  interface Window {
    dataLayer: Record<string, any>[];
  }
}

let gtmInitialized = false;
let currentContainerId: string | null = null;

/**
 * Accept a container ID pasted with or without the `GTM-` prefix and return a
 * canonical `GTM-XXXXXXX` value, or null when it cannot be a container ID.
 */
export function normalizeGtmContainerId(raw?: string | null): string | null {
  const value = (raw ?? '').trim().toUpperCase();
  if (!value) return null;
  const body = value.startsWith('GTM-') ? value.slice(4) : value;
  if (!/^[A-Z0-9]{5,12}$/.test(body)) return null;
  return `GTM-${body}`;
}

/**
 * Inject the GTM container snippet (head script + body noscript iframe).
 * Safe to call multiple times — only initializes once per container ID.
 */
export function initGTM(rawContainerId: string): void {
  const containerId = normalizeGtmContainerId(rawContainerId);
  if (!containerId) {
    if (rawContainerId) console.warn('[GTM] ignoring malformed container ID');
    return;
  }

  // Already initialized with this container
  if (gtmInitialized && currentContainerId === containerId) return;

  // Ensure dataLayer exists
  window.dataLayer = window.dataLayer || [];


  // Push initial gtm.js event
  window.dataLayer.push({
    'gtm.start': new Date().getTime(),
    event: 'gtm.js',
  });

  // Inject the GTM script tag
  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtm.js?id=${containerId}`;
  script.onerror = () => {
    console.warn('[GTM] gtm.js failed to load — tags will not fire');
  };

  const firstScript = document.getElementsByTagName('script')[0];
  if (firstScript?.parentNode) {
    firstScript.parentNode.insertBefore(script, firstScript);
  } else {
    (document.head || document.documentElement).appendChild(script);
  }

  // Inject the noscript iframe fallback into <body>
  try {
    const noscript = document.createElement('noscript');
    const iframe = document.createElement('iframe');
    iframe.src = `https://www.googletagmanager.com/ns.html?id=${containerId}`;
    iframe.height = '0';
    iframe.width = '0';
    iframe.style.display = 'none';
    iframe.style.visibility = 'hidden';
    noscript.appendChild(iframe);
    (document.body || document.documentElement).appendChild(noscript);
  } catch {
    // noscript fallback is non-critical
  }

  gtmInitialized = true;
  currentContainerId = containerId;
}

/**
 * Push a custom event (+ optional params) into the GTM dataLayer.
 * GTM tags can then trigger on this event name.
 */
export function pushToDataLayer(event: string, params?: Record<string, any>): void {
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({ event, ...params });
}
