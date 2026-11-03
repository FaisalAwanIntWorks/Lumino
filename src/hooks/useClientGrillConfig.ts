import { useState, useEffect, useRef } from 'react';
import { z } from 'zod';
import { supabase } from '@/integrations/supabase/client';
import type { OptionImageOverrides } from '@/lib/option-image-overrides';
import { resolveGrillTypeOptions, type GrillTypeOption } from '@/lib/grill-metal-images';
import { resolveGrillEnabledOptions, type GrillEnabledOptions } from '@/lib/grill-option-toggles';
import { resolveThankYouContact, type ThankYouContact } from '@/lib/thank-you-contact';
import { resolveAiImageDelivery, type AiImageDelivery } from '@/lib/ai-image-delivery';



export interface GrillMetalConfig {
  value: string;
  label: string;
  color: string;
  purities: { value: string; label: string }[];
}

export interface GrillQuestionConfig {
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
  options?: any;
  option_images?: Record<string, string> | null;
}

export interface RequiredContactFields {
  name: boolean;
  email: boolean;
  phone: boolean;
}

export interface StepLabel {
  title?: string;
  subtitle?: string;
  shortLabel?: string;
}

export type StepLabelsMap = Record<string, StepLabel>;

export interface FormColors {
  background?: string;
  tabBorder?: string;
  fontColor?: string;
  imageBg?: string;
  submitButtonBg?: string;
  submitButtonText?: string;
}

export interface ClientGrillConfig {
  id: string;
  client_id: string;
  enabled_metals: GrillMetalConfig[];
  top_teeth_options: string[];
  bottom_teeth_options: string[];
  onboarding_completed: boolean;
  submission_mode: 'deposit' | 'contact';
  deposit_amount: number | null;
  questions: GrillQuestionConfig[];
  form_colors: FormColors | null;
  budget_options: string[] | null;
  required_contact_fields: RequiredContactFields;
  enabled_steps: Record<string, boolean> | null;
  step_labels: StepLabelsMap | null;
  step_order: string[] | null;
  ai_image_enabled: boolean;
  ai_image_delivery: AiImageDelivery;
  option_image_overrides: OptionImageOverrides | null;
  grill_type_options: GrillTypeOption[] | null;
  metal_order: string[] | null;
  enabled_options: GrillEnabledOptions;
  thank_you_contact: ThankYouContact;
}



// N2: Zod schemas for JSONB columns — safeParse warns on shape mismatch without breaking fallback logic.
const GrillMetalConfigSchema = z.array(
  z.object({
    value: z.string(),
    label: z.string(),
    color: z.string(),
    purities: z.array(z.object({ value: z.string(), label: z.string() })),
  })
);

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

function safeParseJsonb<T>(
  schema: z.ZodType<T>,
  value: unknown,
  fallback: T,
  field: string
): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    console.warn(`[useClientGrillConfig] JSONB field "${field}" shape mismatch:`, result.error.flatten());
    return fallback;
  }
  return result.data;
}

export function useClientGrillConfig(clientId: string | null) {
  const [config, setConfig] = useState<ClientGrillConfig | null>(null);
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
            .from('client_grill_config')
            .select('*')
            .eq('client_id', clientId)
            .maybeSingle(),
          supabase
            .from('client_grill_questions')
            .select('*')
            .eq('client_id', clientId)
            .eq('is_enabled', true)
            .eq('is_default', false)
            .order('display_order'),
        ]);

        if (configRes.error) throw configRes.error;

        if (configRes.data) {
          const raw = configRes.data as any;
          setConfig({
            ...raw,
            // N2: validate each JSONB field; warn on mismatch, fall back to safe default
            submission_mode: safeParseJsonb(SubmissionModeSchema, raw.submission_mode, 'contact', 'submission_mode'),
            deposit_amount: typeof raw.deposit_amount === 'number' ? raw.deposit_amount : null,
            enabled_metals: safeParseJsonb(GrillMetalConfigSchema, raw.enabled_metals, [], 'enabled_metals'),
            form_colors: safeParseJsonb(FormColorsSchema, raw.form_colors, null, 'form_colors'),
            budget_options: safeParseJsonb(StringArrayOrNullSchema, raw.budget_options, null, 'budget_options'),
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
            option_image_overrides: (raw.option_image_overrides && typeof raw.option_image_overrides === 'object'
              ? raw.option_image_overrides
              : null) as OptionImageOverrides | null,
            grill_type_options: raw.grill_type_options ? resolveGrillTypeOptions(raw.grill_type_options) : null,
            metal_order: safeParseJsonb(StringArrayOrNullSchema, raw.metal_order ?? null, null, 'metal_order'),
            enabled_options: resolveGrillEnabledOptions(raw.enabled_options),
            thank_you_contact: resolveThankYouContact(raw.thank_you_contact),

            questions: (questionsRes.data || []) as GrillQuestionConfig[],
          });

        } else {
          setConfig(null);
        }
      } catch (err: any) {
        console.error('Error fetching grill config:', err);
        // N3: surface the error so callers can render an error state
        setError(err?.message || 'Failed to load grill configuration');
        setConfig(null);
      } finally {
        setLoading(false);
      }
    };

    fetchConfig();
  }, [clientId]);

  return { config, loading, error };
}
