import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { resolveDiamondFromPresets, getNextRelevantStep } from '@/lib/ring-config-helpers';
import { useScreenshotProtection } from '@/hooks/useScreenshotProtection';

import { ProductViewer } from '@/components/ring-builder/ProductViewer';
import { ConfigurationPanel } from '@/components/ring-builder/ConfigurationPanel';
import { ElegantConfigurationPanel } from '@/components/ring-builder/ElegantConfigurationPanel';
import { BookAppointmentDialog } from '@/components/ring-builder/BookAppointmentDialog';
import { ChatAssistant } from '@/components/ring-builder/ChatAssistant';
import { CompareDialog } from '@/components/ring-builder/CompareDialog';
import { SaveDesignDialog } from '@/components/ring-builder/SaveDesignDialog';
import { NoDepositRequestForm } from '@/components/ring-builder/NoDepositRequestForm';
import { isNoDepositMode } from '@/lib/widget-pricing-mode';
import { hidesRingOsPrices, resolveRingOsFinalAction, usesDiamondTypeCheckout } from '@/lib/ring-os-diamond-checkout';
// CartDrawer kept for future use but not rendered (direct store redirect)
import { useRingConfiguration } from '@/hooks/useRingConfiguration';
import { useClientCatalogOptions } from '@/hooks/useClientCatalogOptions';
import { useClientCaratOptions } from '@/hooks/useClientCaratOptions';
import { useClientDiamondPresets } from '@/hooks/useClientDiamondPresets';
import { useClientDiamondCatalogAvailability } from '@/hooks/useClientDiamondCatalogAvailability';
import { useToast } from '@/hooks/use-toast';
import { RingConfiguration } from '@/types/ring-builder';
import { trackEmbedEvent, trackWidgetView } from '@/lib/analytics-utils';
import { initMetaPixel, trackMetaEvent } from '@/lib/meta-pixel';
import { initClientTracking } from '@/lib/conversion-tracking';
import { parsePreviewBranding, hexToHSL } from '@/lib/embed-utils';
import { trackRingView } from '@/lib/tracking-utils';
import { logSecurityEvent } from '@/lib/audit-utils';
import { sanitizeHexColor, sanitizeDisplayName } from '@/lib/xss-sanitizer';
import { applyThemeColors, buildThemeColorStyles, hexToHSLRaw } from '@/lib/apply-theme-colors';
import AccessDenied from './AccessDenied';
import { isTrustedReferrer } from '@/lib/trusted-referrer';
import { EmbedConfiguratorSkeleton } from '@/components/common/EmbedConfiguratorSkeleton';
import { THEME_COLOR_DEFAULTS } from '@/lib/theme-color-defaults';
import { WidgetThemeProvider, WidgetTheme } from '@/contexts/WidgetThemeContext';
import { coerceThemeForClient, isTwentyFourKClient, TWENTYFOURK_THEME_KEY } from '@/lib/twentyfourk-theme';
import { TwentyFourKShell } from '@/components/ring-builder/twentyfourk/TwentyFourKShell';
import { getEmbedClientOverrides, clampTabletFitHeight } from '@/lib/embed-client-overrides';
import { isCaratSelectionAvailable } from '@/lib/ring-carat-slider';
import { normalizeRingOsCurrency, usesRingOsCurrency } from '@/lib/ring-os-currency';

export default function EmbedConfigurator() {
  useScreenshotProtection('full');
  const { clientId } = useParams();
  const [searchParams] = useSearchParams();
  const [appointmentDialogOpen, setAppointmentDialogOpen] = useState(false);
  const [showChatAssistant, setShowChatAssistant] = useState(false);
  const [showCompareDialog, setShowCompareDialog] = useState(false);
  const [saveDesignDialogOpen, setSaveDesignDialogOpen] = useState(false);
  const [noDepositFormOpen, setNoDepositFormOpen] = useState(false);
  const [branding, setBranding] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isAddingToCart, setIsAddingToCart] = useState(false);
  // Cart drawer state removed - now redirecting directly to store cart
  const [domainAuthorized, setDomainAuthorized] = useState<boolean | null>(null);
  const [featureEnabled, setFeatureEnabled] = useState<boolean | null>(null);
  // Module is on but billing blocks it (failed payment / cancelled subscription).
  const [billingBlocked, setBillingBlocked] = useState(false);
  const [showAIAssistantButton, setShowAIAssistantButton] = useState(true);
  const [showComparisonButton, setShowComparisonButton] = useState(false);
  const [showSaveDesignButton, setShowSaveDesignButton] = useState(true);
  // Ring OS catalogue currency (Sandbox only, see src/lib/ring-os-currency.ts):
  // the ring step prices and the diamond prices are both in this currency.
  // Every other account keeps branding.currency exactly as before.
  const [ringOsCurrency, setRingOsCurrency] = useState<string | null>(null);
  useEffect(() => {
    if (!usesRingOsCurrency(clientId)) return;
    let cancelled = false;
    (supabase as any).rpc('get_ring_os_currency', { p_client_id: clientId }).then(({ data }: { data: unknown }) => {
      if (!cancelled && data) setRingOsCurrency(normalizeRingOsCurrency(data));
    });
    return () => { cancelled = true; };
  }, [clientId]);
  const [currentTheme, setCurrentTheme] = useState<WidgetTheme>(() => {
    // Note: clientId gating is enforced inside the load effect; here we just
    // honor the URL hint without letting non-24k visitors land on twentyfourk.
    return coerceThemeForClient(clientId, searchParams.get('theme'), 'luxury');
  });
  const [storeName, setStoreName] = useState<string | null>(null);
  const [pricingMode, setPricingMode] = useState<string>('custom_pricing');
  const [depositAmount, setDepositAmount] = useState<number>(0);
  // No-Deposit mode reuses the whole Estimates presentation (estimate step,
  // "Complete Request — No Deposit" CTA) with a forced $0 deposit; only the
  // final action differs — it opens the lead form instead of Shopify checkout.
  const noDeposit = isNoDepositMode(pricingMode);
  const widgetPricingMode = noDeposit ? 'estimates' : pricingMode;
  const widgetDepositAmount = noDeposit ? 0 : depositAmount;
  const embedRootRef = useRef<HTMLDivElement>(null);
  // Client-scoped embed overrides (see src/lib/embed-client-overrides.ts).
  const clientOverrides = getEmbedClientOverrides(clientId);
  const tabletFit = clientOverrides.tabletFit;
  const catalogOptions = useClientCatalogOptions(clientId);
  const { caratOptions, loading: caratLoading } = useClientCaratOptions(clientId || null);
  const { diamondPresets, loading: diamondLoading } = useClientDiamondPresets(clientId || null);
  const { availability: diamondAvailability, loading: availabilityLoading } = useClientDiamondCatalogAvailability(clientId || null);
  const ringConfig = useRingConfiguration({
    styles: catalogOptions.styles,
    shanks: catalogOptions.shanks,
    metals: catalogOptions.metals,
    caratOptions: caratOptions,
  });
  const { toast } = useToast();
  // 24k Carat Jewelers: natural -> lead form, lab -> full-price checkout.
  // Every other account resolves exactly as before from its stored mode.
  const diamondTypeCheckout = usesDiamondTypeCheckout(clientId);
  const selectedStoneType = ringConfig.configuration.stone?.type ?? null;
  const finalAction = resolveRingOsFinalAction(clientId, pricingMode, selectedStoneType);
  const leadCapture = diamondTypeCheckout ? finalAction === 'lead_capture' : noDeposit;
  const hidePrices = hidesRingOsPrices(clientId, selectedStoneType);
  const ringFlowPricingMode = diamondTypeCheckout ? 'custom_pricing' : widgetPricingMode;

  // SHAPE options come from the ring catalog only — do NOT filter by the
  // diamond catalog. Shapes here represent ring/setting shapes, which are
  // independent of the diamond inventory used by the CARAT step.
  const effectiveShapes = useMemo(() => catalogOptions.shapes, [catalogOptions.shapes]);

  const effectiveShapeIds = useMemo(
    () => new Set(effectiveShapes.map((shape) => shape.id.toLowerCase())),
    [effectiveShapes],
  );

  const effectiveCaratOptions = useMemo(() => {
    const selectedShape = ringConfig.configuration.shape?.toLowerCase();
    // For confirmed catalogs: if the selected shape has no diamonds in the
    // catalog, return [] so CaratStep shows no options for that shape.
    // For unconfirmed: fall back to all catalog buckets (legacy behaviour).
    const buckets = selectedShape
      ? (diamondAvailability.shapeCaratBuckets[selectedShape] ?? (diamondAvailability.isConfirmed ? [] : diamondAvailability.caratBuckets))
      : diamondAvailability.caratBuckets;
    if (diamondAvailability.isConfirmed) {
      const existingByValue = new Map(caratOptions.map((option) => [Number(option.carat_value), option]));
      return buckets.map((bucket) => existingByValue.get(bucket) ?? ({
        id: `catalog-${bucket}`,
        client_id: clientId || '',
        carat_value: bucket,
        display_name: `${bucket.toFixed(2)} Carat`,
        is_enabled: true,
        price_adjustment: 0,
        created_at: new Date(0).toISOString(),
        updated_at: new Date(0).toISOString(),
      } as any));
    }
    if (buckets.length === 0) return caratOptions;

    const existingByValue = new Map(caratOptions.map((option) => [Number(option.carat_value), option]));
    return buckets.map((bucket) => existingByValue.get(bucket) ?? ({
      id: `catalog-${bucket}`,
      client_id: clientId || '',
      carat_value: bucket,
      display_name: `${bucket.toFixed(2)} Carat`,
      is_enabled: true,
      price_adjustment: 0,
      created_at: new Date(0).toISOString(),
      updated_at: new Date(0).toISOString(),
    } as any));
  }, [caratOptions, clientId, diamondAvailability.caratBuckets, diamondAvailability.isConfirmed, diamondAvailability.shapeCaratBuckets, ringConfig.configuration.shape]);

  const effectiveCaratValues = useMemo(
    () => new Set(effectiveCaratOptions.map((option) => Number(option.carat_value))),
    [effectiveCaratOptions],
  );

  const isEffectiveCaratSelection = useCallback((value: number | null) => {
    if (value == null) return false;
    if (currentTheme === 'twentyfourk') {
      return isCaratSelectionAvailable(value, Array.from(effectiveCaratValues));
    }
    return effectiveCaratValues.has(Number(value));
  }, [currentTheme, effectiveCaratValues]);

  // Bucket starts (e.g. [0.5, 1.5]) available in the client's confirmed
  // diamond catalog for the currently selected shape. Used by CaratStep to
  // hide standard carat ranges that the client did not configure.
  // For confirmed catalogs: empty array when the selected shape has no diamonds
  // (correct — CaratStep should show nothing, preventing confusion on Stone step).
  // For unconfirmed: undefined when no buckets, so CaratStep shows all ranges.
  const availableCaratBuckets = useMemo(() => {
    const selectedShape = ringConfig.configuration.shape?.toLowerCase();
    const buckets = selectedShape
      ? (diamondAvailability.shapeCaratBuckets[selectedShape] ?? (diamondAvailability.isConfirmed ? [] : diamondAvailability.caratBuckets))
      : diamondAvailability.caratBuckets;
    if (!diamondAvailability.isConfirmed && buckets.length === 0) return undefined;
    return buckets.map((value) => Number(value));
  }, [diamondAvailability.caratBuckets, diamondAvailability.isConfirmed, diamondAvailability.shapeCaratBuckets, ringConfig.configuration.shape]);

  // Allow embed body to scroll internally (rescues stale customer snippets that
  // cap iframe height — users can still scroll within the iframe to see the
  // AI render footer, regenerate panel, etc.). Also report content height to
  // parent for auto-sizing on snippets that support it.
  useEffect(() => {
    document.body.setAttribute('data-embed', 'true');
    // Info popups portal to <body>, so the "don't dim the viewer" override is
    // exposed as a body attribute for index.css rather than prop-drilled.
    if (clientOverrides.undimmedInfoPopups) document.body.setAttribute('data-undimmed-popups', 'true');

    // Set explicit height for iframe context to handle mobile Safari quirks.
    // Stability rules (same value, just calmer):
    //  - while pinch-zoomed, use the layout viewport so the widget doesn't
    //    resize under the user's fingers
    //  - round to whole pixels and ignore sub-threshold jitter (address bar)
    //  - coalesce bursts of resize events into one write per frame
    let lastVh = 0;
    let vhFrame: number | null = null;

    const applyHeight = () => {
      vhFrame = null;
      const vv = window.visualViewport;
      const pinched = vv ? vv.scale > 1.01 : false;
      let vh = pinched ? window.innerHeight : (vv?.height ?? window.innerHeight);
      // tabletFit clients: never let the widget grow past the tablet cap, even
      // when the iframe reports the full device height (see embed-client-overrides).
      if (tabletFit) vh = clampTabletFitHeight(vh, window.innerWidth);
      vh = Math.round(vh);
      if (vh <= 0 || Math.abs(vh - lastVh) < 24) return;
      lastVh = vh;
      document.documentElement.style.setProperty('--embed-vh', `${vh}px`);
    };

    const updateHeight = () => {
      if (vhFrame !== null) return;
      vhFrame = requestAnimationFrame(applyHeight);
    };

    applyHeight();
    window.addEventListener('resize', updateHeight);
    window.addEventListener('orientationchange', updateHeight);
    window.visualViewport?.addEventListener('resize', updateHeight);

    // Notify host page that widget is ready for height sync
    window.parent?.postMessage(JSON.stringify({ type: 'jewlx-ready' }), '*');

    // --- Auto-height reporting to parent ---
    let resizeTimer: ReturnType<typeof setTimeout> | null = null;
    const sendHeight = () => {
      let h = Math.max(
        document.documentElement.scrollHeight,
        document.body?.scrollHeight ?? 0
      );
      if (tabletFit) h = clampTabletFitHeight(h, window.innerWidth);
      try {
        window.parent?.postMessage(JSON.stringify({ type: 'jewlx-resize', height: h }), '*');
      } catch { /* cross-origin safety */ }
    };

    const debouncedSendHeight = () => {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(sendHeight, 100);
    };

    const resizeObserver = new ResizeObserver(debouncedSendHeight);
    resizeObserver.observe(document.documentElement);
    if (document.body) resizeObserver.observe(document.body);

    // Mutation observer catches conditional sections (AI render reveal, comments)
    const mutationObserver = new MutationObserver(debouncedSendHeight);
    mutationObserver.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['style', 'class'],
    });

    const initialTimer = setTimeout(sendHeight, 300);
    const secondaryTimer = setTimeout(sendHeight, 1500);

    return () => {
      window.removeEventListener('resize', updateHeight);
      window.removeEventListener('orientationchange', updateHeight);
      window.visualViewport?.removeEventListener('resize', updateHeight);
      if (vhFrame !== null) cancelAnimationFrame(vhFrame);
      resizeObserver.disconnect();
      mutationObserver.disconnect();
      if (resizeTimer) clearTimeout(resizeTimer);
      clearTimeout(initialTimer);
      clearTimeout(secondaryTimer);
      document.body.removeAttribute('data-embed');
      document.body.removeAttribute('data-undimmed-popups');
    };
  }, [tabletFit, clientOverrides.undimmedInfoPopups]);

  // 24k embeds should not expose JewlX in the browser tab title either.
  useEffect(() => {
    if (currentTheme === 'twentyfourk') {
      document.title = 'Ring Configurator';
    }
  }, [currentTheme]);

  // Domain whitelisting check
  useEffect(() => {
    const checkDomainAuthorization = async () => {
      if (!clientId) return;
      
      // Skip check for preview mode or same-origin
      const isPreview = searchParams.get('preview') === 'true';
      const referrer = document.referrer;
      const isSameOrigin = isTrustedReferrer(referrer, window.location.hostname);
      
      if (isPreview || isSameOrigin) {
        setDomainAuthorized(true);
        return;
      }

      try {
        // Get allowed domains for this client using secure RPC function
        const { data: clientData, error: clientErr } = await supabase
          .rpc('get_client_branding', { client_uuid: clientId });

        if (clientErr && (clientErr as any).code !== 'PGRST116') throw clientErr;

        const client = clientData?.[0];
        const allowedDomains = (client?.allowed_domains || []) as string[];
        
        // If no domains configured, allow all (backwards compatible)
        if (allowedDomains.length === 0) {
          setDomainAuthorized(true);
          return;
        }

        // Check if referrer domain is in allowed list
        const referrerUrl = new URL(referrer);
        const referrerDomain = referrerUrl.hostname;
        
        const isAuthorized = allowedDomains.some(domain => 
          referrerDomain === domain || referrerDomain.endsWith(`.${domain}`)
        );

        if (!isAuthorized) {
          await logSecurityEvent('unauthorized_embed_domain', {
            clientId,
            attemptedDomain: referrerDomain,
            allowedDomains,
          }, 'warning');
        }

        setDomainAuthorized(isAuthorized);
      } catch (error) {
        console.error('Domain check error:', error);
        setDomainAuthorized(true); // Fail open to not break existing embeds
      }
    };

    checkDomainAuthorization();
  }, [clientId, searchParams]);

  // Feature access check — gate the whole RingOS ring builder on the
  // `product_catalogue` flag. Read via the SECURITY DEFINER RPC because the
  // `clients` table is not readable by the anon role used in public iframe
  // embeds. Without this the ring builder ignored the RingOS toggle entirely.
  // Re-checked on an interval + tab focus so toggling RingOS off/on takes
  // effect on already-open widgets without a manual refresh. Preview mode
  // (admin dashboard) is always allowed.
  useEffect(() => {
    if (!clientId) return;
    const isPreview = searchParams.get('preview') === 'true';
    if (isPreview) {
      setFeatureEnabled(true);
      return;
    }
    let cancelled = false;
    const checkFeatureAccess = async () => {
      try {
        const { data } = await supabase
          .rpc('get_client_branding', { client_uuid: clientId });
        if (cancelled) return;
        const features = (data?.[0]?.enabled_features ?? null) as Record<string, boolean> | null;
        // Default to enabled if the flag is missing (back-compat); only
        // explicit `false` blocks access. The billing gate turns the widget
        // off on a failed payment or cancelled subscription.
        const moduleOn = features?.product_catalogue !== false;
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
  }, [clientId, searchParams]);

  // Track widget view once domain AND feature access are confirmed.
  // The feature gate was missing here (unlike the other four embeds), so a
  // client with Ring OS switched off still accumulated views it never served.
  // Admin preview loads (?preview=true) are excluded — they are not customer
  // traffic and were inflating the client's Ring OS view count.
  useEffect(() => {
    if (searchParams.get('preview') === 'true') return;
    if (domainAuthorized && featureEnabled && clientId) {
      void trackWidgetView(clientId, 'jewlx_widget');
    }
  }, [domainAuthorized, featureEnabled, clientId, searchParams]);

  useEffect(() => {
    const loadBranding = async () => {
      if (!clientId) return;
      
      const previewBranding = parsePreviewBranding(searchParams);
      
      if (previewBranding) {
        // XSS Protection: Sanitize all URL parameters before use
        const sanitizedBranding: any = {
          ...previewBranding,
          primaryColor: sanitizeHexColor(previewBranding.primaryColor) || undefined,
          secondaryColor: sanitizeHexColor(previewBranding.secondaryColor) || undefined,
          companyName: sanitizeDisplayName(previewBranding.companyName) || undefined,
        };
        
        // Also fetch themeColors from DB so per-theme branding customizations apply in preview
        try {
          const { data: rpcData } = await supabase
            .rpc('get_client_branding', { client_uuid: clientId });
          const dbConfig = (rpcData?.[0]?.branding_config || {}) as any;
          if (dbConfig.themeColors) {
            sanitizedBranding.themeColors = dbConfig.themeColors;
          }
          // stepOrder is configured in DB only (not passed via preview URL),
          // so always hydrate it from the DB so the preview reflects the saved sequence.
          if (dbConfig.stepOrder) {
            sanitizedBranding.stepOrder = dbConfig.stepOrder;
          }
          if (typeof dbConfig.videoFirst === 'boolean') {
            sanitizedBranding.videoFirst = dbConfig.videoFirst;
          }
          if (typeof dbConfig.clickToContinue === 'boolean') {
            sanitizedBranding.clickToContinue = dbConfig.clickToContinue;
          }
        } catch (e) {
          console.warn('Could not load themeColors/stepOrder for preview:', e);
        }
        
        setBranding(sanitizedBranding);
        setShowAIAssistantButton(sanitizedBranding.showChatAssistant ?? true);
        setShowComparisonButton(sanitizedBranding.showComparison ?? true);
        setShowSaveDesignButton(sanitizedBranding.showSaveDesign ?? true);
        
        // Set theme from URL params (gated by client)
        if (previewBranding.theme) {
          const coerced = coerceThemeForClient(clientId, previewBranding.theme, 'luxury');
          setCurrentTheme(coerced);
          if (coerced === 'chat') {
            setShowChatAssistant(true);
          }
        }
        
        // Per-theme colors will be applied by the consolidated useEffect below
        
        // Legacy primary/secondary colors will also be applied by the consolidated useEffect
      } else {
        // Use secure RPC function for public embed access
        const { data: rpcData, error } = await supabase
          .rpc('get_client_branding', { client_uuid: clientId });

        // Treat "0 rows" as a non-error (common for incomplete setups)
        if (error && (error as any).code !== 'PGRST116') {
          console.warn('Could not load branding, using defaults:', error);
          setBranding({ primaryColor: '#50c878', secondaryColor: '#0b6e4f' });
          setLoading(false);
          return;
        }

        const data = rpcData?.[0];
        
        if (!data) {
          setBranding({ primaryColor: '#50c878', secondaryColor: '#0b6e4f' });
        } else {
          const config = (data.branding_config || {}) as any;
          setBranding(config);
          if (data.company_name) setStoreName(data.company_name as string);
          setShowAIAssistantButton(config.showChatAssistant ?? true);
          setShowComparisonButton(config.showComparison ?? true);
          setShowSaveDesignButton(config.showSaveDesign ?? true);
          
          // Set theme from database (gated by client — 24k client is always forced to 'twentyfourk',
          // and non-24k clients can never end up on 'twentyfourk' even if the DB value is stale).
          const coercedDbTheme = coerceThemeForClient(clientId, data.widget_theme, 'luxury');
          setCurrentTheme(coercedDbTheme);
          if (coercedDbTheme === 'chat') {
            setShowChatAssistant(true);
          }
          
          // Per-theme and legacy colors will be applied by the consolidated useEffect below
          
          // Init Meta Pixel if configured
          if (data.meta_pixel_id) {
            initMetaPixel(data.meta_pixel_id as string);
          }

          // Google Ads / GTM tags (no-op unless the client configured them)
          initClientTracking(data);

          await trackEmbedEvent(clientId, 'embed_view');
        }
      }
      
      // Standalone ?theme= override (for testing all themes without changing DB)
      const urlThemeOverride = searchParams.get('theme');
      if (!previewBranding && urlThemeOverride) {
        const coercedOverride = coerceThemeForClient(clientId, urlThemeOverride, currentTheme);
        if (coercedOverride !== currentTheme) {
          setCurrentTheme(coercedOverride);
        }
        if (coercedOverride === 'chat') {
          setShowChatAssistant(true);
        }
      }

      // Final safety net: 24k client is ALWAYS forced to its exclusive theme.
      if (isTwentyFourKClient(clientId)) {
        setCurrentTheme(TWENTYFOURK_THEME_KEY);
      }

      setLoading(false);
    };

    const loadPricingMode = async () => {
      if (!clientId) return;
      try {
        const { data } = await supabase
          .from('client_onboarding_preferences')
          .select('widget_pricing_mode, widget_deposit_amount')
          .eq('client_id', clientId)
          .maybeSingle();
        if (data) {
          setPricingMode(data.widget_pricing_mode || 'custom_pricing');
          setDepositAmount(data.widget_deposit_amount || 0);
        }
      } catch (e) {
        console.warn('Could not load pricing mode:', e);
      }
    };

    loadBranding();
    loadPricingMode();
  }, [clientId, searchParams]);

  // Real-time sync for branding changes
  useEffect(() => {
    if (!clientId || loading) return;
    
    const channel = supabase
      .channel(`client-branding-${clientId}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'clients',
        filter: `id=eq.${clientId}`
      }, (payload) => {
        const config = (payload.new.branding_config || {}) as any;
        setBranding(config);
        setShowAIAssistantButton(config.showChatAssistant ?? true);
        setShowComparisonButton(config.showComparison ?? true);
        setShowSaveDesignButton(config.showSaveDesign ?? true);
        
        // Per-theme and legacy colors will be applied by the consolidated useEffect below
      })
      .subscribe();
      
    return () => { supabase.removeChannel(channel); };
  }, [clientId, loading]);

  // Compute inline CSS variable overrides from branding (reactive, survives re-renders)
  const themeStyleOverrides = useMemo(() => {
    if (!branding) return {};
    const styles: Record<string, string> = {};

    // Per-theme custom colors
    const themeKey = currentTheme || 'luxury';
    if (branding.themeColors && branding.themeColors[themeKey]) {
      Object.assign(styles, buildThemeColorStyles(branding.themeColors[themeKey]));
    }

    // Legacy primary/secondary color overrides
    if (branding.primaryColor) {
      const hsl = hexToHSLRaw(branding.primaryColor);
      if (!styles['--client-accent']) styles['--client-accent'] = hsl;
      if (!styles['--client-subtle']) styles['--client-subtle'] = hsl;
      const lightness = parseInt(hsl.split('%')[0].split(' ').pop() || '50');
      styles['--client-accent-foreground'] = lightness > 55 ? '0 0% 0%' : '0 0% 100%';
    }
    if (branding.secondaryColor) {
      styles['--client-secondary'] = hexToHSLRaw(branding.secondaryColor);
    }

    return styles;
  }, [branding, currentTheme]);

  // Resolved hex palette (theme defaults + client customizations) for portaled
  // dialogs and third-party embeds that need real hex values.
  const resolvedThemeColors = useMemo(() => {
    const themeKey = currentTheme || 'luxury';
    const defaults = THEME_COLOR_DEFAULTS[themeKey] || THEME_COLOR_DEFAULTS.luxury;
    const custom = branding?.themeColors?.[themeKey] || {};
    return { ...defaults, ...custom };
  }, [branding, currentTheme]);

  // Sync theme overrides to documentElement so portaled UI (dialogs) inherits them
  useEffect(() => {
    const entries = Object.entries(themeStyleOverrides);
    entries.forEach(([prop, value]) => {
      document.documentElement.style.setProperty(prop, value);
    });
    return () => {
      entries.forEach(([prop]) => {
        document.documentElement.style.removeProperty(prop);
      });
    };
  }, [themeStyleOverrides]);

  useEffect(() => {
    if (catalogOptions.loading || availabilityLoading) return;
    // Auto-select defaults for all themes including chat mode so the product viewer always shows a ring.
    
    // Auto-select first available option for each category
    if (catalogOptions.styles.length > 0 && !ringConfig.configuration.style) {
      ringConfig.updateStyle(catalogOptions.styles[0].id as any);
    }
    if (catalogOptions.shanks.length > 0 && !ringConfig.configuration.shank) {
      ringConfig.updateShank(catalogOptions.shanks[0].id as any);
    }
    if (catalogOptions.metals.length > 0 && !ringConfig.configuration.metal) {
      ringConfig.updateMetal(catalogOptions.metals[0].id as any);
    }
    const currentShape = ringConfig.configuration.shape?.toLowerCase() ?? null;
    if (effectiveShapes.length > 0 && (!currentShape || !effectiveShapeIds.has(currentShape))) {
      ringConfig.updateShape(effectiveShapes[0].id as any);
      return;
    }

    const currentCarat = ringConfig.configuration.caratRange;
    if (effectiveCaratOptions.length > 0 && !isEffectiveCaratSelection(currentCarat)) {
      ringConfig.updateCaratRange(effectiveCaratOptions[0].carat_value as any);
    }
  }, [
    availabilityLoading,
    catalogOptions.loading,
    catalogOptions.styles,
    catalogOptions.shanks,
    catalogOptions.metals,
    effectiveShapes,
    effectiveShapeIds,
    effectiveCaratOptions,
    effectiveCaratValues,
    isEffectiveCaratSelection,
    ringConfig.configuration.style,
    ringConfig.configuration.shank,
    ringConfig.configuration.metal,
    ringConfig.configuration.shape,
    ringConfig.configuration.caratRange,
    showChatAssistant,
  ]);

  // Fire ViewContent once when widget is ready
  const viewContentFired = useRef(false);
  useEffect(() => {
    if (!loading && !viewContentFired.current) {
      viewContentFired.current = true;
      trackMetaEvent('ViewContent', { content_name: 'Ring Configurator', content_category: 'widget' });
    }
  }, [loading]);

  // Track configuration views
  useEffect(() => {
    if (clientId && ringConfig.configuration && !loading) {
      const timer = setTimeout(() => {
        trackRingView(clientId, ringConfig.configuration);
      }, 2000); // Debounce tracking
      return () => clearTimeout(timer);
    }
  }, [clientId, ringConfig.configuration, loading]);

  // Keyboard shortcuts prevention (right-click is now enabled)
  useEffect(() => {
    // Disable keyboard shortcuts for saving/inspecting
    const handleKeyDown = (e: KeyboardEvent) => {
      // Disable Ctrl+S, Ctrl+U, Ctrl+Shift+I, F12
      if (
        (e.ctrlKey && (e.key === 's' || e.key === 'S' || e.key === 'u' || e.key === 'U')) ||
        (e.ctrlKey && e.shiftKey && (e.key === 'i' || e.key === 'I')) ||
        e.key === 'F12'
      ) {
        e.preventDefault();
        return false;
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const handleApplyAIConfiguration = useCallback((configuration: any) => {
    if (configuration.style) ringConfig.updateStyle(configuration.style);
    if (configuration.shank) ringConfig.updateShank(configuration.shank);
    if (configuration.metal) ringConfig.updateMetal(configuration.metal);
    if (configuration.shape) ringConfig.updateShape(configuration.shape);
    if (configuration.caratRange != null) ringConfig.updateCaratRange(configuration.caratRange);

    // Resolve stone when we have enough info (carat OR stoneType changed)
    const effectiveShape = configuration.shape || ringConfig.configuration.shape;
    const effectiveCarat = configuration.caratRange ?? ringConfig.configuration.caratRange;
    const effectiveStoneType = configuration.stoneType || null;
    const rawCarat: number | undefined = configuration.rawCarat ?? undefined;
    const preferredColor: string | undefined = configuration.color ?? undefined;
    const preferredClarity: string | undefined = configuration.clarity ?? undefined;

    let resolvedStone: ReturnType<typeof resolveDiamondFromPresets> = null;
    if (effectiveShape && (effectiveCarat != null || effectiveStoneType)) {
      resolvedStone = resolveDiamondFromPresets(
        diamondPresets,
        effectiveShape,
        effectiveCarat ?? 1,
        effectiveStoneType || undefined,
        { strictStoneType: !!effectiveStoneType, rawCarat, preferredColor, preferredClarity },
      );
      if (resolvedStone) ringConfig.updateStone(resolvedStone);
    }

    // Apply optional fields
    if (configuration.size) ringConfig.updateSize(configuration.size);
    if (configuration.engraving) {
      ringConfig.updateEngraving({
        enabled: true,
        text: String(configuration.engraving).slice(0, 20),
        bandWidth: '3mm',
        otherRequest: '',
      });
    }

    // Auto-navigate to the right step
    const updatedConfig = {
      ...ringConfig.configuration,
      style: configuration.style || ringConfig.configuration.style,
      shank: configuration.shank || ringConfig.configuration.shank,
      metal: configuration.metal || ringConfig.configuration.metal,
      shape: configuration.shape || ringConfig.configuration.shape,
      caratRange: configuration.caratRange ?? ringConfig.configuration.caratRange,
      stone: resolvedStone || ringConfig.configuration.stone,
    };
    const isEstimates = ringFlowPricingMode === 'estimates';
    const nextStep = getNextRelevantStep(updatedConfig, isEstimates);
    ringConfig.goToStep(nextStep);
  }, [ringConfig, diamondPresets, ringFlowPricingMode]);

  const handleAddToCart = async () => {
    if (isAddingToCart) return;
    if (!clientId) {
      toast({
        title: "Error",
        description: "Client information not found",
        variant: "destructive"
      });
      return;
    }

    // Basic validation (prevents backend calls that cannot succeed)
    const cfg = ringConfig.configuration as RingConfiguration;
    if (!cfg.style || !cfg.shank || !cfg.metal || !cfg.shape) {
      toast({
        title: "Complete your design",
        description: "Please select style, shank, metal, and shape before adding to cart.",
        variant: "destructive",
      });
      return;
    }

    // No-Deposit mode: there is no checkout. Collect the shopper's details and
    // record the enquiry as a lead instead of creating a Shopify cart.
    if (leadCapture) {
      setNoDepositFormOpen(true);
      return;
    }

    const safeRedirect = (url: string) => {
      // Prefer navigating the top window (so the parent page goes to cart),
      // but fall back safely in restrictive embed contexts.
      try {
        window.top!.location.href = url;
        return;
      } catch {
        // ignore cross-origin error
      }
      try {
        window.location.href = url;
        return;
      } catch {
        // ignore
      }
      // Last resort: open a new tab.
      window.open(url, "_blank", "noopener,noreferrer");
    };

    try {
      setIsAddingToCart(true);

      // Fire InitiateCheckout event
      trackMetaEvent('InitiateCheckout', { content_name: 'Ring Configurator' });
      
      const { data, error } = await supabase.functions.invoke('shopify-add-to-cart', {
        body: {
          clientId,
          ringConfiguration: ringConfig.configuration,
          estimatedPrice: ringConfig.calculatePrice(),
          quantity: 1
        }
      });

      if (error) {
        // Parse the error response to get the actual error message
        let errorMessage = "Failed to add ring to cart";
        try {
          if ('context' in error && error.context) {
            const errorBody = await (error.context as Response).json();
            errorMessage = errorBody.error || errorMessage;
          } else if (error.message) {
            errorMessage = error.message;
          }
        } catch {
          if (error.message) {
            errorMessage = error.message;
          }
        }
        console.error('[Add to Cart] Edge function error:', errorMessage);
        throw new Error(errorMessage);
      }

      // Redirect to Storefront API checkout URL — this is tied to the cart
      // created via the API and carries all line item attributes (ring/diamond details).
      // cartPermalinkUrl creates a new blank cart session and drops all attributes.
      if (data?.checkoutUrl) {
        toast({
          title: "Added to cart!",
          description: "Redirecting to checkout...",
        });
        safeRedirect(data.checkoutUrl);
        return;
      }

      // Fallback: cart permalink if no checkout URL
      if (data?.cartPermalinkUrl) {
        toast({
          title: "Added to cart!",
          description: "Redirecting to store cart...",
        });
        safeRedirect(data.cartPermalinkUrl);
        return;
      }
      
      if (data?.error) {
        throw new Error(data.error);
      }
      
      throw new Error('No cart URL returned');
    } catch (error) {
      console.error('Error adding to cart:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to add ring to cart",
        variant: "destructive"
      });
    } finally {
      setIsAddingToCart(false);
    }
  };

  // Removed handleCheckoutRedirect and handleViewOnStore - now redirecting directly in handleAddToCart

  // Show access denied if domain not authorized
  if (domainAuthorized === false) {
    return <AccessDenied reason="unauthorized_domain" message="This embed is not authorized for this domain." />;
  }

  // Show access denied if the RingOS module is disabled for this account.
  if (featureEnabled === false) {
    return billingBlocked
      ? <AccessDenied reason="billing_paused" />
      : <AccessDenied reason="unauthorized_domain" message="This widget is not enabled for this account." />;
  }

  if (loading || catalogOptions.loading || caratLoading || diamondLoading || availabilityLoading || domainAuthorized === null || featureEnabled === null) {
    const themeKey = currentTheme || 'luxury';
    const defaults = THEME_COLOR_DEFAULTS[themeKey] || THEME_COLOR_DEFAULTS.luxury;
    const themeColors = branding?.themeColors?.[themeKey] || {};
    const skelBg = themeColors.background || defaults.background;
    const skelText = themeColors.text || defaults.text;
    const skelAccent = themeColors.accent || defaults.accent;
    return <EmbedConfiguratorSkeleton background={skelBg} text={skelText} accent={skelAccent} />;
  }



  // No-Deposit lead form. Rendered inside the configuration panel (over the
  // step options), never as a modal — null in every other pricing mode.
  const noDepositForm = leadCapture && noDepositFormOpen ? (
    <NoDepositRequestForm
      onBack={() => setNoDepositFormOpen(false)}
      configuration={ringConfig.configuration}
      clientId={clientId || ''}
      estimatedPrice={ringConfig.calculatePrice()}
      currency={ringOsCurrency || branding?.currency || 'USD'}
      hideEstimate={hidePrices}
      catalogOptions={{
        styles: catalogOptions.styles.map(s => ({ id: s.id, name: s.name })),
        shanks: catalogOptions.shanks.map(s => ({ id: s.id, name: s.name })),
        metals: catalogOptions.metals.map(m => ({ id: m.id, name: m.name })),
        shapes: effectiveShapes.map(s => ({ id: s.id, name: s.name })),
        caratOptions: effectiveCaratOptions.map(c => ({ value: c.carat_value, displayName: c.display_name })),
      }}
    />
  ) : null;

  // 24k Carat Jewelers: exclusive full-width shell (replaces the standard
  // left/right split so the bottom action bar can span the entire embed).
  if (currentTheme === 'twentyfourk') {
    return (
      <WidgetThemeProvider theme={currentTheme} styleOverrides={themeStyleOverrides} colors={resolvedThemeColors}>
        <div
          ref={embedRootRef}
          id="jewlx-embed-root"
          className="bg-background overflow-hidden"
          data-theme={currentTheme}
          style={{ height: 'var(--embed-vh, 100dvh)', ...themeStyleOverrides } as React.CSSProperties}
        >
          <TwentyFourKShell
            clientId={clientId}
            ringConfig={ringConfig}
            onBookAppointment={() => setAppointmentDialogOpen(true)}
            onAIAssistant={() => setShowChatAssistant(true)}
            onCompare={() => setShowCompareDialog(true)}
            onSaveDesign={() => setSaveDesignDialogOpen(true)}
            onAddToCart={handleAddToCart}
            currency={ringOsCurrency || branding?.currency || 'USD'}
            showAIAssistant={showAIAssistantButton}
            showComparison={showComparisonButton}
            showSaveDesign={showSaveDesignButton}
            catalogOptions={{
              styles: catalogOptions.styles,
              shanks: catalogOptions.shanks,
              metals: catalogOptions.metals,
              shapes: effectiveShapes,
              caratOptions: effectiveCaratOptions,
              diamondPresets: diamondPresets,
              availableCaratBuckets,
            }}
            pricingMode={ringFlowPricingMode}
            depositAmount={widgetDepositAmount}
            stepOrder={(branding as any)?.stepOrder}
            clickToContinue={(branding as any)?.clickToContinue !== false}
            videoFirst={Boolean((branding as any)?.videoFirst)}
            panelOverlay={noDepositForm}
            hidePrices={hidePrices}
            leadCapture={leadCapture}
            ringSizeOnDetails={diamondTypeCheckout}
            hideNaturalPrices={diamondTypeCheckout}
          />
          <BookAppointmentDialog
            open={appointmentDialogOpen}
            onOpenChange={setAppointmentDialogOpen}
            clientId={clientId}
            ringConfiguration={ringConfig.configuration}
          />
          <SaveDesignDialog
            open={saveDesignDialogOpen}
            onOpenChange={setSaveDesignDialogOpen}
            configuration={ringConfig.configuration}
            clientId={clientId || ''}
            catalogOptions={{
              styles: catalogOptions.styles.map(s => ({ id: s.id, name: s.name, price: s.price })),
              shanks: catalogOptions.shanks.map(s => ({ id: s.id, name: s.name, price: s.price })),
              metals: catalogOptions.metals.map(m => ({ id: m.id, name: m.name, price: m.price })),
              shapes: effectiveShapes.map(s => ({ id: s.id, name: s.name })),
              caratOptions: effectiveCaratOptions.map(c => ({ value: c.carat_value, displayName: c.display_name, priceAdjustment: c.price_adjustment })),
            }}
          />
        </div>
      </WidgetThemeProvider>
    );
  }

  return (
    <WidgetThemeProvider theme={currentTheme} styleOverrides={themeStyleOverrides} colors={resolvedThemeColors}>
        
        <div 
          ref={embedRootRef}
          id="jewlx-embed-root" 
          className="bg-background flex flex-col md:flex-row overflow-hidden" 
          data-theme={currentTheme}
          data-tablet-fit={tabletFit ? 'true' : undefined}
          style={{ height: 'var(--embed-vh, 100dvh)', ...themeStyleOverrides } as React.CSSProperties}
          
        >
          {/* tabletFit: 50/50 split on tablets (md), standard 60/40 from lg up.
              Mobile: 50/50 stack by default; useAdaptiveViewerHeight (in the
              configuration panels) sets --ringos-viewer-h so the viewer gives
              up height to a crowded step. */}
          <div data-adaptive-viewer className={`w-full md:flex-1 h-[var(--ringos-viewer-h,50%)] md:h-full relative overflow-hidden flex-shrink-0 transition-[height] duration-300 ease-out md:transition-none ${
            tabletFit ? 'md:max-w-[50%] lg:max-w-[60%]' : 'md:max-w-[60%]'
          }`}>
            <ProductViewer configuration={ringConfig.configuration} calculatePrice={ringConfig.calculatePrice} isChatMode={showChatAssistant} videoFirst={Boolean((branding as any)?.videoFirst)} />
          </div>

          <div className={`w-full md:flex-1 h-[calc(100%_-_var(--ringos-viewer-h,50%))] md:h-full flex flex-col overflow-hidden relative transition-[height] duration-300 ease-out md:transition-none ${
            tabletFit ? 'md:max-w-[50%] lg:max-w-[40%]' : 'md:max-w-[40%]'
          }`}>
          {/* No-Deposit request form — takes over the options panel in place of
              the step content, leaving the ring viewer visible. */}
          {noDepositForm && (
            <div className="absolute inset-0 z-30">
              {noDepositForm}
            </div>
          )}
          {currentTheme === 'elegant' ? (
            <>
              <div className={showChatAssistant ? "hidden md:block h-full" : "h-full"}>
                <ElegantConfigurationPanel
                  clientId={clientId}
                  ringConfig={ringConfig}
                  onBookAppointment={() => setAppointmentDialogOpen(true)}
                  onAIAssistant={() => {
                    setShowChatAssistant(true);
                  }}
                  onCompare={() => setShowCompareDialog(true)}
                  onSaveDesign={() => setSaveDesignDialogOpen(true)}
                  onAddToCart={handleAddToCart}
                  currency={ringOsCurrency || branding?.currency || 'USD'}
                  showAIAssistant={showAIAssistantButton}
                  showComparison={showComparisonButton}
                  showSaveDesign={showSaveDesignButton}
                  catalogOptions={{
                    styles: catalogOptions.styles,
                    shanks: catalogOptions.shanks,
                    metals: catalogOptions.metals,
                    shapes: effectiveShapes,
                    caratOptions: effectiveCaratOptions,
                    diamondPresets: diamondPresets,
                    availableCaratBuckets,
                  }}
                  pricingMode={widgetPricingMode}
                  depositAmount={widgetDepositAmount}
                  stepOrder={(branding as any)?.stepOrder}
                  clickToContinue={(branding as any)?.clickToContinue !== false}
                  tabletFit={tabletFit}
                  completionStepEmphasis={clientOverrides.completionStepEmphasis}
                  uniformStepSpacing={clientOverrides.uniformStepSpacing}
                />
              </div>

              {showChatAssistant && (
                <div className="h-full w-full md:hidden bg-background overflow-hidden">
                  <ChatAssistant
                    onClose={() => {
                      setShowChatAssistant(false);
                      const cfg = ringConfig.configuration;
                      if (cfg.style && cfg.shank && cfg.metal && cfg.shape) {
                        const isEst = widgetPricingMode === 'estimates';
                        const next = getNextRelevantStep(cfg, isEst);
                        ringConfig.goToStep(next);
                      }
                    }}
                    onApplyConfiguration={handleApplyAIConfiguration}
                    clientId={clientId}
                    storeName={storeName || undefined}
                    currentConfiguration={ringConfig.configuration}
                    onUpdateStyle={ringConfig.updateStyle}
                    onUpdateShank={ringConfig.updateShank}
                    onUpdateMetal={ringConfig.updateMetal}
                    onUpdateShape={ringConfig.updateShape}
                    onUpdateCarat={ringConfig.updateCaratRange}
                    catalogOptions={{
                      styles: catalogOptions.styles.map(s => ({ id: s.id, name: s.name, price: s.price })),
                      shanks: catalogOptions.shanks.map(s => ({ id: s.id, name: s.name, price: s.price })),
                      metals: catalogOptions.metals.map(m => ({ id: m.id, name: m.name, price: m.price })),
                      shapes: effectiveShapes.map(s => ({ id: s.id, name: s.name })),
                      caratOptions: effectiveCaratOptions.map(c => ({ value: c.carat_value, displayName: c.display_name, priceAdjustment: c.price_adjustment })),
                      diamondPresets: diamondPresets,
                    }}
                    onBookAppointment={() => setAppointmentDialogOpen(true)}
                    onSaveDesign={() => setSaveDesignDialogOpen(true)}
                    onAddToCart={handleAddToCart}
                    onUpdateSize={ringConfig.updateSize}
                    onUpdateEngraving={ringConfig.updateEngraving}
                    currency={ringOsCurrency || branding?.currency || 'USD'}
                    onResetConfiguration={ringConfig.resetConfiguration}
                    pricingMode={pricingMode}
                  />
                </div>
              )}

              {showChatAssistant && (
                <div className="absolute inset-0 z-20 bg-background overflow-hidden hidden md:block">
                  <ChatAssistant
                    onClose={() => {
                      setShowChatAssistant(false);
                      const cfg = ringConfig.configuration;
                      if (cfg.style && cfg.shank && cfg.metal && cfg.shape) {
                        const isEst = widgetPricingMode === 'estimates';
                        const next = getNextRelevantStep(cfg, isEst);
                        ringConfig.goToStep(next);
                      }
                    }}
                    onApplyConfiguration={handleApplyAIConfiguration}
                    clientId={clientId}
                    storeName={storeName || undefined}
                    currentConfiguration={ringConfig.configuration}
                    onUpdateStyle={ringConfig.updateStyle}
                    onUpdateShank={ringConfig.updateShank}
                    onUpdateMetal={ringConfig.updateMetal}
                    onUpdateShape={ringConfig.updateShape}
                    onUpdateCarat={ringConfig.updateCaratRange}
                    catalogOptions={{
                      styles: catalogOptions.styles.map(s => ({ id: s.id, name: s.name, price: s.price })),
                      shanks: catalogOptions.shanks.map(s => ({ id: s.id, name: s.name, price: s.price })),
                      metals: catalogOptions.metals.map(m => ({ id: m.id, name: m.name, price: m.price })),
                      shapes: effectiveShapes.map(s => ({ id: s.id, name: s.name })),
                      caratOptions: effectiveCaratOptions.map(c => ({ value: c.carat_value, displayName: c.display_name, priceAdjustment: c.price_adjustment })),
                      diamondPresets: diamondPresets,
                    }}
                    onBookAppointment={() => setAppointmentDialogOpen(true)}
                    onSaveDesign={() => setSaveDesignDialogOpen(true)}
                    onAddToCart={handleAddToCart}
                    onUpdateSize={ringConfig.updateSize}
                    onUpdateEngraving={ringConfig.updateEngraving}
                    currency={ringOsCurrency || branding?.currency || 'USD'}
                    onResetConfiguration={ringConfig.resetConfiguration}
                    pricingMode={pricingMode}
                  />
                </div>
              )}
            </>
          ) : currentTheme === 'chat' ? (
            /* Chat-First theme: ChatAssistant IS the right panel */
            <div className="h-full w-full bg-background overflow-hidden">
              <ChatAssistant 
                onClose={undefined} 
                onApplyConfiguration={handleApplyAIConfiguration} 
                clientId={clientId}
                storeName={storeName || undefined}
                currentConfiguration={ringConfig.configuration}
                onUpdateStyle={ringConfig.updateStyle}
                onUpdateShank={ringConfig.updateShank}
                onUpdateMetal={ringConfig.updateMetal}
                onUpdateShape={ringConfig.updateShape}
                onUpdateCarat={ringConfig.updateCaratRange}
                catalogOptions={{
                  styles: catalogOptions.styles.map(s => ({ id: s.id, name: s.name, price: s.price })),
                  shanks: catalogOptions.shanks.map(s => ({ id: s.id, name: s.name, price: s.price })),
                  metals: catalogOptions.metals.map(m => ({ id: m.id, name: m.name, price: m.price })),
                  shapes: effectiveShapes.map(s => ({ id: s.id, name: s.name })),
                  caratOptions: effectiveCaratOptions.map(c => ({ value: c.carat_value, displayName: c.display_name, priceAdjustment: c.price_adjustment })),
                  diamondPresets: diamondPresets,
                }}
                isChatTheme
                onBookAppointment={() => setAppointmentDialogOpen(true)}
                onSaveDesign={() => setSaveDesignDialogOpen(true)}
                onAddToCart={handleAddToCart}
                onUpdateSize={ringConfig.updateSize}
                onUpdateEngraving={ringConfig.updateEngraving}
                currency={ringOsCurrency || branding?.currency || 'USD'}
                onResetConfiguration={ringConfig.resetConfiguration}
                pricingMode={pricingMode}
              />
            </div>
          ) : (
            <>
              <div className={showChatAssistant ? "hidden md:block h-full" : "h-full"}>
                <ConfigurationPanel 
                  clientId={clientId}
                  ringConfig={ringConfig}
                  onBookAppointment={() => setAppointmentDialogOpen(true)}
                  onAIAssistant={() => {
                    setShowChatAssistant(true);
                  }}
                  onCompare={() => setShowCompareDialog(true)}
                  onSaveDesign={() => setSaveDesignDialogOpen(true)}
                  onAddToCart={handleAddToCart}
                  currency={ringOsCurrency || branding?.currency || 'USD'}
                  showAIAssistant={showAIAssistantButton}
                  showComparison={showComparisonButton}
                  showSaveDesign={showSaveDesignButton}
                  catalogOptions={{
                    styles: catalogOptions.styles,
                    shanks: catalogOptions.shanks,
                    metals: catalogOptions.metals,
                    shapes: effectiveShapes,
                    caratOptions: effectiveCaratOptions,
                    diamondPresets: diamondPresets,
                    availableCaratBuckets,
                  }}
                  pricingMode={widgetPricingMode}
                  depositAmount={widgetDepositAmount}
                  stepOrder={(branding as any)?.stepOrder}
                  clickToContinue={(branding as any)?.clickToContinue !== false}
                />
              </div>

              {showChatAssistant && (
                <div className="h-full w-full md:hidden bg-background overflow-hidden">
                  <ChatAssistant 
                    onClose={() => {
                      setShowChatAssistant(false);
                      const cfg = ringConfig.configuration;
                      if (cfg.style && cfg.shank && cfg.metal && cfg.shape) {
                        const isEst = widgetPricingMode === 'estimates';
                        const next = getNextRelevantStep(cfg, isEst);
                        ringConfig.goToStep(next);
                      }
                    }}
                    onApplyConfiguration={handleApplyAIConfiguration} 
                    clientId={clientId}
                    storeName={storeName || undefined}
                    currentConfiguration={ringConfig.configuration}
                    onUpdateStyle={ringConfig.updateStyle}
                    onUpdateShank={ringConfig.updateShank}
                    onUpdateMetal={ringConfig.updateMetal}
                    onUpdateShape={ringConfig.updateShape}
                    onUpdateCarat={ringConfig.updateCaratRange}
                    catalogOptions={{
                      styles: catalogOptions.styles.map(s => ({ id: s.id, name: s.name, price: s.price })),
                      shanks: catalogOptions.shanks.map(s => ({ id: s.id, name: s.name, price: s.price })),
                      metals: catalogOptions.metals.map(m => ({ id: m.id, name: m.name, price: m.price })),
                      shapes: effectiveShapes.map(s => ({ id: s.id, name: s.name })),
                      caratOptions: effectiveCaratOptions.map(c => ({ value: c.carat_value, displayName: c.display_name, priceAdjustment: c.price_adjustment })),
                      diamondPresets: diamondPresets,
                    }}
                    onBookAppointment={() => setAppointmentDialogOpen(true)}
                    onSaveDesign={() => setSaveDesignDialogOpen(true)}
                    onAddToCart={handleAddToCart}
                    onUpdateSize={ringConfig.updateSize}
                    onUpdateEngraving={ringConfig.updateEngraving}
                    currency={ringOsCurrency || branding?.currency || 'USD'}
                     onResetConfiguration={ringConfig.resetConfiguration}
                    pricingMode={pricingMode}
                  />
                </div>
              )}
              
              {showChatAssistant && (
                <div className="absolute inset-0 bg-background overflow-hidden hidden md:block">
                  <ChatAssistant 
                    onClose={() => {
                      setShowChatAssistant(false);
                      const cfg = ringConfig.configuration;
                      if (cfg.style && cfg.shank && cfg.metal && cfg.shape) {
                        const isEst = widgetPricingMode === 'estimates';
                        const next = getNextRelevantStep(cfg, isEst);
                        ringConfig.goToStep(next);
                      }
                    }}
                    onApplyConfiguration={handleApplyAIConfiguration} 
                    clientId={clientId}
                    storeName={storeName || undefined}
                    currentConfiguration={ringConfig.configuration}
                    onUpdateStyle={ringConfig.updateStyle}
                    onUpdateShank={ringConfig.updateShank}
                    onUpdateMetal={ringConfig.updateMetal}
                    onUpdateShape={ringConfig.updateShape}
                    onUpdateCarat={ringConfig.updateCaratRange}
                    catalogOptions={{
                      styles: catalogOptions.styles.map(s => ({ id: s.id, name: s.name, price: s.price })),
                      shanks: catalogOptions.shanks.map(s => ({ id: s.id, name: s.name, price: s.price })),
                      metals: catalogOptions.metals.map(m => ({ id: m.id, name: m.name, price: m.price })),
                      shapes: effectiveShapes.map(s => ({ id: s.id, name: s.name })),
                      caratOptions: effectiveCaratOptions.map(c => ({ value: c.carat_value, displayName: c.display_name, priceAdjustment: c.price_adjustment })),
                      diamondPresets: diamondPresets,
                    }}
                    onBookAppointment={() => setAppointmentDialogOpen(true)}
                    onSaveDesign={() => setSaveDesignDialogOpen(true)}
                    onAddToCart={handleAddToCart}
                    onUpdateSize={ringConfig.updateSize}
                    onUpdateEngraving={ringConfig.updateEngraving}
                    currency={ringOsCurrency || branding?.currency || 'USD'}
                    onResetConfiguration={ringConfig.resetConfiguration}
                    pricingMode={pricingMode}
                  />
                </div>
              )}
            </>
          )}
        </div>

        <BookAppointmentDialog open={appointmentDialogOpen} onOpenChange={setAppointmentDialogOpen} clientId={clientId} ringConfiguration={ringConfig.configuration} />
        <CompareDialog open={showCompareDialog} onOpenChange={setShowCompareDialog} currentConfiguration={ringConfig.configuration} calculatePrice={ringConfig.calculatePrice} />
        <SaveDesignDialog 
          open={saveDesignDialogOpen} 
          onOpenChange={setSaveDesignDialogOpen} 
          configuration={ringConfig.configuration} 
          clientId={clientId || ''} 
          catalogOptions={{
            styles: catalogOptions.styles.map(s => ({ id: s.id, name: s.name, price: s.price })),
            shanks: catalogOptions.shanks.map(s => ({ id: s.id, name: s.name, price: s.price })),
            metals: catalogOptions.metals.map(m => ({ id: m.id, name: m.name, price: m.price })),
            shapes: effectiveShapes.map(s => ({ id: s.id, name: s.name })),
            caratOptions: effectiveCaratOptions.map(c => ({ value: c.carat_value, displayName: c.display_name, priceAdjustment: c.price_adjustment })),
          }}
        />
        </div>
    </WidgetThemeProvider>
  );
}
