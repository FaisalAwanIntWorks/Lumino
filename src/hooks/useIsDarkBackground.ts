import { useEffect, useState } from 'react';

/**
 * Returns true when the widget's --background CSS variable resolves to a dark color (L <= 20%).
 * Reacts to live Branding changes via MutationObserver on <html> style attribute.
 */
export function useIsDarkBackground(): boolean {
  const [isDark, setIsDark] = useState<boolean>(() => evaluate());

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const update = () => setIsDark(evaluate());
    update();
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['style', 'class'],
    });
    return () => observer.disconnect();
  }, []);

  return isDark;
}

function evaluate(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const raw = getComputedStyle(document.documentElement)
      .getPropertyValue('--background')
      .trim();
    if (!raw) return false;
    // Expected format: "H S% L%" e.g. "0 0% 0%"
    const parts = raw.split(/\s+/);
    const lStr = parts[2]?.replace('%', '');
    const l = lStr ? parseFloat(lStr) : NaN;
    if (Number.isNaN(l)) return false;
    return l <= 20;
  } catch {
    return false;
  }
}
