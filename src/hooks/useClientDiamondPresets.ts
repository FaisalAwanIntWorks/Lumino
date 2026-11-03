import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface ClientDiamondPreset {
  id: string;
  stone_type: 'natural' | 'lab';
  shape_id: string;
  carat_range: string;
  carat_value: number;
  color: string;
  clarity: string;
  base_price: number;
  custom_price: number | null;
  is_enabled: boolean;
  cut_grade: string | null;
  fluorescence: string | null;
  report_no: string | null;
}

const rangeStart = (range: string | null | undefined) => {
  const match = String(range ?? '').match(/\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
};

const isWithinDeclaredRange = (preset: ClientDiamondPreset) => {
  const start = rangeStart(preset.carat_range);
  if (start == null || Number.isNaN(start)) return true;
  return preset.carat_value >= start && preset.carat_value < start + 0.5;
};

interface UseClientDiamondPresetsResult {
  diamondPresets: ClientDiamondPreset[];
  loading: boolean;
  error: string | null;
}

export const useClientDiamondPresets = (clientId: string | null): UseClientDiamondPresetsResult => {
  const [diamondPresets, setDiamondPresets] = useState<ClientDiamondPreset[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchDiamondPresets = async () => {
      if (!clientId) {
        setDiamondPresets([]);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const { data: allPresets, error: fetchError } = await supabase
          .rpc('get_diamond_presets_filtered', {
            p_client_id: clientId,
            p_page_size: 2000,
            p_offset: 0,
          });

        if (fetchError) {
          console.error('Error fetching diamond presets:', fetchError);
          setError(fetchError.message);
          setDiamondPresets([]);
          setLoading(false);
          return;
        }

        const typedData = (allPresets ?? []).map((preset: Record<string, unknown>) => ({
          id: preset.id as string,
          stone_type: preset.stone_type as 'natural' | 'lab',
          shape_id: preset.shape_id as string,
          carat_range: preset.carat_range as string,
          carat_value: Number(preset.carat_value),
          color: preset.color as string,
          clarity: preset.clarity as string,
          base_price: Number(preset.base_price),
          custom_price: preset.custom_price !== null ? Number(preset.custom_price) : null,
          is_enabled: preset.is_enabled as boolean,
          cut_grade: (preset.cut_grade as string) ?? null,
          fluorescence: (preset.fluorescence as string) ?? null,
          report_no: (preset.report_no as string) ?? null,
        })).filter(isWithinDeclaredRange);
        setDiamondPresets(typedData);
      } catch (err) {
        console.error('Unexpected error:', err);
        setError('Failed to fetch diamond presets');
        setDiamondPresets([]);
      } finally {
        setLoading(false);
      }
    };

    fetchDiamondPresets();
  }, [clientId]);

  return { diamondPresets, loading, error };
};
