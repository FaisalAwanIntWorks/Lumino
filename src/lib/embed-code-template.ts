import { LEAD_BRIDGE_SNIPPET } from './embed-lead-bridge';

interface EmbedCodeOptions {
  embedUrl: string;
  containerId: string;
  iframeTitle: string;
  commentLabel: string;
  height: string;
}

/**
 * H6: Shared embed HTML/CSS/JS template used by all form embed generators.
 * Avoids duplicating ~70 lines across grill-form-embed.ts and custom-enquiry-embed.ts.
 */
export function generateEmbedCode({
  embedUrl,
  containerId,
  iframeTitle,
  commentLabel,
  height,
}: EmbedCodeOptions): string {
  return `<!-- ${commentLabel} -->
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
    min-height: 500px;
    border: none;
    display: block;
    transition: height 0.3s ease;
  }
  @media (max-width: 767px) {
    #${containerId} iframe {
      height: 100dvh;
      min-height: 100dvh;
      max-height: 100dvh;
      transition: none;
    }
  }
  @media (min-width: 768px) {
    #${containerId} iframe {
      min-height: 500px;
      max-height: 4000px;
    }
  }
</style>
<div id="${containerId}">
  <iframe
    id="${containerId}-iframe"
    src="${embedUrl}"
    title="${iframeTitle}"
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
    if (data && data.type === 'jewlx-resize' && typeof data.height === 'number') {
      var isMobile = window.innerWidth < 768;
      if (isMobile) return;
      var h = Math.max(500, Math.min(4000, data.height));
      iframe.style.height = h + 'px';
    }
  });
})();
</script>
${LEAD_BRIDGE_SNIPPET}`;
}
