import { useEffect } from 'react';

type ProtectionLevel = 'full' | 'light';

/**
 * Multi-layer screenshot/content protection hook.
 * 
 * 'full' — embeds: blocks keyboard shortcuts, right-click, print, applies CSS protection class
 * 'light' — portal: blocks print/save only
 */
export function useScreenshotProtection(level: ProtectionLevel = 'full') {
  useEffect(() => {
    const root = document.documentElement;

    const cssClass = level === 'full' ? 'screenshot-protected-full' : 'screenshot-protected-light';
    root.classList.add(cssClass);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'PrintScreen') { e.preventDefault(); return; }

      const ctrl = e.ctrlKey || e.metaKey;

      if (ctrl && e.key === 'p') { e.preventDefault(); return; }
      if (ctrl && e.key === 's') { e.preventDefault(); return; }

      if (level === 'full') {
        if (ctrl && e.shiftKey && e.key === 'S') { e.preventDefault(); return; }
        if (ctrl && e.shiftKey && (e.key === 'I' || e.key === 'i')) { e.preventDefault(); return; }
        if (ctrl && e.shiftKey && (e.key === 'J' || e.key === 'j')) { e.preventDefault(); return; }
        if (ctrl && e.shiftKey && (e.key === 'C' || e.key === 'c')) { e.preventDefault(); return; }
        if (ctrl && e.key === 'u') { e.preventDefault(); return; }
        if (e.key === 'F12') { e.preventDefault(); return; }
      }
    };

    // Right-click is intentionally allowed for all levels

    const handleBeforePrint = () => { root.classList.add('screenshot-printing'); };
    const handleAfterPrint = () => { root.classList.remove('screenshot-printing'); };

    const handleDragStart = (e: DragEvent) => {
      if (level === 'full') { e.preventDefault(); }
    };

    document.addEventListener('keydown', handleKeyDown, true);
    document.addEventListener('dragstart', handleDragStart, true);
    window.addEventListener('beforeprint', handleBeforePrint);
    window.addEventListener('afterprint', handleAfterPrint);

    return () => {
      root.classList.remove(cssClass);
      root.classList.remove('screenshot-printing');
      document.removeEventListener('keydown', handleKeyDown, true);
      document.removeEventListener('dragstart', handleDragStart, true);
      window.removeEventListener('beforeprint', handleBeforePrint);
      window.removeEventListener('afterprint', handleAfterPrint);
    };
  }, [level]);
}
