import { useEffect, useState } from "react";

/**
 * Prevents flicker by only returning `true` after `delayMs` of continuous loading.
 * Useful for skeletons/spinners so fast loads don't flash UI.
 */
export function useDelayedLoading(loading: boolean, delayMs: number = 250) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!loading) {
      setShow(false);
      return;
    }

    const t = window.setTimeout(() => setShow(true), delayMs);
    return () => window.clearTimeout(t);
  }, [loading, delayMs]);

  return show;
}
