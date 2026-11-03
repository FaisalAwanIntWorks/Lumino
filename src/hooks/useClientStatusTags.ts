import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface StatusTag {
  id: string;
  tag_name: string;
  tag_color: string;
  context: 'leads' | 'orders' | 'metal_buying';
  display_order: number;
  is_default: boolean;
}

const DEFAULT_LEAD_TAGS: Omit<StatusTag, 'id'>[] = [
  { tag_name: 'new', tag_color: 'bg-blue-500/10 text-blue-500 border-blue-500/20', context: 'leads', display_order: 0, is_default: true },
  { tag_name: 'contacted', tag_color: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20', context: 'leads', display_order: 1, is_default: true },
  { tag_name: 'qualified', tag_color: 'bg-purple-500/10 text-purple-500 border-purple-500/20', context: 'leads', display_order: 2, is_default: true },
  { tag_name: 'converted', tag_color: 'bg-green-500/10 text-green-500 border-green-500/20', context: 'leads', display_order: 3, is_default: true },
  { tag_name: 'lost', tag_color: 'bg-red-500/10 text-red-500 border-red-500/20', context: 'leads', display_order: 4, is_default: true },
];

const DEFAULT_ORDER_TAGS: Omit<StatusTag, 'id'>[] = [
  { tag_name: 'pending', tag_color: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20', context: 'orders', display_order: 0, is_default: true },
  { tag_name: 'processing', tag_color: 'bg-blue-500/10 text-blue-500 border-blue-500/20', context: 'orders', display_order: 1, is_default: true },
  { tag_name: 'completed', tag_color: 'bg-green-500/10 text-green-500 border-green-500/20', context: 'orders', display_order: 2, is_default: true },
  { tag_name: 'cancelled', tag_color: 'bg-red-500/10 text-red-500 border-red-500/20', context: 'orders', display_order: 3, is_default: true },
];

const DEFAULT_METAL_BUYING_TAGS: Omit<StatusTag, 'id'>[] = [
  { tag_name: 'new', tag_color: 'bg-blue-500/10 text-blue-500 border-blue-500/20', context: 'metal_buying', display_order: 0, is_default: true },
  { tag_name: 'contacted', tag_color: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20', context: 'metal_buying', display_order: 1, is_default: true },
  { tag_name: 'qualified', tag_color: 'bg-purple-500/10 text-purple-500 border-purple-500/20', context: 'metal_buying', display_order: 2, is_default: true },
  { tag_name: 'converted', tag_color: 'bg-green-500/10 text-green-500 border-green-500/20', context: 'metal_buying', display_order: 3, is_default: true },
  { tag_name: 'lost', tag_color: 'bg-red-500/10 text-red-500 border-red-500/20', context: 'metal_buying', display_order: 4, is_default: true },
];

// Color presets for new custom tags
export const TAG_COLOR_PRESETS = [
  { label: 'Blue', value: 'bg-blue-500/10 text-blue-500 border-blue-500/20' },
  { label: 'Green', value: 'bg-green-500/10 text-green-500 border-green-500/20' },
  { label: 'Yellow', value: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20' },
  { label: 'Red', value: 'bg-red-500/10 text-red-500 border-red-500/20' },
  { label: 'Purple', value: 'bg-purple-500/10 text-purple-500 border-purple-500/20' },
  { label: 'Orange', value: 'bg-orange-500/10 text-orange-500 border-orange-500/20' },
  { label: 'Pink', value: 'bg-pink-500/10 text-pink-500 border-pink-500/20' },
  { label: 'Teal', value: 'bg-teal-500/10 text-teal-500 border-teal-500/20' },
];

export function useClientStatusTags(clientId: string | null, context: 'leads' | 'orders' | 'metal_buying') {
  const [tags, setTags] = useState<StatusTag[]>([]);
  const [loading, setLoading] = useState(true);

  const defaults = context === 'leads' ? DEFAULT_LEAD_TAGS : context === 'orders' ? DEFAULT_ORDER_TAGS : DEFAULT_METAL_BUYING_TAGS;

  const fetchTags = useCallback(async () => {
    if (!clientId) { setLoading(false); return; }
    try {
      const { data, error } = await supabase
        .from('client_status_tags')
        .select('*')
        .eq('client_id', clientId)
        .eq('context', context)
        .order('display_order', { ascending: true });

      if (error) throw error;

      if (!data || data.length === 0) {
        // Seed defaults
        const toInsert = defaults.map(t => ({ ...t, client_id: clientId }));
        const { data: inserted, error: insertErr } = await supabase
          .from('client_status_tags')
          .insert(toInsert)
          .select();
        if (insertErr) throw insertErr;
        setTags((inserted || []) as StatusTag[]);
      } else {
        setTags(data as StatusTag[]);
      }
    } catch (err) {
      console.error('Failed to fetch status tags:', err);
      // Fallback to defaults without IDs
      setTags(defaults.map((t, i) => ({ ...t, id: `fallback-${i}` })));
    } finally {
      setLoading(false);
    }
  }, [clientId, context]);

  useEffect(() => { fetchTags(); }, [fetchTags]);

  const addTag = async (tagName: string, tagColor: string) => {
    if (!clientId) return;
    const normalizedName = tagName.trim().toLowerCase();
    if (!normalizedName) return;
    if (tags.some(t => t.tag_name === normalizedName)) {
      toast.error('Tag already exists');
      return;
    }
    try {
      const { data, error } = await supabase
        .from('client_status_tags')
        .insert({
          client_id: clientId,
          tag_name: normalizedName,
          tag_color: tagColor,
          context,
          display_order: tags.length,
          is_default: false,
        })
        .select()
        .single();
      if (error) throw error;
      setTags(prev => [...prev, data as StatusTag]);
      toast.success(`Tag "${normalizedName}" created`);
    } catch (err: any) {
      console.error('Failed to create tag:', err);
      toast.error('Failed to create tag');
    }
  };

  const deleteTag = async (tagId: string) => {
    try {
      const { error } = await supabase
        .from('client_status_tags')
        .delete()
        .eq('id', tagId);
      if (error) throw error;
      setTags(prev => prev.filter(t => t.id !== tagId));
      toast.success('Tag deleted');
    } catch (err) {
      toast.error('Failed to delete tag');
    }
  };

  const getTagColor = (tagName: string) => {
    const tag = tags.find(t => t.tag_name === tagName);
    return tag?.tag_color || 'bg-secondary';
  };

  return { tags, loading, addTag, deleteTag, getTagColor, refetch: fetchTags };
}
