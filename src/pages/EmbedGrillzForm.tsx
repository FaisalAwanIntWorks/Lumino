import { useParams } from 'react-router-dom';
import { useScreenshotProtection } from '@/hooks/useScreenshotProtection';
import { GrillBuilderForm } from '@/components/grill-builder/GrillBuilderForm';
import { useClientGrillConfig } from '@/hooks/useClientGrillConfig';
import { useEmbedBootstrap } from '@/hooks/useEmbedBootstrap';
import { useEmbedAutoHeight } from '@/hooks/useEmbedAutoHeight';
import AccessDenied from './AccessDenied';

/**
 * Public embeddable Grillz Builder Form page.
 * Route: /embed-grillz/:clientId (dev) or /grillz/:clientId (widget.aurezotech.com)
 * This page is designed to be embedded in an iframe on external websites.
 */
export default function EmbedGrillzForm() {
  useScreenshotProtection('full');
  useEmbedAutoHeight();
  const { clientId } = useParams();
  const { config, loading, error } = useClientGrillConfig(clientId || null);
  const { domainAuthorized, featureEnabled, metaPixelId, blockReason } = useEmbedBootstrap(
    clientId,
    'grillz_builder',
    'grillz_builder',
  );

  if (domainAuthorized === null || featureEnabled === null || loading) {
    return null;
  }

  if (!domainAuthorized) {
    return <AccessDenied reason="unauthorized_domain" message="This embed is not authorized to load on this domain." />;
  }
  if (!featureEnabled) {
    // A billing pause and an admin-disabled module are different problems —
    // report them as such instead of blaming the domain whitelist.
    return blockReason === 'billing'
      ? <AccessDenied reason="billing_paused" />
      : <AccessDenied reason="feature_disabled" />;
  }

  // N3: surface config load errors rather than silently falling back to hardcoded defaults
  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-8 text-center">
        <p className="text-sm text-muted-foreground">
          Unable to load the Grill Builder. Please refresh the page or contact support.
        </p>
      </div>
    );
  }

  const formBg = config?.form_colors?.background || '#ffffff';
  return (
    <div className="min-h-screen" style={{ backgroundColor: formBg }}>
      <GrillBuilderForm config={config} clientId={clientId} metaPixelId={metaPixelId} />
    </div>
  );
}
