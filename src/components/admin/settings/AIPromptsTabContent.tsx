import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Save, RotateCcw, Loader2 } from 'lucide-react';

interface PromptRow {
  id: string;
  prompt_key: string;
  label: string;
  description: string;
  prompt_text: string;
  updated_at: string;
}

const DISPLAY_ORDER = ['ring_preview', 'grillz_preview', 'enquiry_preview', 'jewelry_terminology', 'ring_chat'];

export function AIPromptsTabContent() {
  const [prompts, setPrompts] = useState<PromptRow[]>([]);
  const [editedTexts, setEditedTexts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchPrompts();
  }, []);

  const fetchPrompts = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('ai_system_prompts')
      .select('*')
      .order('prompt_key');

    if (error) {
      toast.error('Failed to load prompts');
      console.error(error);
    } else if (data) {
      setPrompts(data as PromptRow[]);
      const texts: Record<string, string> = {};
      data.forEach((p: PromptRow) => { texts[p.prompt_key] = p.prompt_text; });
      setEditedTexts(texts);
    }
    setLoading(false);
  };

  const hasChanges = prompts.some(p => editedTexts[p.prompt_key] !== p.prompt_text);

  const handleSaveAll = async () => {
    setSaving(true);
    const changed = prompts.filter(p => editedTexts[p.prompt_key] !== p.prompt_text);

    for (const p of changed) {
      const { error } = await supabase
        .from('ai_system_prompts')
        .update({ prompt_text: editedTexts[p.prompt_key], updated_at: new Date().toISOString() })
        .eq('id', p.id);

      if (error) {
        toast.error(`Failed to save "${p.label}"`);
        console.error(error);
        setSaving(false);
        return;
      }
    }

    toast.success(`${changed.length} prompt(s) saved — changes take effect within 5 minutes`);
    await fetchPrompts();
    setSaving(false);
  };

  const handleReset = (key: string) => {
    const original = prompts.find(p => p.prompt_key === key);
    if (original) {
      setEditedTexts(prev => ({ ...prev, [key]: original.prompt_text }));
    }
  };

  const sorted = [...prompts].sort(
    (a, b) => DISPLAY_ORDER.indexOf(a.prompt_key) - DISPLAY_ORDER.indexOf(b.prompt_key)
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-base sm:text-lg">AI System Prompts</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Edit the prompts used by AI image generation across Custom X forms. Changes apply within 5 minutes.
          </p>
        </div>
        <Button onClick={handleSaveAll} disabled={!hasChanges || saving} size="sm">
          {saving ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Save className="h-4 w-4 mr-1.5" />}
          Save All
        </Button>
      </div>

      {sorted.map(prompt => {
        const text = editedTexts[prompt.prompt_key] ?? prompt.prompt_text;
        const isChanged = text !== prompt.prompt_text;

        return (
          <Card key={prompt.id} className="p-4 sm:p-6">
            <div className="flex items-start justify-between mb-2">
              <div>
                <Label className="text-sm font-semibold">{prompt.label}</Label>
                <p className="text-xs text-muted-foreground mt-0.5">{prompt.description}</p>
              </div>
              {isChanged && (
                <Button variant="ghost" size="sm" onClick={() => handleReset(prompt.prompt_key)} className="text-xs h-7">
                  <RotateCcw className="h-3 w-3 mr-1" /> Undo
                </Button>
              )}
            </div>
            <Textarea
              value={text}
              onChange={e => setEditedTexts(prev => ({ ...prev, [prompt.prompt_key]: e.target.value }))}
              rows={10}
              className="font-mono text-xs mt-1"
            />
            <div className="flex items-center justify-between mt-1.5">
              <span className="text-[10px] text-muted-foreground">{text.length.toLocaleString()} characters</span>
              {isChanged && <span className="text-[10px] text-amber-500 font-medium">Unsaved changes</span>}
            </div>
          </Card>
        );
      })}
    </div>
  );
}
