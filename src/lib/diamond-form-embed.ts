import { PRODUCTION_DOMAINS, isProductionDomain } from './domain-config';
import { LEAD_BRIDGE_SNIPPET } from './embed-lead-bridge';

/**
 * Generate the diamonds form embed URL for a client.
 */
export function getDiamondsFormUrl(clientId: string): string {
  const hostname = typeof window !== 'undefined' ? window.location.hostname : '';

  if (isProductionDomain(hostname)) {
    return `https://${PRODUCTION_DOMAINS.builder}/diamonds/${clientId}`;
  }

  // Development fallback
  return `${typeof window !== 'undefined' ? window.location.origin : ''}/embed-diamonds/${clientId}`;
}

/**
 * Public Quote Estimator Form URL for a client. The Quote Estimator has its own
 * path (widget.aurezotech.com/quote/<id>) so links no longer carry `?variant=dtt`;
 * the embed page still honours that legacy parameter for snippets already
 * installed on client websites.
 */
export function getQuoteEstimatorUrl(clientId: string): string {
  const hostname = typeof window !== 'undefined' ? window.location.hostname : '';

  if (isProductionDomain(hostname)) {
    return `https://${PRODUCTION_DOMAINS.builder}/quote/${clientId}`;
  }

  // Development fallback
  return `${typeof window !== 'undefined' ? window.location.origin : ''}/embed-quote/${clientId}`;
}

/** Public test link for one Quote Estimator version (Sandbox lab); never writes a lead. */
export function getQuoteEstimatorVersionPreviewUrl(clientId: string, version: string): string {
  return `${getQuoteEstimatorUrl(clientId)}?quoteVersion=${version}`;
}

/**
 * Shareable Quote Estimator preview link for one theme (Theme 1 · Classic or
 * Theme 2 · Glass). Opening it renders the account's real form (its colours,
 * copy and option images) in that theme but never saves a lead, sends email,
 * or reaches the CRM or ad pixels, so it can be sent to a jeweler for review.
 * The Sandbox lab ignores the theme parameter (see resolveQuoteTheme).
 */
export function getQuoteEstimatorThemePreviewUrl(clientId: string, theme: 'classic' | 'glass'): string {
  return `${getQuoteEstimatorUrl(clientId)}?quoteTheme=${theme}`;
}

/**
 * Generate a responsive iframe embed snippet for the Diamonds Form.
 * Mirrors the pattern used by the ring builder widget embed.
 */
export function generateDiamondsFormEmbedCode(
  clientId: string,
  height: string = '800px',
  allowedDomains?: string[],
  variant?: 'dtt',
  backgroundColor?: string,
  /**
   * Let the iframe follow its real content height on phones instead of being
   * pinned to 100dvh. Short steps then stop leaving a dead band under the
   * button, and tall steps stop creating a second scrollbar inside the frame.
   */
  fluidMobileHeight: boolean = variant === 'dtt'
): string {
  // Paint the wrapper + iframe with the form's own background color so the
  // widget matches the form (and shows no white flash before the iframe loads).
  const bgRule = backgroundColor ? `\n    background-color: ${backgroundColor};` : '';

  // The Quote Estimator lives on its own path; the Ring Builder keeps /diamonds.
  const embedUrl = variant === 'dtt' ? getQuoteEstimatorUrl(clientId) : getDiamondsFormUrl(clientId);

  const containerId = `aurezo-${variant === 'dtt' ? 'quote' : 'diamonds'}-${clientId.slice(0, 8)}`;


  return `<!-- Aurezo Diamonds Form Widget -->
<style>
  #${containerId} {
    position: relative;
    width: 100%;
    max-width: 100%;
    overflow: hidden;${bgRule}
  }
  #${containerId} iframe {
    width: 100%;
    height: ${height};
    min-height: 400px;
    border: none;
    display: block;
    transition: height 0.3s ease;${bgRule}
  }
  @media (max-width: 767px) {
    #${containerId} iframe {
${fluidMobileHeight
  ? `      height: auto;
      min-height: 260px;
      max-height: none;
      transition: none;`
  : `      height: 100dvh;
      min-height: 100dvh;
      max-height: 100dvh;
      transition: none;`}
    }
  }
  @media (min-width: 768px) {
    #${containerId} iframe {
      min-height: 500px;
      max-height: 4000px;
    }
  }
${variant === 'dtt' ? `  @media (prefers-reduced-motion: reduce) {
    #${containerId} iframe { transition: none; }
  }
` : ''}
</style>
<div id="${containerId}">
  <iframe 
    id="${containerId}-iframe"
    src="${embedUrl}" 
    title="${variant === 'dtt' ? 'Aurezo Quote Estimator Form' : 'Aurezo Diamonds Form'}"
    loading="lazy"
    allow="fullscreen; shared-autofill"
    allowfullscreen
  ></iframe>
</div>
<script>
(function(){
  var iframe = document.getElementById('${containerId}-iframe');
  if (!iframe) return;
  window.addEventListener('message', function(e) {
    var data;
    try { data = typeof e.data === 'string' ? JSON.parse(e.data) : e.data; } catch(x) { return; }
    if (data && data.type === 'aurezo-resize' && typeof data.height === 'number') {
      var isMobile = window.innerWidth < 768;
      if (isMobile && !${fluidMobileHeight ? 'true' : 'false'}) return;
      var min = isMobile ? 260 : 500;
      var h = Math.max(min, Math.min(6000, data.height));
      iframe.style.height = h + 'px';
    }
    if (data && data.type === 'aurezo-scroll-top') {
      var r = iframe.getBoundingClientRect();
      if (r.top < 0) window.scrollTo({ top: window.scrollY + r.top - 12, behavior: ${variant === 'dtt' ? "window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'" : "'smooth'"} });
    }
  });
})();
</script>
${LEAD_BRIDGE_SNIPPET}`;
}

/**
 * Copy text to clipboard.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
