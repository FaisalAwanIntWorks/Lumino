import { useEffect } from 'react';

/**
 * Posts the document height to the parent window so an embedding iframe
 * can grow to fit dynamic content (e.g. AI render reveal, regenerate panel,
 * comments, etc.). Mirrors the logic used in EmbedConfigurator.
 *
 * - Sends `jewlx-ready` once on mount so hosts can sync immediately.
 * - Observes the documentElement and posts `jewlx-resize` height messages.
 * - Skips on mobile (host CSS uses 100dvh on mobile).
 */
export function useEmbedAutoHeight() {
  useEffect(() => {
    // Mark this document as an embed so global CSS allows the iframe body
    // itself to scroll (rescues stale customer snippets that cap iframe height).
    document.body.setAttribute('data-embed', 'true');

    // Notify host that the widget is mounted
    try {
      window.parent?.postMessage(JSON.stringify({ type: 'jewlx-ready' }), '*');
    } catch { /* cross-origin safety */ }

    let resizeTimer: ReturnType<typeof setTimeout> | null = null;

    const sendHeight = () => {
      // Measure the app root, not the document: `documentElement.scrollHeight`
      // can never fall below the viewport, so a frame that grew for a tall step
      // could never shrink back for a short one (dead space under the content).
      const root = document.getElementById('root');
      const rootH = root
        ? Math.ceil(root.getBoundingClientRect().height + root.getBoundingClientRect().top + window.scrollY)
        : 0;
      const h = rootH > 0
        ? rootH
        : Math.max(document.documentElement.scrollHeight, document.body?.scrollHeight ?? 0);
      try {
        window.parent?.postMessage(
          JSON.stringify({ type: 'jewlx-resize', height: h }),
          '*'
        );
      } catch { /* cross-origin safety */ }
    };

    const debouncedSendHeight = () => {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(sendHeight, 100);
    };

    const resizeObserver = new ResizeObserver(debouncedSendHeight);
    resizeObserver.observe(document.documentElement);
    if (document.body) resizeObserver.observe(document.body);

    const mutationObserver = new MutationObserver(debouncedSendHeight);
    mutationObserver.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['style', 'class'],
    });

    window.addEventListener('load', sendHeight);
    window.addEventListener('resize', debouncedSendHeight);

    const initialTimer = setTimeout(sendHeight, 300);
    const secondaryTimer = setTimeout(sendHeight, 1500);

    return () => {
      resizeObserver.disconnect();
      mutationObserver.disconnect();
      window.removeEventListener('load', sendHeight);
      window.removeEventListener('resize', debouncedSendHeight);
      if (resizeTimer) clearTimeout(resizeTimer);
      clearTimeout(initialTimer);
      clearTimeout(secondaryTimer);
      document.body.removeAttribute('data-embed');
    };
  }, []);
}
