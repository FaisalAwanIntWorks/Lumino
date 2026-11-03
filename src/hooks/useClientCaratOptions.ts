import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';

// Use the database type directly for type safety
export type ClientCaratOption = Database['public']['Tables']['client_carat_options']['Row'];

interface UseClientCaratOptionsResult {
  caratOptions: ClientCaratOption[];
  loading: boolean;
  error: string | null;
}

export const useClientCaratOptions = (clientId: string | null): UseClientCaratOptionsResult => {
  const [caratOptions, setCaratOptions] = useState<ClientCaratOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchCaratOptions = async () => {
      if (!clientId) {
        setCaratOptions([]);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const { data, error: queryError } = await supabase
          .from('client_carat_options')
          .select('*')
          .eq('client_id', clientId)
          .eq('is_enabled', true)
          .order('carat_value', { ascending: true });

        if (queryError) {
          console.error('Error fetching carat options:', queryError);
          setError(queryError.message);
          setCaratOptions([]);
        } else {
          setCaratOptions(data || []);
        }
      } catch (err) {
        console.error('Unexpected error fetching carat options:', err);
        setError('Failed to fetch carat options');
        setCaratOptions([]);
      } finally {
        setLoading(false);
      }
    };

    fetchCaratOptions();
  }, [clientId]);

  return { caratOptions, loading, error };
};
