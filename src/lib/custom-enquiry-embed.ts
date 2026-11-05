import { PRODUCTION_DOMAINS, isProductionDomain } from './domain-config';
import { generateEmbedCode } from './embed-code-template';

export function getCustomEnquiryUrl(clientId: string): string {
  const hostname = typeof window !== 'undefined' ? window.location.hostname : '';
  if (isProductionDomain(hostname)) {
    return `https://${PRODUCTION_DOMAINS.builder}/custom-enquiry/${clientId}`;
  }
  return `${typeof window !== 'undefined' ? window.location.origin : ''}/embed-custom-enquiry/${clientId}`;
}

export function generateCustomEnquiryEmbedCode(
  clientId: string,
  height: string = '800px',
  allowedDomains?: string[]
): string {
  const hostname = typeof window !== 'undefined' ? window.location.hostname : '';
  const baseUrl = isProductionDomain(hostname)
    ? `https://${PRODUCTION_DOMAINS.builder}/custom-enquiry/${clientId}`
    : `${window.location.origin}/embed-custom-enquiry/${clientId}`;
  // H6: Cache-buster parity with grill-form-embed — prevents CDN serving stale iframe docs
  const cacheBuster = Date.now().toString(36);
  const embedUrl = `${baseUrl}?v=${cacheBuster}`;

  return generateEmbedCode({
    embedUrl,
    containerId: `aurezo-enquiry-${clientId.slice(0, 8)}`,
    iframeTitle: 'Aurezo Custom Enquiry',
    commentLabel: 'Aurezo Custom Enquiry Widget',
    height,
  });
}
