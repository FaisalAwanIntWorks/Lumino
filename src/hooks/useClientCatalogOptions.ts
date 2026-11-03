import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { StyleOption, ShankOption, MetalOption, ShapeOption } from '@/types/ring-builder';
import {
  RING_OS_DEFAULT_STYLES,
  RING_OS_DEFAULT_SHANKS,
  RING_OS_DEFAULT_METALS,
  RING_OS_DEFAULT_SHAPES,
  RING_OS_DEFAULT_STYLE_PRICES,
  RING_OS_DEFAULT_SHANK_PRICES,
} from '@/lib/ring-os-defaults';

interface ClientCatalogOptions {
  styles: StyleOption[];
  shanks: ShankOption[];
  metals: MetalOption[];
  shapes: ShapeOption[];
  loading: boolean;
  error: string | null;
}

// Default mock data as fallback (single source of truth in ring-os-defaults.ts)
const DEFAULT_STYLES: StyleOption[] = RING_OS_DEFAULT_STYLES;
const DEFAULT_SHANKS: ShankOption[] = RING_OS_DEFAULT_SHANKS;
const DEFAULT_METALS: MetalOption[] = RING_OS_DEFAULT_METALS;
const DEFAULT_SHAPES: ShapeOption[] = RING_OS_DEFAULT_SHAPES;

// Style display names lookup
const STYLE_NAMES: Record<string, string> = {
  'solitaire': 'Solitaire',
  'three-stone': 'Three Stone',
  'halo': 'Halo',
  'pave-rail': 'Pavé Rail',
};

// Style descriptions lookup
const STYLE_DESCRIPTIONS: Record<string, string> = {
  'solitaire': 'Classic single stone setting',
  'three-stone': 'Past, present, and future',
  'halo': 'Center stone surrounded by smaller diamonds',
  'pave-rail': 'Diamonds set along the band',
};

// Default base prices for styles (used when no client override or override is $0)
const DEFAULT_STYLE_PRICES: Record<string, number> = RING_OS_DEFAULT_STYLE_PRICES;

// Shank display names lookup
const SHANK_NAMES: Record<string, string> = {
  'high-polish': 'High Polish',
  'castel-pave': 'Castel Pavé',
  '3-row-pave': '3 Row Pavé',
  'tapered': 'Tapered',
  'eternity': 'Eternity',
  'marquise-cut': 'Marquise Cut',
};

const VALID_SHANK_IDS = new Set(Object.keys(SHANK_NAMES));

// Default base prices for shanks (used when no client override or override is $0)
const DEFAULT_SHANK_PRICES: Record<string, number> = RING_OS_DEFAULT_SHANK_PRICES;

// Shank descriptions lookup
const SHANK_DESCRIPTIONS: Record<string, string> = {
  'high-polish': 'Smooth, reflective finish',
  'castel-pave': 'Castle-style pavé setting',
  '3-row-pave': 'Three rows of pavé diamonds',
  'tapered': 'Tapered shank style',
  'eternity': 'Eternity shank style',
  'marquise-cut': 'Marquise cut shank style',
};

// Color mapping for metal color families
const COLOR_FAMILY_COLORS: Record<string, string> = {
  'yellow': '#FFD700',
  'rose': '#E0BFB8',
  'white': '#E8E8E8',
  'platinum': '#C0C0C0',
  'silver': '#B8B8B8',
};

export const useClientCatalogOptions = (clientId: string | null | undefined): ClientCatalogOptions => {
  const [options, setOptions] = useState<ClientCatalogOptions>({
    styles: DEFAULT_STYLES,
    shanks: DEFAULT_SHANKS,
    metals: DEFAULT_METALS,
    shapes: DEFAULT_SHAPES,
    loading: true,
    error: null,
  });

  useEffect(() => {
    const fetchClientOptions = async () => {
      if (!clientId) {
        setOptions(prev => ({ ...prev, loading: false }));
        return;
      }

      try {
        // Fetch client onboarding preferences (styles, shanks, shapes)
        const { data: prefsData, error: prefsError } = await supabase
          .from('client_onboarding_preferences')
          .select('selected_styles, selected_shanks, selected_shapes')
          .eq('client_id', clientId)
          .single();

        // Fetch client metal variants
        const { data: metalData, error: metalError } = await supabase
          .from('client_metal_variants')
          .select('*')
          .eq('client_id', clientId)
          .order('display_order');

        // Fetch client option prices
        const { data: pricesData } = await supabase
          .from('client_option_prices')
          .select('*')
          .eq('client_id', clientId);

        // Build prices lookup
        const priceLookup: Record<string, Record<string, number>> = {};
        if (pricesData) {
          pricesData.forEach((item) => {
            if (!priceLookup[item.option_type]) {
              priceLookup[item.option_type] = {};
            }
            priceLookup[item.option_type][item.option_id] = Number(item.price);
          });
        }

        // If client has preferences, use them; otherwise fall back to defaults
        let styles = DEFAULT_STYLES;
        let shanks = DEFAULT_SHANKS;
        let shapes = DEFAULT_SHAPES;
        let metals = DEFAULT_METALS;

        if (prefsData) {
          // Build styles from preferences with prices from client_option_prices
          // Note: option_type in DB is 'styles' (plural)
          if (prefsData.selected_styles && prefsData.selected_styles.length > 0) {
            styles = prefsData.selected_styles.map((id: string) => {
              const clientPrice = priceLookup['styles']?.[id];
              const price = (clientPrice && clientPrice > 0) ? clientPrice : (DEFAULT_STYLE_PRICES[id] ?? 0);
              return {
                id,
                name: STYLE_NAMES[id] || id.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
                description: STYLE_DESCRIPTIONS[id] || '',
                price,
              };
            });
          }

          // Build shanks from preferences with prices from client_option_prices
          // Note: option_type in DB is 'shanks' (plural)
          if (prefsData.selected_shanks && prefsData.selected_shanks.length > 0) {
            const selectedShankIds = Array.from(
              new Set(
                prefsData.selected_shanks.filter((id: string) => VALID_SHANK_IDS.has(id))
              )
            );

            if (selectedShankIds.length > 0) {
              shanks = selectedShankIds.map((id: string) => {
              const clientPrice = priceLookup['shanks']?.[id];
              // For shanks, $0 is valid (e.g. High Polish), so only fall back if no override exists
              const price = (clientPrice !== undefined && clientPrice !== null) ? clientPrice : (DEFAULT_SHANK_PRICES[id] ?? 0);
              return {
                id,
                name: SHANK_NAMES[id] || id.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
                description: SHANK_DESCRIPTIONS[id] || '',
                price,
              };
              });
            }
          }

          // Build shapes from preferences
          if (prefsData.selected_shapes && prefsData.selected_shapes.length > 0) {
            shapes = prefsData.selected_shapes.map((id: string) => ({
              id,
              name: id.charAt(0).toUpperCase() + id.slice(1),
            }));
          }
        }

        // Build metals from client_metal_variants
        // Use a slug derived from variant_name as the ID (not the UUID)
        if (metalData && metalData.length > 0) {
          metals = metalData.map((variant) => ({
            id: variant.variant_name.toLowerCase().replace(/\s+/g, '-'),
            name: variant.variant_name,
            color: COLOR_FAMILY_COLORS[variant.color_family] || '#C0C0C0',
            price: Number(variant.price),
            colorFamily: variant.color_family,
          }));
        }

        setOptions({
          styles,
          shanks,
          metals,
          shapes,
          loading: false,
          error: null,
        });
      } catch (error: any) {
        console.error('Error fetching client catalog options:', error);
        setOptions(prev => ({
          ...prev,
          loading: false,
          error: error.message || 'Failed to load catalog options',
        }));
      }
    };

    fetchClientOptions();
  }, [clientId]);

  return options;
};
