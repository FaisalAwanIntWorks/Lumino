import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { DynamicQuestionConfig } from '@/components/form-wizard/WizardDynamicQuestion';

// B2: cached via React Query so re-renders of the parent (e.g. on every
// keystroke or step change) don't re-issue the SELECT.
// B4: explicit column list instead of `select('*')` — the table includes large
// JSONB blobs the form doesn't read.
const QUESTION_COLUMNS =
  'id, question_text, question_key, question_type, is_enabled, is_required, display_order, has_text_followup, has_file_followup, is_default, options, option_images, subtitle';

export function useClientRingFormQuestions(clientId: string | null | undefined) {
  const query = useQuery<DynamicQuestionConfig[]>({
    queryKey: ['client-ring-form-questions', clientId ?? null],
    enabled: !!clientId,
    staleTime: 5 * 60 * 1000,   // 5 min — form config rarely changes mid-session
    gcTime: 30 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('client_ring_form_questions')
        .select(QUESTION_COLUMNS)
        .eq('client_id', clientId!)
        .eq('is_enabled', true)
        .order('display_order', { ascending: true });

      if (error) throw error;

      return (data || []).map((d: any) => ({
        id: d.id,
        question_text: d.question_text,
        question_key: d.question_key,
        question_type: d.question_type,
        is_enabled: d.is_enabled,
        is_required: d.is_required,
        display_order: d.display_order,
        has_text_followup: d.has_text_followup,
        has_file_followup: d.has_file_followup,
        is_default: d.is_default,
        options: d.options as string[] | undefined,
        option_images: d.option_images as Record<string, string> | null,
        subtitle: d.subtitle || undefined,
      }));
    },
  });

  return {
    questions: query.data ?? [],
    loading: query.isLoading,
    error: (query.error as Error | null) ?? null,
  };
}
