import { useParams } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useScreenshotProtection } from '@/hooks/useScreenshotProtection';
import { useEmbedAutoHeight } from '@/hooks/useEmbedAutoHeight';

import { MetalBuyingForm } from '@/components/metal-buying/MetalBuyingForm';
import { initMetaPixel } from '@/lib/meta-pixel';
import { initClientTracking } from '@/lib/conversion-tracking';
import { trackWidgetView } from '@/lib/analytics-utils';
import AccessDenied from './AccessDenied';
import { isTrustedReferrer } from '@/lib/trusted-referrer';
import { METAL_IQ_DEFAULT_COLORS } from '@/lib/metal-iq-defaults';

export default function EmbedMetalBuying() {
  useScreenshotProtection('full');
  useEmbedAutoHeight();
  const { clientId } = useParams<{ clientId: string }>();
  const [config, setConfig] = useState<any>(null);
  const [branding, setBranding] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [domainAuthorized, setDomainAuthorized] = useState<boolean | null>(null);
  const [featureEnabled, setFeatureEnabled] = useState<boolean | null>(null);
  // Module is on but billing blocks it (failed payment / cancelled subscription).
  const [billingBlocked, setBillingBlocked] = useState(false);

  // Feature access check — read via SECURITY DEFINER RPC because the
  // `clients` table is not directly readable by the anon role used in
  // public iframe embeds. Re-checked on an interval + tab focus so toggling
  // Metal IQ off/on takes effect on already-open widgets without a refresh.
  useEffect(() => {
    if (!clientId) return;
    let cancelled = false;
    const checkFeatureAccess = async () => {
      try {
        const { data, error } = await supabase
          .rpc('get_client_branding', { client_uuid: clientId });
        if (error) throw error;
        if (cancelled) return;
        const features = (data?.[0]?.enabled_features ?? null) as Record<string, boolean> | null;
        // Default to enabled if the flag is missing (back-compat); only
        // explicit `false` blocks access. The billing gate turns the widget
        // off on a failed payment or cancelled subscription.
        const moduleOn = features?.metal_buying !== false;
        const subscriptionActive = data?.[0]?.subscription_active !== false;
        setBillingBlocked(moduleOn && !subscriptionActive);
        setFeatureEnabled(moduleOn && subscriptionActive);
      } catch {
        // Fail open on transient RPC errors — domain check still gates access.
        if (!cancelled) setFeatureEnabled(true);
      }
    };
    checkFeatureAccess();
    const interval = setInterval(checkFeatureAccess, 30_000);
    const onVisible = () => { if (document.visibilityState === 'visible') checkFeatureAccess(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [clientId]);

  // Domain whitelisting check + fetch meta pixel ID + branding
  useEffect(() => {
    const checkDomainAuthorization = async () => {
      if (!clientId) return;

      const referrer = document.referrer;
      const isSameOrigin = isTrustedReferrer(referrer, window.location.hostname);

      if (isSameOrigin) {
        setDomainAuthorized(true);
      }

      try {
        const { data: clientData, error } = await supabase
          .rpc('get_client_branding', { client_uuid: clientId });

        if (error && (error as any).code !== 'PGRST116') throw error;

        const client = clientData?.[0];

        // Store branding
        if (client) {
          setBranding(client);
        }

        // Init Meta Pixel if configured
        if (client?.meta_pixel_id) {
          initMetaPixel(client.meta_pixel_id as string);
        }

        // Google Ads / GTM tags (no-op unless the client configured them)
        initClientTracking(client);

        if (isSameOrigin) return;

        const allowedDomains = (client?.allowed_domains || []) as string[];

        if (allowedDomains.length === 0) {
          setDomainAuthorized(true);
          return;
        }

        const referrerUrl = new URL(referrer);
        const referrerDomain = referrerUrl.hostname;

        const isAuthorized = allowedDomains.some(domain =>
          referrerDomain === domain || referrerDomain.endsWith(`.${domain}`)
        );

        setDomainAuthorized(isAuthorized);
      } catch (error) {
        console.error('Domain check error:', error);
        setDomainAuthorized(true);
      }
    };

    checkDomainAuthorization();
  }, [clientId]);

  // Load config
  useEffect(() => {
    if (!clientId) return;

    async function load() {
      const { data, error: configError } = await supabase
        .from('client_metal_buying_config')
        .select('*')
        .eq('client_id', clientId)
        .maybeSingle();

      if (configError || !data) {
        setError('Metal buying is not configured for this jeweler.');
        setLoading(false);
        return;
      }

      setConfig(data);
      setLoading(false);
    }

    load();
  }, [clientId]);

  // Track widget view once authorized
  useEffect(() => {
    if (domainAuthorized && featureEnabled && clientId) {
      void trackWidgetView(clientId, 'metal_buying');
    }
  }, [domainAuthorized, featureEnabled, clientId]);

  if (domainAuthorized === null || featureEnabled === null || loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!domainAuthorized) {
    return <AccessDenied reason="unauthorized_domain" message="This embed is not authorized to load on this domain." />;
  }
  if (!featureEnabled) {
    return billingBlocked
      ? <AccessDenied reason="billing_paused" />
      : <AccessDenied reason="unauthorized_domain" message="This widget is not enabled for this account." />;
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen text-center p-6">
        <div>
          <h2 className="text-xl font-bold text-foreground mb-2">Not Available</h2>
          <p className="text-muted-foreground">{error}</p>
        </div>
      </div>
    );
  }

  const formColors = config?.form_colors as Record<string, string> | undefined;
  const brandingConfig = branding?.branding_config as any;
  // Prefer form_colors from metal buying config, fallback to branding
  const accent = formColors?.tabBorder || brandingConfig?.accentColor || METAL_IQ_DEFAULT_COLORS.tabBorder;
  const font = formColors?.fontColor || brandingConfig?.fontColor || METAL_IQ_DEFAULT_COLORS.fontColor;
  const bg = formColors?.background || brandingConfig?.backgroundColor || METAL_IQ_DEFAULT_COLORS.background;

  return (
    <div className="min-h-screen" style={{ backgroundColor: bg }}>
      
      <MetalBuyingForm
        clientId={clientId!}
        config={config}
        accentColor={accent}
        fontColor={font}
        backgroundColor={bg}
        currency={branding?.currency as string || 'USD'}
      />
    </div>
  );
}
