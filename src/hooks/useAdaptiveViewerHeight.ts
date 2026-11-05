import { RefObject, useEffect } from 'react';

// Read by the viewer / panel wrappers: `h-[var(--ringos-viewer-h,<default>)]`.
const VIEWER_HEIGHT_VAR = '--ringos-viewer-h';
const MOBILE_QUERY = '(max-width: 767px)';
// Never squeeze the ring image below this, however crowded the step is.
const MIN_VIEWER_PX = 220;

interface AdaptiveViewerOptions {
  /** Viewer share of the widget height when the step content fits. */
  defaultRatio?: number;
  /** Smallest share the viewer may shrink to for a crowded step. */
  minRatio?: number;
}

/**
 * Mobile only: the Ring OS image viewer gives up height to a crowded step.
 *
 * The stacked mobile layout splits the widget between the viewer and the
 * options panel. When a step's content is taller than the panel's scroll area
 * (diamond list, long option grids) the viewer shrinks by exactly the missing
 * amount, down to `minRatio`; when a step fits, it grows back to `defaultRatio`.
 *
 * `scrollRef` is the panel's scroll container and `contentRef` its single
 * content wrapper. The viewer wrapper is found via `[data-adaptive-viewer]`
 * inside `#aurezo-embed-root`, where the height is published as a CSS variable.
 */
export const useAdaptiveViewerHeight = (
  scrollRef: RefObject<HTMLElement>,
  contentRef: RefObject<HTMLElement>,
  { defaultRatio = 0.5, minRatio = 0.3 }: AdaptiveViewerOptions = {},
) => {
  useEffect(() => {
    const scroll = scrollRef.current;
    const content = contentRef.current;
    const root = scroll?.closest<HTMLElement>('#aurezo-embed-root');
    const viewer = root?.querySelector<HTMLElement>('[data-adaptive-viewer]');
    if (!scroll || !content || !root || !viewer || typeof ResizeObserver === 'undefined') return;

    const mobile = window.matchMedia(MOBILE_QUERY);
    let frame: number | null = null;
    let applied: number | null = null;

    const reset = () => {
      applied = null;
      root.style.removeProperty(VIEWER_HEIGHT_VAR);
    };

    const apply = () => {
      frame = null;
      // Side-by-side layout (md+), or the panel is hidden behind the chat assistant.
      if (!mobile.matches || scroll.getClientRects().length === 0) {
        reset();
        return;
      }

      const rootHeight = root.clientHeight;
      const maxHeight = rootHeight * defaultRatio;
      const minHeight = Math.min(maxHeight, Math.max(rootHeight * minRatio, MIN_VIEWER_PX));

      const scrollStyle = getComputedStyle(scroll);
      const padding = parseFloat(scrollStyle.paddingTop) + parseFloat(scrollStyle.paddingBottom);
      // Positive = content is cut off, negative = spare room in the panel.
      // Viewer + scroll area always add up to the same total, so this stays
      // correct even when measured halfway through the height transition.
      const shortfall = content.offsetHeight + padding - scroll.getBoundingClientRect().height;
      const wanted = viewer.getBoundingClientRect().height - shortfall;
      const target = Math.floor(Math.min(maxHeight, Math.max(minHeight, wanted)));

      if (applied !== null && Math.abs(target - applied) < 2) return;
      applied = target;
      root.style.setProperty(VIEWER_HEIGHT_VAR, `${target}px`);
    };

    const schedule = () => {
      if (frame !== null) return;
      frame = requestAnimationFrame(apply);
    };

    const observer = new ResizeObserver(schedule);
    observer.observe(content);
    observer.observe(root);
    mobile.addEventListener('change', schedule);
    schedule();

    return () => {
      observer.disconnect();
      mobile.removeEventListener('change', schedule);
      if (frame !== null) cancelAnimationFrame(frame);
      reset();
    };
  }, [scrollRef, contentRef, defaultRatio, minRatio]);
};
