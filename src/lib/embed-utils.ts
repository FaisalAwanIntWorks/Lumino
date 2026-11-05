import { PRODUCTION_DOMAINS, isProductionDomain, getBuilderUrl } from './domain-config';
import { isTwentyFourKClient } from './twentyfourk-theme';
import { LEAD_BRIDGE_SNIPPET } from './embed-lead-bridge';


export const generateEmbedCode = (
  clientId: string,
  width: string = '100%',
  height: string = '800px',
  branding?: PreviewBranding,
  allowedDomains?: string[]
): string => {
  const hostname = typeof window !== 'undefined' ? window.location.hostname : '';
  
  // Use production builder URL in production, fallback to origin/embed for dev
  let embedUrl = isProductionDomain(hostname)
    ? `https://${PRODUCTION_DOMAINS.builder}/${clientId}`
    : `${window.location.origin}/embed/${clientId}`;
  
  if (branding) {
    const params = new URLSearchParams();
    if (branding.primaryColor) params.set('primaryColor', branding.primaryColor);
    if (branding.secondaryColor) params.set('secondaryColor', branding.secondaryColor);
    if (branding.showChatAssistant !== undefined) params.set('showChatAssistant', String(branding.showChatAssistant));
    if (branding.showComparison !== undefined) params.set('showComparison', String(branding.showComparison));
    if (branding.showSaveDesign !== undefined) params.set('showSaveDesign', String(branding.showSaveDesign));
    if (branding.theme) params.set('theme', branding.theme);
    
    const queryString = params.toString();
    if (queryString) embedUrl += `?${queryString}`;
  }
  
  // Generate responsive embed code with mobile-first approach
  const containerId = `aurezo-widget-${clientId.slice(0, 8)}`;
  const isTwentyFourK = isTwentyFourKClient(clientId);
  const desktopHeight = isTwentyFourK ? '100dvh' : height;
  
  return `<!-- Aurezo Ring Builder Widget -->
<style>
  #${containerId} {
    position: relative;
    width: 100%;
    max-width: 100%;
    overflow: hidden;
  }
  #${containerId} iframe {
    width: 100%;
    height: ${desktopHeight};
    min-height: 600px;
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
    title="${isTwentyFourKClient(clientId) ? 'Ring Configurator' : 'Aurezo Ring Builder'}"
    loading="lazy"
    allow="fullscreen; shared-autofill"
    allowfullscreen
  ></iframe>
</div>
<script>
(function(){
  var iframe = document.getElementById('${containerId}-iframe');
  if (!iframe) return;
  var viewportFit = ${isTwentyFourK ? 'true' : 'false'};
  var fitAvailableHeight = function() {
    if (!viewportFit) return;
    var viewportHeight = window.visualViewport ? window.visualViewport.height : window.innerHeight;
    var top = Math.max(0, iframe.getBoundingClientRect().top);
    var available = Math.max(500, Math.floor(viewportHeight - top));
    iframe.style.height = available + 'px';
  };
  if (viewportFit) {
    fitAvailableHeight();
    window.addEventListener('resize', fitAvailableHeight);
    window.addEventListener('orientationchange', fitAvailableHeight);
    if (window.visualViewport) window.visualViewport.addEventListener('resize', fitAvailableHeight);
    requestAnimationFrame(fitAvailableHeight);
  }
  window.addEventListener('message', function(e) {
    var data;
    try { data = typeof e.data === 'string' ? JSON.parse(e.data) : e.data; } catch(x) { return; }
    if (data && data.type === 'aurezo-resize' && typeof data.height === 'number') {
      if (viewportFit) {
        fitAvailableHeight();
        return;
      }
      var h = Math.max(500, Math.min(4000, data.height));
      iframe.style.height = h + 'px';
    }
  });
})();
</script>
${LEAD_BRIDGE_SNIPPET}`;
};

export const generateEmbedUrl = (clientId: string): string => {
  return getBuilderUrl(clientId);
};

export interface PreviewBranding {
  primaryColor?: string;
  secondaryColor?: string;
  companyName?: string;
  showChatAssistant?: boolean;
  showComparison?: boolean;
  showSaveDesign?: boolean;
  theme?: string;
}

// Convert hex color to HSL format for CSS variables
// XSS Protection: Validates input is a valid hex color before processing
export function hexToHSL(hex: string): string {
  // Validate hex format first to prevent CSS injection
  const cleanHex = hex.replace('#', '');
  
  // Only allow valid hex characters
  if (!/^[A-Fa-f0-9]{3,8}$/.test(cleanHex)) {
    console.warn('[XSS] Invalid hex color blocked:', hex.slice(0, 20));
    return '0 0% 50%'; // Return a safe fallback (gray)
  }
  
  // Normalize 3-char hex to 6-char
  let normalizedHex = cleanHex;
  if (cleanHex.length === 3) {
    normalizedHex = cleanHex.split('').map(c => c + c).join('');
  } else if (cleanHex.length !== 6 && cleanHex.length !== 8) {
    return '0 0% 50%'; // Invalid length, return fallback
  }
  
  // Convert to RGB
  const r = parseInt(normalizedHex.substring(0, 2), 16) / 255;
  const g = parseInt(normalizedHex.substring(2, 4), 16) / 255;
  const b = parseInt(normalizedHex.substring(4, 6), 16) / 255;
  
  // Validate parsed values
  if (isNaN(r) || isNaN(g) || isNaN(b)) {
    return '0 0% 50%';
  }
  
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;
  
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  
  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

export const generatePreviewUrl = (clientId: string, branding: PreviewBranding): string => {
  const baseUrl = getBuilderUrl(clientId);
  const params = new URLSearchParams();
  params.set('preview', 'true');
  
  if (branding.primaryColor) params.set('primaryColor', branding.primaryColor);
  if (branding.secondaryColor) params.set('secondaryColor', branding.secondaryColor);
  if (branding.companyName) params.set('companyName', branding.companyName);
  if (branding.showChatAssistant !== undefined) params.set('showChatAssistant', String(branding.showChatAssistant));
  if (branding.showComparison !== undefined) params.set('showComparison', String(branding.showComparison));
  if (branding.showSaveDesign !== undefined) params.set('showSaveDesign', String(branding.showSaveDesign));
  if (branding.theme) params.set('theme', branding.theme);
  
  return `${baseUrl}?${params.toString()}`;
};

export const parsePreviewBranding = (searchParams: URLSearchParams): PreviewBranding | null => {
  if (!searchParams.get('preview')) return null;
  
  return {
    primaryColor: searchParams.get('primaryColor') || undefined,
    secondaryColor: searchParams.get('secondaryColor') || undefined,
    companyName: searchParams.get('companyName') || undefined,
    showChatAssistant: searchParams.get('showChatAssistant') ? searchParams.get('showChatAssistant') === 'true' : undefined,
    showComparison: searchParams.get('showComparison') ? searchParams.get('showComparison') === 'true' : undefined,
    showSaveDesign: searchParams.get('showSaveDesign') ? searchParams.get('showSaveDesign') === 'true' : undefined,
    theme: searchParams.get('theme') || undefined,
  };
};

export const generateThemeTestUrls = (clientId: string): { theme: string; label: string; url: string }[] => {
  const baseUrl = getBuilderUrl(clientId);
  // Note: '?theme=twentyfourk' is only honored for the 24k Carat Jewelers client
  // (server-side gating in EmbedConfigurator); we intentionally do not list it here.
  return [
    { theme: 'luxury', label: 'UI Option 1 – Luxury', url: `${baseUrl}?theme=luxury` },
    { theme: 'modern', label: 'UI Option 2 – Modern', url: `${baseUrl}?theme=modern` },
    { theme: 'chat', label: 'UI Option 3 – Chat-First', url: `${baseUrl}?theme=chat` },
    { theme: 'elegant', label: 'UI Option 4 – Elegant Gold', url: `${baseUrl}?theme=elegant` },
  ];
};

export const copyToClipboard = async (text: string): Promise<boolean> => {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (error) {
    console.error('Failed to copy:', error);
    return false;
  }
};
