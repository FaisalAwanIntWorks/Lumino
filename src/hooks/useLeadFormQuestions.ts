import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface LeadFormQuestion {
  question_key: string;
  question_text: string;
  question_type: string;
}

export function useLeadFormQuestions(clientId: string | null | undefined, source: string | null | undefined) {
  const [questions, setQuestions] = useState<LeadFormQuestion[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!clientId || !source) return;

    // Determine which table to query
    let table: 'client_ring_form_questions' | 'client_grill_questions' | 'client_custom_enquiry_questions' | null = null;
    if (source === 'ring_builder' || source === 'diamond_form') {
      table = 'client_ring_form_questions';
    } else if (source === 'grill_form') {
      table = 'client_grill_questions';
    } else if (source === 'custom_enquiry') {
      table = 'client_custom_enquiry_questions';
    }

    if (!table) return;

    const fetchQuestions = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from(table!)
          .select('question_key, question_text, question_type')
          .eq('client_id', clientId)
          .eq('is_enabled', true)
          .order('display_order', { ascending: true });

        if (error) throw error;
        setQuestions(data || []);
      } catch (err) {
        console.error('Error fetching lead form questions:', err);
        setQuestions([]);
      } finally {
        setLoading(false);
      }
    };

    fetchQuestions();
  }, [clientId, source]);

  return { questions, loading };
}
