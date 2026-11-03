import { useMemo } from 'react';
import type { SchedulingProvider } from '@/hooks/useClientScheduling';

interface SchedulingEmbedProps {
  url: string;
  provider: SchedulingProvider | null;
  /** Hex color used to tint Calendly/Cal.com primary buttons (no leading #). */
  accentHex?: string;
  /** Hex bg used to tint Calendly's background (no leading #). */
  backgroundHex?: string;
  /** Hex text color (no leading #). */
  textHex?: string;
  /** Min height in px. Calendly recommends >= 700. */
  minHeight?: number;
}

const stripHash = (c?: string) => (c || '').replace('#', '').slice(0, 6);

/**
 * Inline iframe embed for a client's external scheduler (Calendly / Cal.com / generic).
 * No third-party scripts — plain iframe so it stays sandbox-safe inside the widget.
 */
export function SchedulingEmbed({
  url,
  provider,
  accentHex,
  backgroundHex,
  textHex,
  minHeight = 720,
}: SchedulingEmbedProps) {
  const src = useMemo(() => {
    try {
      const u = new URL(url);
      if (provider === 'calendly' || u.hostname.includes('calendly.com')) {
        u.searchParams.set('hide_gdpr_banner', '1');
        u.searchParams.set('embed_type', 'Inline');
        if (accentHex) u.searchParams.set('primary_color', stripHash(accentHex));
        // Force Calendly to its light theme so input fields (which always render
        // on a white background) keep dark, legible text. Passing a dark
        // background/text combo makes typed text invisible inside the white
        // inputs Calendly renders for name/email/notes.
        u.searchParams.set('background_color', 'ffffff');
        u.searchParams.set('text_color', '1a1a1a');
      }
      // Cal.com and other providers: leave URL untouched — they respect their own theme.
      return u.toString();
    } catch {
      return url;
    }
  }, [url, provider, accentHex, backgroundHex, textHex]);

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        overflowY: 'auto',
        WebkitOverflowScrolling: 'touch',
        background: backgroundHex ? `#${stripHash(backgroundHex)}` : 'transparent',
      }}
    >
      <iframe
        src={src}
        title="Book an appointment"
        style={{
          width: '100%',
          height: `${minHeight}px`,
          minHeight: `${minHeight}px`,
          border: 0,
          display: 'block',
          background: backgroundHex ? `#${stripHash(backgroundHex)}` : 'transparent',
        }}
        allow="fullscreen; clipboard-write"
      />
    </div>
  );
}
