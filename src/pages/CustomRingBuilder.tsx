import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { ProductViewer } from '@/components/ring-builder/ProductViewer';
import { ConfigurationPanel } from '@/components/ring-builder/ConfigurationPanel';
import { BookAppointmentDialog } from '@/components/ring-builder/BookAppointmentDialog';
import { ChatAssistant } from '@/components/ring-builder/ChatAssistant';
import { CompareDialog } from '@/components/ring-builder/CompareDialog';
import { useRingConfiguration } from '@/hooks/useRingConfiguration';
import { useClientCatalogOptions } from '@/hooks/useClientCatalogOptions';
import { useClientCaratOptions } from '@/hooks/useClientCaratOptions';
import { useClientDiamondPresets } from '@/hooks/useClientDiamondPresets';
import { useToast } from '@/hooks/use-toast';
import { RingConfiguration } from '@/types/ring-builder';
import { resolveDiamondFromPresets, getNextRelevantStep } from '@/lib/ring-config-helpers';
import { supabase } from '@/integrations/supabase/client';
import { Gem } from 'lucide-react';
import { trackRingView } from '@/lib/tracking-utils';
import { applyThemeColors } from '@/lib/apply-theme-colors';
import { hexToHSL } from '@/lib/embed-utils';

const CustomRingBuilder = () => {
  const [appointmentDialogOpen, setAppointmentDialogOpen] = useState(false);
  const [showChatAssistant, setShowChatAssistant] = useState(false);
  const [showCompareDialog, setShowCompareDialog] = useState(false);
  const [branding, setBranding] = useState<any>(null);
  const [clientId, setClientId] = useState<string | null>(null);
  const [storeName, setStoreName] = useState<string | null>(null);
  const [isCelebrating, setIsCelebrating] = useState(false);
  const [frozenConfiguration, setFrozenConfiguration] = useState<RingConfiguration | null>(null);
  const [searchParams] = useSearchParams();
  const catalogOptions = useClientCatalogOptions(clientId);
  const { caratOptions } = useClientCaratOptions(clientId);
  const { diamondPresets } = useClientDiamondPresets(clientId);
  const ringConfig = useRingConfiguration({
    styles: catalogOptions.styles,
    shanks: catalogOptions.shanks,
    metals: catalogOptions.metals,
    caratOptions: caratOptions,
  });
  const { toast } = useToast();

  const snapshotConfiguration = useCallback((config: RingConfiguration): RingConfiguration => {
    return {
      ...config,
      engraving: {
        enabled: config.engraving?.enabled ?? false,
        text: config.engraving?.text ?? '',
        bandWidth: config.engraving?.bandWidth ?? '3mm',
        otherRequest: config.engraving?.otherRequest ?? '',
      },
      stone: config.stone ? { ...config.stone } : null,
    };
  }, []);

  // Load branding configuration from client
  useEffect(() => {
    const clientIdParam = searchParams.get('clientId');
    if (clientIdParam) {
      setClientId(clientIdParam);
      loadBranding(clientIdParam);
    }
  }, [searchParams]);

  const loadBranding = async (clientId: string) => {
    try {
      const { data, error } = await supabase
        .from('clients')
        .select('branding_config, company_name, logo_url')
        .eq('id', clientId)
        .maybeSingle();
      
      if (error) throw error;
      
      if (data && data.branding_config) {
        setBranding(data.branding_config);
        if (data.company_name) setStoreName(data.company_name);

        // C3: hexToHSL is a tiny pure function — import statically so we don't
        // pay a dynamic-import / parse cost on every theme apply, and batch all
        // CSS variable writes into a single style mutation to avoid layout
        // thrashing + FOUC.
        const config = data.branding_config as any;
        const cssVars: Record<string, string> = {};
        if (config.primaryColor) {
          const hsl = hexToHSL(config.primaryColor);
          const lightness = parseInt(hsl.split('%')[0].split(' ').pop() || '50');
          cssVars['--client-accent'] = hsl;
          cssVars['--client-accent-foreground'] = lightness > 55 ? '0 0% 0%' : '0 0% 100%';
          cssVars['--client-subtle'] = hsl;
        }
        if (config.secondaryColor) {
          cssVars['--client-secondary'] = hexToHSL(config.secondaryColor);
        }
        const root = document.documentElement;
        for (const [name, value] of Object.entries(cssVars)) {
          root.style.setProperty(name, value);
        }
        // Apply per-theme custom colors
        if (config.themeColors) {
          const themeKey = (data as any).widget_theme || 'luxury';
          if (config.themeColors[themeKey]) {
            applyThemeColors(config.themeColors[themeKey]);
          }
        }
      }
    } catch (error) {
      console.error('Failed to load branding:', error);
    }
  };

  // Track configuration views
  useEffect(() => {
    if (clientId && ringConfig.configuration) {
      const timer = setTimeout(() => {
        trackRingView(clientId, ringConfig.configuration);
      }, 2000); // Debounce tracking
      return () => clearTimeout(timer);
    }
  }, [clientId, ringConfig.configuration]);
  useEffect(() => {
    const configParam = searchParams.get('config');
    if (configParam) {
      try {
        const config: RingConfiguration = JSON.parse(atob(configParam));
        // Apply configuration
        if (config.style) ringConfig.updateStyle(config.style);
        if (config.shank) ringConfig.updateShank(config.shank);
        if (config.metal) ringConfig.updateMetal(config.metal);
        if (config.shape) ringConfig.updateShape(config.shape);
        if (config.caratRange) ringConfig.updateCaratRange(config.caratRange);
        if (config.stone) ringConfig.updateStone(config.stone);
        if (config.engraving) ringConfig.updateEngraving({
          enabled: config.engraving.enabled,
          text: config.engraving.text,
          bandWidth: config.engraving.bandWidth || '3mm',
          otherRequest: config.engraving.otherRequest || ''
        });
        if (config.size) ringConfig.updateSize(config.size);
        
        toast({
          title: "Design loaded!",
          description: "Shared design has been loaded into the builder"
        });
      } catch (error) {
        console.error('Failed to load shared config:', error);
      }
    }
  }, []);

  const handleApplyAIConfiguration = useCallback((configuration: any) => {
    // If the user has completed a design and we're in the post-celebration freeze window,
    // do NOT apply background AI updates that would drift the live configuration.
    if (frozenConfiguration || isCelebrating) return;

    // Apply all recommendations to the configuration
    if (configuration.style) ringConfig.updateStyle(configuration.style);
    if (configuration.shank) ringConfig.updateShank(configuration.shank);
    if (configuration.metal) ringConfig.updateMetal(configuration.metal);
    if (configuration.shape) ringConfig.updateShape(configuration.shape);
    if (configuration.caratRange != null) ringConfig.updateCaratRange(configuration.caratRange);

    // Resolve stone — lab-safe: only enforce stone type when explicitly provided
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

    // Navigate to the first missing step instead of always step 0
    const updatedConfig = {
      ...ringConfig.configuration,
      style: configuration.style || ringConfig.configuration.style,
      shank: configuration.shank || ringConfig.configuration.shank,
      metal: configuration.metal || ringConfig.configuration.metal,
      shape: configuration.shape || ringConfig.configuration.shape,
      caratRange: configuration.caratRange ?? ringConfig.configuration.caratRange,
      stone: resolvedStone || ringConfig.configuration.stone,
    };
    const nextStep = getNextRelevantStep(updatedConfig, false);
    ringConfig.goToStep(nextStep);
  }, [frozenConfiguration, isCelebrating, ringConfig, diamondPresets]);

  // Handle celebration state changes - freeze configuration when celebration starts
  const handleCelebrationChange = (celebrating: boolean) => {
    setIsCelebrating(celebrating);
    if (celebrating) {
      // Freeze the configuration at the moment celebration starts
      setFrozenConfiguration(snapshotConfiguration(ringConfig.configuration));
    }
    // Don't clear on celebration end - keep showing the frozen config until user makes new changes
  };

  // Clear frozen configuration when user makes new selections
  const clearFrozenConfiguration = useCallback(() => {
    setFrozenConfiguration(null);
  }, []);

  // Wrap ringConfig so *any* manual UI selection clears the frozen state first.
  // This ensures the product viewer only updates when the user explicitly changes something.
  const ringConfigWithFreezeAwareness = useMemo(() => {
    return {
      ...ringConfig,
      updateStyle: (style: any) => {
        clearFrozenConfiguration();
        ringConfig.updateStyle(style);
      },
      updateShank: (shank: any) => {
        clearFrozenConfiguration();
        ringConfig.updateShank(shank);
      },
      updateMetal: (metal: any) => {
        clearFrozenConfiguration();
        ringConfig.updateMetal(metal);
      },
      updateShape: (shape: any) => {
        clearFrozenConfiguration();
        ringConfig.updateShape(shape);
      },
      updateCaratRange: (carat: any) => {
        clearFrozenConfiguration();
        ringConfig.updateCaratRange(carat);
      },
      updateStone: (stone: any) => {
        clearFrozenConfiguration();
        ringConfig.updateStone(stone);
      },
      updateEngraving: (data: any) => {
        clearFrozenConfiguration();
        ringConfig.updateEngraving(data);
      },
      updateSize: (size: any) => {
        clearFrozenConfiguration();
        ringConfig.updateSize(size);
      },
      resetConfiguration: () => {
        clearFrozenConfiguration();
        ringConfig.resetConfiguration();
      },
    };
  }, [ringConfig, clearFrozenConfiguration]);

  return (
    <div className="min-h-screen flex flex-col relative">
      <Header />
      
      <main className="flex-1 pt-16 md:pt-20">
        <div className="flex flex-col lg:grid lg:grid-cols-2 lg:gap-4 xl:gap-6 h-[calc(100vh-64px)] md:h-[calc(100vh-80px)]">
          <div className="h-[40vh] lg:h-full">
            <ProductViewer 
              configuration={ringConfig.configuration}
              calculatePrice={ringConfig.calculatePrice}
              isChatMode={showChatAssistant}
              isCelebrating={isCelebrating}
              frozenConfiguration={frozenConfiguration}
            />
          </div>
          <div className="h-[60vh] lg:h-full overflow-hidden relative">
            {/*
              Mobile: when AI Agent is open, dock it inline here (directly under the image) and
              hide the configuration/options panel.
              Desktop: keep the configuration panel visible; AI Agent floats as an overlay.
            */}
            <div className={showChatAssistant ? "hidden lg:block h-full" : "h-full"}>
              <ConfigurationPanel 
                ringConfig={ringConfigWithFreezeAwareness}
                onBookAppointment={() => setAppointmentDialogOpen(true)}
                onAIAssistant={() => {
                  clearFrozenConfiguration();
                  setShowChatAssistant(true);
                }}
                onCompare={() => setShowCompareDialog(true)}
                onSaveDesign={() => {}}
                onAddToCart={() => {}}
              />
            </div>

            {showChatAssistant && (
              <div className="h-full w-full lg:hidden bg-background overflow-hidden">
                <ChatAssistant 
                  onApplyConfiguration={handleApplyAIConfiguration}
                  onClose={() => {
                    setShowChatAssistant(false);
                    const cfg = ringConfig.configuration;
                    if (cfg.style && cfg.shank && cfg.metal && cfg.shape) {
                      ringConfig.goToStep(8);
                    }
                  }}
                   clientId={clientId || undefined}
                   storeName={storeName || undefined}
                  currentConfiguration={ringConfig.configuration}
                  onUpdateStyle={(style, meta?) => {
                    if (meta?.source === 'user') clearFrozenConfiguration();
                    ringConfig.updateStyle(style);
                  }}
                  onUpdateShank={(shank, meta?) => {
                    if (meta?.source === 'user') clearFrozenConfiguration();
                    ringConfig.updateShank(shank);
                  }}
                  onUpdateMetal={(metal, meta?) => {
                    if (meta?.source === 'user') clearFrozenConfiguration();
                    ringConfig.updateMetal(metal);
                  }}
                  onUpdateShape={(shape, meta?) => {
                    if (meta?.source === 'user') clearFrozenConfiguration();
                    ringConfig.updateShape(shape);
                  }}
                  onUpdateCarat={(carat, meta?) => {
                    if (meta?.source === 'user') clearFrozenConfiguration();
                    ringConfig.updateCaratRange(carat);
                  }}
                   onCelebrationChange={handleCelebrationChange}
                   catalogOptions={{
                     styles: catalogOptions.styles.map(s => ({ id: s.id, name: s.name, price: s.price })),
                     shanks: catalogOptions.shanks.map(s => ({ id: s.id, name: s.name, price: s.price })),
                     metals: catalogOptions.metals.map(m => ({ id: m.id, name: m.name, price: m.price })),
                     shapes: catalogOptions.shapes.map(s => ({ id: s.id, name: s.name })),
                     caratOptions: caratOptions.map(c => ({ value: c.carat_value, displayName: c.display_name, priceAdjustment: c.price_adjustment })),
                     diamondPresets,
                   }}
                   onUpdateSize={ringConfig.updateSize}
                   onUpdateEngraving={ringConfig.updateEngraving}
                   onResetConfiguration={ringConfigWithFreezeAwareness.resetConfiguration}
                />
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Desktop-only: ChatAssistant takes the full right column */}
      {showChatAssistant && (
        <div className="fixed z-50 top-16 md:top-20 right-0 w-1/2 h-[calc(100vh-64px)] md:h-[calc(100vh-80px)] overflow-hidden bg-background border-l border-border hidden lg:block">
          <ChatAssistant 
            onApplyConfiguration={handleApplyAIConfiguration}
            onClose={() => {
              setShowChatAssistant(false);
              const cfg = ringConfig.configuration;
              if (cfg.style && cfg.shank && cfg.metal && cfg.shape) {
                ringConfig.goToStep(8);
              }
            }}
            clientId={clientId || undefined}
            storeName={storeName || undefined}
            currentConfiguration={ringConfig.configuration}
            onUpdateStyle={(style, meta?) => {
              if (meta?.source === 'user') clearFrozenConfiguration();
              ringConfig.updateStyle(style);
            }}
            onUpdateShank={(shank, meta?) => {
              if (meta?.source === 'user') clearFrozenConfiguration();
              ringConfig.updateShank(shank);
            }}
            onUpdateMetal={(metal, meta?) => {
              if (meta?.source === 'user') clearFrozenConfiguration();
              ringConfig.updateMetal(metal);
            }}
            onUpdateShape={(shape, meta?) => {
              if (meta?.source === 'user') clearFrozenConfiguration();
              ringConfig.updateShape(shape);
            }}
            onUpdateCarat={(carat, meta?) => {
              if (meta?.source === 'user') clearFrozenConfiguration();
              ringConfig.updateCaratRange(carat);
            }}
            onCelebrationChange={handleCelebrationChange}
            catalogOptions={{
              styles: catalogOptions.styles.map(s => ({ id: s.id, name: s.name, price: s.price })),
              shanks: catalogOptions.shanks.map(s => ({ id: s.id, name: s.name, price: s.price })),
              metals: catalogOptions.metals.map(m => ({ id: m.id, name: m.name, price: m.price })),
              shapes: catalogOptions.shapes.map(s => ({ id: s.id, name: s.name })),
              caratOptions: caratOptions.map(c => ({ value: c.carat_value, displayName: c.display_name, priceAdjustment: c.price_adjustment })),
              diamondPresets,
            }}
            onUpdateSize={ringConfig.updateSize}
            onUpdateEngraving={ringConfig.updateEngraving}
            onResetConfiguration={ringConfigWithFreezeAwareness.resetConfiguration}
          />
        </div>
      )}


      <BookAppointmentDialog
        open={appointmentDialogOpen}
        onOpenChange={setAppointmentDialogOpen}
        clientId={clientId || undefined}
        ringConfiguration={ringConfig.configuration}
      />

      <CompareDialog
        open={showCompareDialog}
        onOpenChange={setShowCompareDialog}
        currentConfiguration={ringConfig.configuration}
        calculatePrice={ringConfig.calculatePrice}
      />
    </div>
  );
};

export default CustomRingBuilder;
