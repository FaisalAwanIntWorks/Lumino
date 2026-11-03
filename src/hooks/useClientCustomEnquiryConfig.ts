import { useState, useEffect, useRef } from 'react';
import { z } from 'zod';
import { supabase } from '@/integrations/supabase/client';
import { normalizeGoldColors } from '@/lib/custom-enquiry-metals';
import type { FormColors, RequiredContactFields, StepLabelsMap } from './useClientGrillConfig';
import type { OptionImageOverrides } from '@/lib/option-image-overrides';
import { resolveThankYouContact, type ThankYouContact } from '@/lib/thank-you-contact';
import { resolveAiImageDelivery, type AiImageDelivery } from '@/lib/ai-image-delivery';


export interface CustomEnquiryGoldColor {
  value: string;
  label: string;
  hex?: string;
}

export interface CustomEnquiryQuestionConfig {
  id: string;
  question_text: string;
  question_key: string;
  question_type: string;
  is_enabled: boolean;
  is_required: boolean;
  display_order: number;
  has_text_followup: boolean;
  has_file_followup: boolean;
  is_default: boolean;
  options: string[] | null;
  option_images: Record<string, string> | null;
  subtitle?: string | null;
}

export interface ClientCustomEnquiryConfig {
  id: string;
  client_id: string;
  jewelry_types: string[];
  budget_options: string[];
  timeline_options: string[];
  gold_colors: CustomEnquiryGoldColor[];
  karat_options: string[];
  diamond_qualities: string[];
  diamond_setup_options: string[];
  back_options: string[]; // deprecated, kept for DB compat
  onboarding_completed: boolean;
  submission_mode: 'deposit' | 'contact';
  deposit_amount: number | null;
  questions: CustomEnquiryQuestionConfig[];
  form_colors: FormColors | null;
  required_contact_fields: RequiredContactFields;
  enabled_steps: Record<string, boolean> | null;
  step_labels: StepLabelsMap | null;
  step_order: string[] | null;
  ai_image_enabled: boolean;
  ai_image_delivery: AiImageDelivery;
  option_image_overrides: OptionImageOverrides | null;
  /** Per-option customer-facing notes: { section: { optionValue: note } } */
  design_option_notes: Record<string, Record<string, string>> | null;
  thank_you_contact: ThankYouContact;
}


// N2: Zod schemas for JSONB columns
const FormColorsSchema = z.object({
  background: z.string().optional(),
  tabBorder: z.string().optional(),
  fontColor: z.string().optional(),
  imageBg: z.string().optional(),
  submitButtonBg: z.string().optional(),
  submitButtonText: z.string().optional(),
}).nullable();

const RequiredContactFieldsSchema = z.object({
  name: z.boolean(),
  email: z.boolean(),
  phone: z.boolean(),
});

const StepLabelSchema = z.object({
  title: z.string().optional(),
  subtitle: z.string().optional(),
  shortLabel: z.string().optional(),
});

const StringArrayOrNullSchema = z.array(z.string()).nullable();
const BooleanRecordOrNullSchema = z.record(z.string(), z.boolean()).nullable();
const StepLabelsMapOrNullSchema = z.record(z.string(), StepLabelSchema).nullable();
const SubmissionModeSchema = z.enum(['deposit', 'contact']);

const GoldColorSchema = z.array(
  z.object({
    value: z.string(),
    label: z.string(),
    hex: z.string().optional(),
  }).passthrough()
) as z.ZodType<Array<{ value: string; label: string; hex?: string }>>;

function safeParseJsonb<T>(
  schema: z.ZodType<T>,
  value: unknown,
  fallback: T,
  field: string
): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    console.warn(`[useClientCustomEnquiryConfig] JSONB field "${field}" shape mismatch:`, result.error.flatten());
    return fallback;
  }
  return result.data;
}

export function useClientCustomEnquiryConfig(clientId: string | null) {
  const [config, setConfig] = useState<ClientCustomEnquiryConfig | null>(null);
  const [loading, setLoading] = useState(true);
  // N3: expose fetch errors so embed pages can show an error state
  const [error, setError] = useState<string | null>(null);
  const lastFetchedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!clientId) {
      setLoading(false);
      return;
    }
    // J3: skip re-fetch if clientId hasn't changed (guards StrictMode double-invoke)
    if (lastFetchedRef.current === clientId) return;
    lastFetchedRef.current = clientId;

    const fetchConfig = async () => {
      setLoading(true);
      setError(null);
      try {
        const [configRes, questionsRes] = await Promise.all([
          supabase
            .from('client_custom_enquiry_config')
            .select('*')
            .eq('client_id', clientId)
            .maybeSingle(),
          supabase
            .from('client_custom_enquiry_questions')
            .select('*')
            .eq('client_id', clientId)
            .eq('is_enabled', true)
            .order('display_order'),
        ]);

        if (configRes.error) throw configRes.error;

        if (configRes.data) {
          const raw = configRes.data as any;
          const rawGoldColors = safeParseJsonb(GoldColorSchema, raw.gold_colors, [], 'gold_colors');
          setConfig({
            ...raw,
            // N2: validate each JSONB field; warn on mismatch, fall back to safe default
            submission_mode: safeParseJsonb(SubmissionModeSchema, raw.submission_mode, 'contact', 'submission_mode'),
            deposit_amount: typeof raw.deposit_amount === 'number' ? raw.deposit_amount : null,
            gold_colors: normalizeGoldColors(rawGoldColors),
            form_colors: safeParseJsonb(FormColorsSchema, raw.form_colors, null, 'form_colors'),
            required_contact_fields: safeParseJsonb(
              RequiredContactFieldsSchema,
              raw.required_contact_fields,
              { name: true, email: true, phone: true },
              'required_contact_fields',
            ),
            enabled_steps: safeParseJsonb(BooleanRecordOrNullSchema, raw.enabled_steps, null, 'enabled_steps'),
            step_labels: safeParseJsonb(StepLabelsMapOrNullSchema, raw.step_labels, null, 'step_labels'),
            step_order: safeParseJsonb(StringArrayOrNullSchema, raw.step_order, null, 'step_order'),
            ai_image_enabled: typeof raw.ai_image_enabled === 'boolean' ? raw.ai_image_enabled : false,
            ai_image_delivery: resolveAiImageDelivery(raw.ai_image_delivery),
            design_option_notes: (raw.design_option_notes && typeof raw.design_option_notes === 'object'
              ? raw.design_option_notes
              : null) as Record<string, Record<string, string>> | null,
            option_image_overrides: (raw.option_image_overrides && typeof raw.option_image_overrides === 'object'
              ? raw.option_image_overrides
              : null) as OptionImageOverrides | null,
            thank_you_contact: resolveThankYouContact(raw.thank_you_contact),
            questions: (questionsRes.data || []).map((q: any) => ({
              ...q,
              options: Array.isArray(q.options) ? q.options : null,
              option_images: q.option_images && typeof q.option_images === 'object' ? q.option_images : null,
            })) as CustomEnquiryQuestionConfig[],

          });
        } else {
          setConfig(null);
        }
      } catch (err: any) {
        console.error('Error fetching custom enquiry config:', err);
        // N3: surface the error so callers can render an error state
        setError(err?.message || 'Failed to load custom enquiry configuration');
        setConfig(null);
      } finally {
        setLoading(false);
      }
    };

    fetchConfig();
  }, [clientId]);

  return { config, loading, error };
}
