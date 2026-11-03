import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface ClientDiamondCatalogAvailability {
  isConfirmed: boolean;
  shapes: string[];
  stoneTypes: Array<'natural' | 'lab'>;
  caratBuckets: number[];
  shapeCaratBuckets: Record<string, number[]>;
}

const EMPTY_AVAILABILITY: ClientDiamondCatalogAvailability = {
  isConfirmed: false,
  shapes: [],
  stoneTypes: [],
  caratBuckets: [],
  shapeCaratBuckets: {},
};

// Safety net: if the availability lookup fails (timeout / network), never hide every
// option from the customer. Serve the standard shape + carat matrix instead; the
// stone query itself still filters to what is actually in stock.
const FALLBACK_SHAPES = ['round', 'oval', 'pear', 'emerald', 'radiant', 'princess', 'marquise', 'cushion', 'asscher', 'heart'];
const FALLBACK_BUCKETS = [0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6, 6.5, 7, 7.5, 8];
const FALLBACK_AVAILABILITY: ClientDiamondCatalogAvailability = {
  isConfirmed: false,
  shapes: FALLBACK_SHAPES,
  stoneTypes: ['natural', 'lab'],
  caratBuckets: FALLBACK_BUCKETS,
  shapeCaratBuckets: Object.fromEntries(FALLBACK_SHAPES.map((shape) => [shape, FALLBACK_BUCKETS])),
};


const normalizeNumberList = (values: unknown): number[] => {
  if (!Array.isArray(values)) return [];
  return Array.from(new Set(values.map(Number).filter((value) => Number.isFinite(value)))).sort((a, b) => a - b);
};

const normalizeStringList = (values: unknown): string[] => {
  if (!Array.isArray(values)) return [];
  return Array.from(new Set(values.map((value) => String(value).toLowerCase()).filter(Boolean))).sort();
};

export function useClientDiamondCatalogAvailability(clientId: string | null) {
  const [availability, setAvailability] = useState<ClientDiamondCatalogAvailability>(EMPTY_AVAILABILITY);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const loadAvailability = async () => {
      if (!clientId) {
        setAvailability(EMPTY_AVAILABILITY);
        setError(null);
        return;
      }

      setLoading(true);
      setError(null);

      const fetchOnce = async () => {
        const { data, error: rpcError } = await (supabase.rpc as any)('get_client_diamond_catalog_availability', {
          p_client_id: clientId,
        });
        if (rpcError) throw rpcError;
        return data;
      };

      try {
        let data: unknown;
        try {
          data = await fetchOnce();
        } catch (firstErr) {
          if (cancelled) return;
          console.warn('[useClientDiamondCatalogAvailability] retrying after failure', firstErr);
          data = await fetchOnce();
        }

        if (cancelled) return;

        const raw = (data ?? {}) as Record<string, unknown>;
        const shapeCaratBuckets: Record<string, number[]> = {};
        const rawShapeBuckets = (raw.shapeCaratBuckets ?? {}) as Record<string, unknown>;
        Object.entries(rawShapeBuckets).forEach(([shape, buckets]) => {
          shapeCaratBuckets[shape.toLowerCase()] = normalizeNumberList(buckets);
        });

        const next: ClientDiamondCatalogAvailability = {
          isConfirmed: Boolean(raw.isConfirmed),
          shapes: normalizeStringList(raw.shapes),
          stoneTypes: normalizeStringList(raw.stoneTypes).filter((type): type is 'natural' | 'lab' => type === 'natural' || type === 'lab'),
          caratBuckets: normalizeNumberList(raw.caratBuckets),
          shapeCaratBuckets,
        };

        // A completely empty payload would blank out the whole stone flow — fall back instead.
        setAvailability(next.shapes.length === 0 && next.stoneTypes.length === 0 ? FALLBACK_AVAILABILITY : next);
      } catch (err) {
        if (cancelled) return;
        console.error('[useClientDiamondCatalogAvailability] failed', err);
        setError(err instanceof Error ? err.message : 'Failed to load diamond catalog availability');
        setAvailability(FALLBACK_AVAILABILITY);
      } finally {
        if (!cancelled) setLoading(false);
      }

    };

    loadAvailability();
    return () => { cancelled = true; };
  }, [clientId]);

  return { availability, loading, error };
}