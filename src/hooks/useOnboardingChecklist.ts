import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useAdminImpersonation } from '@/contexts/AdminImpersonationContext';
import { useClientFeatures } from '@/hooks/useClientFeatures';

export interface OnboardingStep {
  key: string;
  label: string;
  description: string;
  completed: boolean;
  href: string;
}

interface OnboardingChecklistResult {
  steps: OnboardingStep[];
  allComplete: boolean;
  completedCount: number;
  totalCount: number;
  loading: boolean;
}

export function useOnboardingChecklist(): OnboardingChecklistResult {
  const { user, role, staffInfo } = useAuth();
  const { impersonatedClientId } = useAdminImpersonation();
  const { features, isLoading: featuresLoading } = useClientFeatures();
  const location = useLocation();
  const routePrefix = location.pathname.startsWith('/admin/view-as') ? '/admin/view-as' : '/dashboard';
  const [steps, setSteps] = useState<OnboardingStep[]>([]);
  const [loading, setLoading] = useState(true);

  const showCatalog = features.product_catalogue;
  const showWidget = features.embed_branding;
  const showForm = features.diamond_form || features.grillz_builder || features.custom_enquiry;

  useEffect(() => {
    if (!user || featuresLoading) return;

    const resolve = async () => {
      try {
        let clientId = impersonatedClientId;
        if (!clientId) {
          if (role === 'staff' && staffInfo?.clientId) {
            clientId = staffInfo.clientId;
          } else {
            const { data } = await supabase
              .from('clients')
              .select('id')
              .eq('user_id', user.id)
              .maybeSingle();
            clientId = data?.id ?? null;
          }
        }
        if (!clientId) { setLoading(false); return; }

        const clientQuery = supabase
          .from('clients')
          .select('shopify_store_url, widget_theme, branding_config, allowed_domains')
          .eq('id', clientId)
          .maybeSingle();

        const catalogQuery = showCatalog
          ? supabase
              .from('client_ring_catalog')
              .select('id', { count: 'exact', head: true })
              .eq('client_id', clientId)
          : null;

        const ringFormQuery = showForm
          ? supabase
              .from('client_ring_form_config')
              .select('onboarding_completed')
              .eq('client_id', clientId)
              .eq('onboarding_completed', true)
              .maybeSingle()
          : null;

        const grillFormQuery = showForm
          ? supabase
              .from('client_grill_config')
              .select('onboarding_completed')
              .eq('client_id', clientId)
              .eq('onboarding_completed', true)
              .maybeSingle()
          : null;

        const enquiryFormQuery = showForm
          ? supabase
              .from('client_custom_enquiry_config')
              .select('onboarding_completed')
              .eq('client_id', clientId)
              .eq('onboarding_completed', true)
              .maybeSingle()
          : null;

        const [clientRes, catalogRes, ringFormRes, grillFormRes, enquiryFormRes] = await Promise.all([
          clientQuery,
          catalogQuery,
          ringFormQuery,
          grillFormQuery,
          enquiryFormQuery,
        ]);

        const client = clientRes?.data;
        const hasCatalog = (catalogRes?.count ?? 0) > 0;
        const hasShopify = !!client?.shopify_store_url;
        const hasWidget = !!client?.widget_theme || (!!client?.branding_config && Object.keys(client.branding_config as object).length > 0);
        const hasDomain = Array.isArray(client?.allowed_domains) && (client.allowed_domains as string[]).length > 0;
        const hasForm = !!ringFormRes?.data || !!grillFormRes?.data || !!enquiryFormRes?.data;

        const result: OnboardingStep[] = [];

        if (showCatalog) {
          result.push({ key: 'catalog', label: 'Generate Ring Catalog', description: 'Add products to your catalog', completed: hasCatalog, href: `${routePrefix}/catalog` });
        }
        result.push({ key: 'shopify', label: 'Connect Shopify Store', description: 'Link your Shopify store', completed: hasShopify, href: `${routePrefix}/settings` });
        if (showWidget) {
          result.push({ key: 'widget', label: 'Configure Widget Theme', description: 'Customize your widget look', completed: hasWidget, href: `${routePrefix}/embed` });
        }
        if (showForm) {
          result.push({ key: 'form', label: 'Set Up a Lead Form', description: 'Configure a builder form', completed: hasForm, href: `${routePrefix}/diamonds-form` });
        }
        result.push({ key: 'domain', label: 'Add Allowed Domain', description: 'Whitelist your website domain', completed: hasDomain, href: `${routePrefix}/settings` });

        setSteps(result);
      } catch (err) {
        console.error('Onboarding checklist error:', err);
      } finally {
        setLoading(false);
      }
    };

    resolve();
  }, [user, role, staffInfo, impersonatedClientId, featuresLoading, showCatalog, showWidget, showForm]);

  const completedCount = steps.filter(s => s.completed).length;
  const totalCount = steps.length;
  const allComplete = totalCount > 0 && completedCount === totalCount;

  return { steps, allComplete, completedCount, totalCount, loading };
}
