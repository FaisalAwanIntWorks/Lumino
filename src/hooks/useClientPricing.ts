import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  RING_OS_DEFAULT_STYLE_PRICES,
  RING_OS_DEFAULT_SHANK_PRICES,
  RING_OS_DEFAULT_METAL_VARIANTS,
} from '@/lib/ring-os-defaults';

interface OptionPrices {
  styles: Record<string, number>;
  shanks: Record<string, number>;
}

interface MetalVariant {
  id: string;
  colorFamily: string;
  variantName: string;
  price: number;
}

interface RingConfiguration {
  style?: string | null;
  shank?: string | null;
  metal?: string | null;
  colorFamily?: string | null;
  caratRange?: string | null;
  stone?: { price: number } | null;
}

// Default prices as fallback (single source of truth in ring-os-defaults.ts)
const DEFAULT_PRICES: OptionPrices = {
  styles: { ...RING_OS_DEFAULT_STYLE_PRICES },
  shanks: { ...RING_OS_DEFAULT_SHANK_PRICES },
};

// Default metal variant prices as fallback
const DEFAULT_METAL_VARIANTS: MetalVariant[] = RING_OS_DEFAULT_METAL_VARIANTS.map(v => ({
  id: v.id,
  colorFamily: v.colorFamily,
  variantName: v.variantName,
  price: v.price,
}));

export const useClientPricing = (clientId: string | null) => {
  const [prices, setPrices] = useState<OptionPrices>(DEFAULT_PRICES);
  const [metalVariants, setMetalVariants] = useState<MetalVariant[]>(DEFAULT_METAL_VARIANTS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchPrices = async () => {
      if (!clientId) {
        setLoading(false);
        return;
      }

      try {
        // Fetch option prices (styles, shanks)
        const { data: pricesData, error: fetchError } = await supabase
          .from('client_option_prices')
          .select('*')
          .eq('client_id', clientId);

        if (fetchError) {
          console.error('Error fetching prices:', fetchError);
          setError(fetchError.message);
          return;
        }

        if (pricesData && pricesData.length > 0) {
          const loadedPrices: OptionPrices = {
            styles: { ...DEFAULT_PRICES.styles },
            shanks: { ...DEFAULT_PRICES.shanks },
          };

          pricesData.forEach((item) => {
            const type = item.option_type as keyof OptionPrices;
            if (loadedPrices[type]) {
              loadedPrices[type][item.option_id] = Number(item.price);
            }
          });

          setPrices(loadedPrices);
        }

        // Fetch metal variants
        const { data: metalData, error: metalError } = await supabase
          .from('client_metal_variants')
          .select('*')
          .eq('client_id', clientId)
          .order('display_order');

        if (metalError) {
          console.error('Error fetching metal variants:', metalError);
        } else if (metalData && metalData.length > 0) {
          const loadedMetals: MetalVariant[] = metalData.map(item => ({
            id: item.id,
            colorFamily: item.color_family,
            variantName: item.variant_name,
            price: Number(item.price),
          }));
          setMetalVariants(loadedMetals);
        }
      } catch (err: any) {
        console.error('Error in fetchPrices:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchPrices();
  }, [clientId]);

  const calculateTotalPrice = useCallback((config: RingConfiguration): number => {
    let total = 0;

    // Style price
    if (config.style) {
      total += prices.styles[config.style] || DEFAULT_PRICES.styles[config.style] || 0;
    }

    // Shank price
    if (config.shank) {
      total += prices.shanks[config.shank] || DEFAULT_PRICES.shanks[config.shank] || 0;
    }

    // Metal price - find by variant name
    if (config.metal) {
      const metalVariant = metalVariants.find(v => v.variantName === config.metal);
      if (metalVariant) {
        total += metalVariant.price;
      } else {
        // Fallback to default variants
        const defaultVariant = DEFAULT_METAL_VARIANTS.find(v => v.variantName === config.metal);
        if (defaultVariant) {
          total += defaultVariant.price;
        }
      }
    }

    // Stone price (if selected)
    if (config.stone?.price) {
      total += config.stone.price;
    }

    return total;
  }, [prices, metalVariants]);

  const getStylePrice = useCallback((styleId: string): number => {
    return prices.styles[styleId] ?? DEFAULT_PRICES.styles[styleId] ?? 0;
  }, [prices]);

  const getShankPrice = useCallback((shankId: string): number => {
    return prices.shanks[shankId] ?? DEFAULT_PRICES.shanks[shankId] ?? 0;
  }, [prices]);

  const getMetalPrice = useCallback((metalName: string): number => {
    const variant = metalVariants.find(v => v.variantName === metalName);
    if (variant) return variant.price;
    
    const defaultVariant = DEFAULT_METAL_VARIANTS.find(v => v.variantName === metalName);
    return defaultVariant?.price ?? 0;
  }, [metalVariants]);

  const getMetalColorFamily = useCallback((metalName: string): string | null => {
    const variant = metalVariants.find(v => v.variantName === metalName);
    if (variant) return variant.colorFamily;
    
    const defaultVariant = DEFAULT_METAL_VARIANTS.find(v => v.variantName === metalName);
    return defaultVariant?.colorFamily ?? null;
  }, [metalVariants]);

  const getMetalVariantsByColor = useCallback((colorFamily: string): MetalVariant[] => {
    return metalVariants.filter(v => v.colorFamily === colorFamily);
  }, [metalVariants]);

  return {
    prices,
    metalVariants,
    loading,
    error,
    calculateTotalPrice,
    getStylePrice,
    getShankPrice,
    getMetalPrice,
    getMetalColorFamily,
    getMetalVariantsByColor,
  };
};
