import { useMemo } from 'react';
import { useClientFeatures } from '@/hooks/useClientFeatures';

export type ProductType = 'ring_os' | 'custom_x' | 'metal_iq' | 'both';

export function useClientProductType() {
  const { features } = useClientFeatures();

  return useMemo(() => {
    const hasRingOS = features.product_catalogue || features.orders || features.diamond_form;
    const hasCustomX = features.custom_enquiry || features.grillz_builder;

    let productType: ProductType = 'both';
    if (hasRingOS && !hasCustomX) productType = 'ring_os';
    else if (hasCustomX && !hasRingOS) productType = 'custom_x';
    else if (!hasRingOS && !hasCustomX && features.metal_buying) productType = 'metal_iq';

    return { hasRingOS, hasCustomX, productType };
  }, [features]);
}
