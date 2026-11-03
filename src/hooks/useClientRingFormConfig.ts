import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { RequiredContactFields, StepLabelsMap } from './useClientGrillConfig';
import type { OptionImageOverrides } from '@/lib/option-image-overrides';
import { resolveThankYouContact, type ThankYouContact } from '@/lib/thank-you-contact';
import { resolveAiImageDelivery, type AiImageDelivery } from '@/lib/ai-image-delivery';


export interface RingFormStepOption {
  value: string;
  label: string;
  price?: number;
  image_url?: string;
}

export interface RingFormEnabledSteps {
  nature: boolean;
  shape: boolean;
  size: boolean;
  quality: boolean;
  setting: boolean;
  holder: boolean;
  band: boolean;
  band_width: boolean;
  metal: boolean;
  karat: boolean;
  personalization: boolean;
  description: boolean;
  inspiration: boolean;
  engraving: boolean;
  timeline: boolean;
  budget: boolean;
}

export interface FormColors {
  background?: string;
  tabBorder?: string;
  fontColor?: string;
  imageBg?: string;
  submitButtonBg?: string;
  submitButtonText?: string;
}

export interface ClientRingFormConfig {
  id: string;
  client_id: string;
  onboarding_completed: boolean;
  submission_mode: 'contact' | 'deposit';
  deposit_amount: number | null;
  form_colors: FormColors | null;
  budget_options: string[] | null;
  timeline_options: string[] | null;
  enabled_steps: RingFormEnabledSteps;
  step_options: Record<string, RingFormStepOption[]> | null;
  shopify_product_id: string | null;
  shopify_variant_id: string | null;
  required_contact_fields: RequiredContactFields;
  step_labels: StepLabelsMap | null;
  step_order: string[] | null;
  ai_image_enabled: boolean;
  ai_image_delivery: AiImageDelivery;
  step_groups: string[][] | null;
  option_image_overrides: OptionImageOverrides | null;
  thank_you_contact: ThankYouContact;
}


const DEFAULT_ENABLED_STEPS: RingFormEnabledSteps = {
  nature: true,
  shape: true,
  size: true,
  quality: true,
  setting: true,
  holder: true,
  band: true,
  band_width: true,
  metal: true,
  karat: true,
  personalization: true,
  description: true,
  inspiration: true,
  engraving: true,
  timeline: true,
  budget: true,
};

// B4: explicit column list — `select('*')` was pulling JSONB blobs we never use.
const CONFIG_COLUMNS =
  'id, client_id, onboarding_completed, submission_mode, deposit_amount, form_colors, budget_options, timeline_options, enabled_steps, step_options, shopify_product_id, shopify_variant_id, required_contact_fields, step_labels, step_order, ai_image_enabled, step_groups, option_image_overrides, thank_you_contact';


// B2: cached via React Query so the form doesn't refetch the same row on
// every parent re-render.
export function useClientRingFormConfig(clientId: string | null) {
  const query = useQuery<ClientRingFormConfig | null>({
    queryKey: ['client-ring-form-config', clientId ?? null],
    enabled: !!clientId,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    queryFn: async () => {
      const fetchConfig = (columns: string) =>
        supabase
          .from('client_ring_form_config')
          .select(columns)
          .eq('client_id', clientId!)
          .maybeSingle();

      let { data, error }: { data: any; error: any } = await fetchConfig(`${CONFIG_COLUMNS}, ai_image_delivery`);
      // 42703 = undefined column: ai_image_delivery not migrated yet. Fall back to
      // the known columns so the live form keeps working (delivery = default).
      if (error?.code === '42703') {
        ({ data, error } = await fetchConfig(CONFIG_COLUMNS));
      }

      if (error) throw error;
      if (!data) return null;

      return {
        id: data.id,
        client_id: data.client_id,
        onboarding_completed: data.onboarding_completed,
        submission_mode: (data.submission_mode as 'contact' | 'deposit') || 'contact',
        deposit_amount: data.deposit_amount,
        form_colors: (data.form_colors as FormColors) || null,
        budget_options: (data.budget_options as string[]) || null,
        timeline_options: ((data as any).timeline_options as string[] | null) ?? null,
        enabled_steps: (data.enabled_steps as unknown as RingFormEnabledSteps) || DEFAULT_ENABLED_STEPS,
        step_options: (data.step_options as unknown as Record<string, RingFormStepOption[]>) || null,
        shopify_product_id: data.shopify_product_id,
        shopify_variant_id: data.shopify_variant_id,
        required_contact_fields: ((data as any).required_contact_fields as RequiredContactFields) || { name: true, email: true, phone: true },
        step_labels: (data as any).step_labels || null,
        step_order: (data as any).step_order || null,
        ai_image_enabled: (data as any).ai_image_enabled ?? false,
        ai_image_delivery: resolveAiImageDelivery((data as any).ai_image_delivery),
        step_groups: (data as any).step_groups || null,
        option_image_overrides: ((data as any).option_image_overrides as OptionImageOverrides) || null,
        thank_you_contact: resolveThankYouContact(data.thank_you_contact),
      };

    },
  });

  return {
    config: query.data ?? null,
    loading: query.isLoading,
    error: (query.error as Error | null) ?? null,
  };
}
