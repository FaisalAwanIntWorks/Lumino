import { PRODUCTION_DOMAINS, isProductionDomain } from './domain-config';
import { LEAD_BRIDGE_SNIPPET } from './embed-lead-bridge';

export const generateMetalBuyingEmbedCode = (
  clientId: string,
  height: string = '800px',
): string => {
  const hostname = typeof window !== 'undefined' ? window.location.hostname : '';
  
  // Cache-bust whenever this snippet is regenerated so jewelers' iframes always
  // pick up the latest widget bundle without needing a hard refresh.
  const v = `v=${Date.now().toString(36)}`;
  const embedUrl = isProductionDomain(hostname)
    ? `https://${PRODUCTION_DOMAINS.builder}/metal-buying/${clientId}?${v}`
    : `${window.location.origin}/embed-metal-buying/${clientId}?${v}`;
  
  const containerId = `metalx-widget-${clientId.slice(0, 8)}`;
  
  return `<!-- Metal IQ Buying Widget -->
<style>
  #${containerId} {
    position: relative;
    width: 100%;
    max-width: 100%;
    overflow: hidden;
  }
  #${containerId} iframe {
    width: 100%;
    height: ${height};
    min-height: 600px;
    border: none;
    display: block;
    transition: height 0.3s ease;
  }
</style>
<div id="${containerId}">
  <iframe 
    id="${containerId}-iframe"
    src="${embedUrl}" 
    title="Metal IQ Buying Form"
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
    if (!e.data || e.data.type !== 'jewlx-resize') return;
    var h = parseInt(e.data.height, 10);
    if (isNaN(h) || h < 500) h = 500;
    if (h > 4000) h = 4000;
    iframe.style.height = h + 'px';
  });
})();
</script>
${LEAD_BRIDGE_SNIPPET}`;
};
