import { PRODUCTION_DOMAINS, isProductionDomain } from './domain-config';
import { generateEmbedCode } from './embed-code-template';

export function getGrillBuilderUrl(clientId: string): string {
  const hostname = typeof window !== 'undefined' ? window.location.hostname : '';
  if (isProductionDomain(hostname)) {
    return `https://${PRODUCTION_DOMAINS.builder}/grillz/${clientId}`;
  }
  return `${typeof window !== 'undefined' ? window.location.origin : ''}/embed-grillz/${clientId}`;
}

export function generateGrillBuilderEmbedCode(
  clientId: string,
  height: string = '800px',
  allowedDomains?: string[]
): string {
  const hostname = typeof window !== 'undefined' ? window.location.hostname : '';
  const baseUrl = isProductionDomain(hostname)
    ? `https://${PRODUCTION_DOMAINS.builder}/grillz/${clientId}`
    : `${window.location.origin}/embed-grillz/${clientId}`;
  // Cache-buster: regenerating the snippet always produces a fresh URL so
  // customer sites & CDNs cannot serve a stale iframe document.
  const cacheBuster = Date.now().toString(36);
  const embedUrl = `${baseUrl}?v=${cacheBuster}`;

  return generateEmbedCode({
    embedUrl,
    containerId: `aurezo-grillz-${clientId.slice(0, 8)}`,
    iframeTitle: 'Aurezo Grill Builder',
    commentLabel: 'Aurezo Grill Builder Widget',
    height,
  });
}
