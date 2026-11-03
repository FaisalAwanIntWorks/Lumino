import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

interface Variation {
  id?: string;
  metal: string;
  stone_type: string;
  shape: string;
  carat: number;
  style: string;
  shank: string;
  additional_cost: number;
  image_url: string;
}

interface VariationEditorProps {
  productId: string;
}

export function VariationEditor({ productId }: VariationEditorProps) {
  const [variations, setVariations] = useState<Variation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchVariations();
  }, [productId]);

  const fetchVariations = async () => {
    try {
      const { data, error } = await supabase
        .from('product_variations')
        .select('*')
        .eq('product_id', productId)
        .eq('is_active', true);

      if (error) throw error;
      setVariations(data || []);
    } catch (error) {
      console.error('Error fetching variations:', error);
      toast.error('Failed to load variations');
    } finally {
      setLoading(false);
    }
  };

  const addVariation = () => {
    setVariations([
      ...variations,
      {
        metal: '',
        stone_type: '',
        shape: '',
        carat: 0,
        style: '',
        shank: '',
        additional_cost: 0,
        image_url: '',
      },
    ]);
  };

  const updateVariation = (index: number, field: keyof Variation, value: any) => {
    const updated = [...variations];
    updated[index] = { ...updated[index], [field]: value };
    setVariations(updated);
  };

  const saveVariation = async (index: number) => {
    const variation = variations[index];
    
    try {
      if (variation.id) {
        // Update existing
        const { error } = await supabase
          .from('product_variations')
          .update({
            metal: variation.metal,
            stone_type: variation.stone_type,
            shape: variation.shape,
            carat: variation.carat,
            style: variation.style,
            shank: variation.shank,
            additional_cost: variation.additional_cost,
            image_url: variation.image_url,
          })
          .eq('id', variation.id);

        if (error) throw error;
      } else {
        // Insert new
        const { error } = await supabase
          .from('product_variations')
          .insert({
            product_id: productId,
            ...variation,
          });

        if (error) throw error;
      }

      toast.success('Variation saved');
      fetchVariations();
    } catch (error) {
      console.error('Error saving variation:', error);
      toast.error('Failed to save variation');
    }
  };

  const deleteVariation = async (index: number) => {
    const variation = variations[index];
    
    if (variation.id) {
      try {
        const { error } = await supabase
          .from('product_variations')
          .update({ is_active: false })
          .eq('id', variation.id);

        if (error) throw error;
        toast.success('Variation deleted');
      } catch (error) {
        console.error('Error deleting variation:', error);
        toast.error('Failed to delete variation');
      }
    }

    setVariations(variations.filter((_, i) => i !== index));
  };

  if (loading) {
    return <div className="text-center py-4">Loading variations...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">Product Variations</h3>
        <Button onClick={addVariation} size="sm">
          <Plus className="h-4 w-4 mr-2" />
          Add Variation
        </Button>
      </div>

      {variations.length === 0 ? (
        <Card className="p-8 text-center text-muted-foreground">
          No variations yet. Click "Add Variation" to create one.
        </Card>
      ) : (
        <div className="space-y-4">
          {variations.map((variation, index) => (
            <Card key={index} className="p-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Metal</Label>
                  <Input
                    value={variation.metal}
                    onChange={(e) => updateVariation(index, 'metal', e.target.value)}
                    placeholder="White Gold, Yellow Gold..."
                  />
                </div>

                <div>
                  <Label>Stone Type</Label>
                  <Input
                    value={variation.stone_type}
                    onChange={(e) => updateVariation(index, 'stone_type', e.target.value)}
                    placeholder="Diamond, Sapphire..."
                  />
                </div>

                <div>
                  <Label>Shape</Label>
                  <Input
                    value={variation.shape}
                    onChange={(e) => updateVariation(index, 'shape', e.target.value)}
                    placeholder="Round, Emerald..."
                  />
                </div>

                <div>
                  <Label>Carat</Label>
                   <Input
                     type="number"
                     step="0.01"
                     value={variation.carat || ''}
                     onChange={(e) => updateVariation(index, 'carat', e.target.value === '' ? '' : parseFloat(e.target.value))}
                     onBlur={(e) => updateVariation(index, 'carat', e.target.value === '' ? 0 : (parseFloat(e.target.value) || 0))}
                   />
                </div>

                <div>
                  <Label>Style</Label>
                  <Input
                    value={variation.style}
                    onChange={(e) => updateVariation(index, 'style', e.target.value)}
                    placeholder="Solitaire, Halo..."
                  />
                </div>

                <div>
                  <Label>Shank</Label>
                  <Input
                    value={variation.shank}
                    onChange={(e) => updateVariation(index, 'shank', e.target.value)}
                    placeholder="Plain, Pave..."
                  />
                </div>

                <div>
                  <Label>Additional Cost ($)</Label>
                   <Input
                     type="number"
                     step="0.01"
                     value={variation.additional_cost || ''}
                     onChange={(e) => updateVariation(index, 'additional_cost', e.target.value === '' ? '' : parseFloat(e.target.value))}
                     onBlur={(e) => updateVariation(index, 'additional_cost', e.target.value === '' ? 0 : (parseFloat(e.target.value) || 0))}
                  />
                </div>

                <div>
                  <Label>Image URL</Label>
                  <Input
                    value={variation.image_url}
                    onChange={(e) => updateVariation(index, 'image_url', e.target.value)}
                    placeholder="https://..."
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 mt-4">
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => deleteVariation(index)}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </Button>
                <Button size="sm" onClick={() => saveVariation(index)}>
                  Save Variation
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
