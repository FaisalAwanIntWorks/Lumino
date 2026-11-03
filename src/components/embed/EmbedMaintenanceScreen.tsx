/**
 * Plain black-and-white "under maintenance" screen for public embeds.
 *
 * Shown instead of the red-shield "Unauthorized Domain" page whenever a
 * widget cannot load inside a customer's site (domain not whitelisted, module
 * switched off, or billing paused). End customers should see a calm,
 * professional notice, not an error: white background, a monochrome
 * maintenance mark (slowly turning gear with a wrench) and a short message
 * pointing them to the store's own contact form. Colours are fixed so the
 * screen looks the same regardless of the host page / portal theme.
 */

export type EmbedMaintenanceReason = 'unauthorized_domain' | 'feature_disabled' | 'billing_paused';

interface EmbedMaintenanceScreenProps {
  /** Kept for callers; the customer-facing copy is the same for every reason. */
  reason?: EmbedMaintenanceReason;
}

const CSS = `
.jx-mnt{min-height:100dvh;display:flex;align-items:center;justify-content:center;padding:32px 20px;
  background:#ffffff;color:#111111;text-align:center;
  font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
.jx-mnt__inner{width:100%;max-width:460px}
.jx-mnt__mark{width:72px;height:72px;margin:0 auto 26px;display:block;overflow:visible}
.jx-mnt__gear{transform-origin:40px 40px;animation:jx-spin 14s linear infinite}
.jx-mnt__eyebrow{font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:#777777;margin:0 0 10px}
.jx-mnt__title{font-size:clamp(22px,4.5vw,28px);font-weight:600;letter-spacing:-.01em;margin:0 0 14px;color:#111111}
.jx-mnt__text{font-size:15px;line-height:1.6;color:#444444;margin:0 auto;max-width:400px}
.jx-mnt__text + .jx-mnt__text{margin-top:10px}
.jx-mnt__rule{width:36px;height:1px;background:#d9d9d9;margin:26px auto 0}
@keyframes jx-spin{to{transform:rotate(360deg)}}
@media (prefers-reduced-motion:reduce){.jx-mnt *{animation:none!important}}
`;

/** Even 8-tooth gear outline centred at (40,40); generated so every tooth is identical. */
const GEAR_PATH = (() => {
  const cx = 40, cy = 40, outer = 26, inner = 20, teeth = 8;
  const step = (Math.PI * 2) / teeth;
  const toothHalf = step * 0.22;
  const gapHalf = step * 0.5 - toothHalf;
  const pt = (r: number, a: number) => `${(cx + Math.cos(a) * r).toFixed(2)} ${(cy + Math.sin(a) * r).toFixed(2)}`;
  const parts: string[] = [];
  for (let i = 0; i < teeth; i++) {
    const a = i * step;
    parts.push(pt(outer, a - toothHalf), pt(outer, a + toothHalf), pt(inner, a + toothHalf + gapHalf * 0.35), pt(inner, a + step - toothHalf - gapHalf * 0.35));
  }
  return `M${parts.join(' L')} Z`;
})();

export default function EmbedMaintenanceScreen(_props: EmbedMaintenanceScreenProps) {
  return (
    <div className="jx-mnt" role="status" aria-live="polite">
      <style>{CSS}</style>
      <div className="jx-mnt__inner">
        {/* Monochrome maintenance mark: line gear + wrench */}
        <svg className="jx-mnt__mark" viewBox="0 0 80 80" fill="none" aria-hidden="true">
          <g className="jx-mnt__gear" stroke="#111111" strokeWidth="2.5" strokeLinejoin="round">
            <path d={GEAR_PATH} />
            <circle cx="40" cy="40" r="9" />
          </g>
          <g transform="translate(47 1) scale(1.35)" stroke="#111111" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
            <path fill="#ffffff" d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
          </g>
        </svg>

        <p className="jx-mnt__eyebrow">Scheduled maintenance</p>
        <h1 className="jx-mnt__title">Under maintenance</h1>
        <p className="jx-mnt__text">
          Please use the contact form on this website to reach out to us and request your quote directly.
        </p>
        <p className="jx-mnt__text">We will be back up in no time. Thank you for your patience.</p>

        <div className="jx-mnt__rule" aria-hidden="true" />
      </div>
    </div>
  );
}
