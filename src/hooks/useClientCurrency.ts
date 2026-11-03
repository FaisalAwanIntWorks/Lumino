import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useAdminImpersonation } from '@/contexts/AdminImpersonationContext';

export const CURRENCY_OPTIONS = [
  { value: 'USD', label: 'USD ($)', symbol: '$' },
  { value: 'GBP', label: 'GBP (£)', symbol: '£' },
  { value: 'EUR', label: 'EUR (€)', symbol: '€' },
  { value: 'AUD', label: 'AUD (A$)', symbol: 'A$' },
  { value: 'CAD', label: 'CAD (C$)', symbol: 'C$' },
  { value: 'NZD', label: 'NZD (NZ$)', symbol: 'NZ$' },
  { value: 'ZAR', label: 'ZAR (R)', symbol: 'R' },
  { value: 'INR', label: 'INR (₹)', symbol: '₹' },
  { value: 'AED', label: 'AED (د.إ)', symbol: 'د.إ' },
  { value: 'CHF', label: 'CHF', symbol: 'CHF' },
] as const;

/**
 * Hook to fetch the current client's currency setting.
 * Works for both client portal (auth-based) and embed pages (clientId-based).
 */
export function useClientCurrency(clientId?: string | null) {
  const [currency, setCurrency] = useState<string>('USD');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchCurrency = async () => {
      try {
        if (clientId) {
          // Direct client ID lookup (embed pages, admin impersonation)
          const { data } = await supabase
            .from('clients')
            .select('currency')
            .eq('id', clientId)
            .maybeSingle();
          if (data?.currency) setCurrency(data.currency);
        } else {
          // Auth-based lookup (client portal)
          const { data: { user } } = await supabase.auth.getUser();
          if (user) {
            const { data } = await supabase
              .from('clients')
              .select('currency')
              .eq('user_id', user.id)
              .maybeSingle();
            if (data?.currency) setCurrency(data.currency);
          }
        }
      } catch (err) {
        console.error('Failed to fetch client currency:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchCurrency();
  }, [clientId]);

  return { currency, loading };
}
