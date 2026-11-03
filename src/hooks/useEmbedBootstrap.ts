import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { initMetaPixel } from '@/lib/meta-pixel';
import { initClientTracking } from '@/lib/conversion-tracking';
import { trackWidgetView, type WidgetViewSource } from '@/lib/analytics-utils';
import { isTrustedReferrer } from '@/lib/trusted-referrer';

export type EmbedBlockReason = 'domain' | 'feature' | 'billing' | null;

interface EmbedBootstrapResult {
  domainAuthorized: boolean | null;
  featureEnabled: boolean | null;
  metaPixelId: string | null;
  /**
   * Why the widget is blocked, when it is. Previously a billing pause and a
   * disabled module both surfaced as "Unauthorized Domain", which sent admins
   * hunting through domain whitelists for a subscription problem.
   */
  blockReason: EmbedBlockReason;
}

/**
 * H5/J5: Shared embed bootstrap hook — resolves feature access + domain
 * authorization for public iframe embeds.
 *
 * IMPORTANT: the feature flag is read via the SECURITY DEFINER RPC
 * `get_client_branding`, NOT a direct `clients` table read. The `clients`
 * table is not readable by the anon role used in public embeds (RESTRICTIVE
 * RLS + REVOKE), so a direct `.from('clients')` read returns null for anon and
 * makes `enabled_features` look absent — causing the widget to stay enabled
 * even when the admin toggled the module OFF. The RPC returns the flags to
 * anon correctly.
 *
 * The access check re-runs on an interval and whenever the widget tab regains
 * focus, so toggling a module off/on takes effect on already-open widgets
 * without a manual page refresh.
 */
export function useEmbedBootstrap(
  clientId: string | null | undefined,
  featureKey: string,
  analyticsKey: WidgetViewSource,
): EmbedBootstrapResult {
  const [domainAuthorized, setDomainAuthorized] = useState<boolean | null>(null);
  const [featureEnabled, setFeatureEnabled] = useState<boolean | null>(null);
  const [metaPixelId, setMetaPixelId] = useState<string | null>(null);
  const [blockReason, setBlockReason] = useState<EmbedBlockReason>(null);
  const pixelInited = useRef(false);

  useEffect(() => {
    if (!clientId) {
      setDomainAuthorized(true);
      setFeatureEnabled(false);
      setBlockReason('feature');
      return;
    }

    const referrer = document.referrer;
    const isSameOrigin = isTrustedReferrer(referrer, window.location.hostname);
    let cancelled = false;

    const evaluate = async () => {
      const brandingRes = await supabase.rpc('get_client_branding', { client_uuid: clientId });
      if (cancelled) return;

      const client = brandingRes.data?.[0];

      // Feature check — read the flag from the RPC result and also require an
      // active subscription. If the client's subscription is past_due / unpaid
      // / canceled the widget stops working until payment is received.
      const subscriptionActive = client?.subscription_active !== false;
      const features = (client?.enabled_features ?? null) as Record<string, boolean> | null;
      // Default to enabled if the flag is missing (back-compat); only explicit
      // `false` blocks access.
      const featureOn = features?.[featureKey] !== false;
      setFeatureEnabled(featureOn && subscriptionActive);
      if (!featureOn) setBlockReason('feature');
      else if (!subscriptionActive) setBlockReason('billing');
      else setBlockReason(null);

      // Domain + pixel check
      try {
        if (brandingRes.error && (brandingRes.error as any).code !== 'PGRST116') throw brandingRes.error;

        if (client?.meta_pixel_id && !pixelInited.current) {
          pixelInited.current = true;
          setMetaPixelId(client.meta_pixel_id as string);
          initMetaPixel(client.meta_pixel_id as string);
        }

        // Google Ads / GTM tags (no-op unless the client configured them)
        initClientTracking(client);

        if (isSameOrigin) {
          setDomainAuthorized(true);
          return;
        }

        const allowedDomains = (client?.allowed_domains || []) as string[];
        if (allowedDomains.length === 0) {
          setDomainAuthorized(true);
          return;
        }

        try {
          const referrerDomain = new URL(referrer).hostname;
          const isAuthorized = allowedDomains.some(d =>
            referrerDomain === d || referrerDomain.endsWith(`.${d}`)
          );
          setDomainAuthorized(isAuthorized);
          if (!isAuthorized) setBlockReason('domain');
        } catch {
          setDomainAuthorized(true);
        }
      } catch (error) {
        console.error('Domain check error:', error);
        setDomainAuthorized(true);
      }
    };

    evaluate();

    // Re-check periodically + when the tab regains focus so an admin toggling
    // the module off/on is reflected on already-open widgets.
    const interval = setInterval(evaluate, 30_000);
    const onVisible = () => { if (document.visibilityState === 'visible') evaluate(); };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [clientId, featureKey]);

  // Track widget view once both checks pass
  useEffect(() => {
    if (domainAuthorized && featureEnabled && clientId) {
      void trackWidgetView(clientId, analyticsKey);
    }
  }, [domainAuthorized, featureEnabled, clientId, analyticsKey]);

  return { domainAuthorized, featureEnabled, metaPixelId, blockReason };
}
