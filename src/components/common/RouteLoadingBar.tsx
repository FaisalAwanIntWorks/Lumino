import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";

/**
 * Lightweight route-transition indicator.
 * Shows a thin bar for a minimum duration to avoid flicker.
 */
export function RouteLoadingBar() {
  const location = useLocation();
  const [visible, setVisible] = useState(false);
  const [progress, setProgress] = useState(0);
  const lastPathRef = useRef(location.pathname + location.search);

  useEffect(() => {
    const nextPath = location.pathname + location.search;
    if (nextPath === lastPathRef.current) return;
    lastPathRef.current = nextPath;

    setVisible(true);
    setProgress(10);

    const tick = window.setInterval(() => {
      setProgress((p) => {
        if (p >= 90) return p;
        return Math.min(90, p + Math.max(1, (90 - p) * 0.12));
      });
    }, 80);

    const finish = window.setTimeout(() => {
      setProgress(100);
      window.setTimeout(() => {
        setVisible(false);
        setProgress(0);
      }, 220);
    }, 420);

    return () => {
      window.clearInterval(tick);
      window.clearTimeout(finish);
    };
  }, [location.pathname, location.search]);

  if (!visible) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-[9999] h-1 bg-transparent pointer-events-none">
      <div
        className="h-full bg-primary transition-[width] duration-150 ease-out"
        style={{ width: `${progress}%` }}
      />
    </div>
  );
}
