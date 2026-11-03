import { useParams } from 'react-router-dom';
import { useScreenshotProtection } from '@/hooks/useScreenshotProtection';
import { useEmbedAutoHeight } from '@/hooks/useEmbedAutoHeight';
import { CustomEnquiryForm } from '@/components/custom-enquiry/CustomEnquiryForm';
import { useClientCustomEnquiryConfig } from '@/hooks/useClientCustomEnquiryConfig';
import { useEmbedBootstrap } from '@/hooks/useEmbedBootstrap';
import AccessDenied from './AccessDenied';

export default function EmbedCustomEnquiry() {
  useScreenshotProtection('full');
  useEmbedAutoHeight();
  const { clientId } = useParams();
  const { config, loading, error } = useClientCustomEnquiryConfig(clientId || null);
  const { domainAuthorized, featureEnabled, metaPixelId, blockReason } = useEmbedBootstrap(
    clientId,
    'custom_enquiry',
    'custom_enquiry',
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
          Unable to load the Custom Enquiry form. Please refresh the page or contact support.
        </p>
      </div>
    );
  }

  // Match CustomEnquiryForm's default (#0a0a0a) so any space below the form
  // content (e.g. a 100dvh mobile iframe) blends in instead of flashing white.
  const formBg = config?.form_colors?.background || '#0a0a0a';
  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: formBg }}>
      <CustomEnquiryForm config={config} clientId={clientId} metaPixelId={metaPixelId} />
    </div>
  );
}
