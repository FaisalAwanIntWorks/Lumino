import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { VariationEditor } from './VariationEditor';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface Product {
  id: string;
  name: string;
  description: string;
  category: string;
  base_cost: number;
  manufacturing_cost: number | null;
  image_urls: string[];
  cad_file_url: string | null;
  model_3d_url: string | null;
}

interface ProductEditDialogProps {
  product: Product | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: () => void;
}

export function ProductEditDialog({ product, open, onOpenChange, onSave }: ProductEditDialogProps) {
  const [formData, setFormData] = useState<Partial<Product>>({});
  const [allowManufacturing, setAllowManufacturing] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (product) {
      setFormData(product);
      setAllowManufacturing(product.manufacturing_cost !== null);
    }
  }, [product]);

  const handleSave = async () => {
    if (!product) return;

    setSaving(true);
    try {
      const updateData: any = {
        name: formData.name,
        description: formData.description,
        category: formData.category,
        base_cost: formData.base_cost,
        manufacturing_cost: allowManufacturing ? formData.manufacturing_cost : null,
        image_urls: formData.image_urls,
        cad_file_url: formData.cad_file_url,
        model_3d_url: formData.model_3d_url,
      };

      const { error } = await supabase
        .from('products')
        .update(updateData)
        .eq('id', product.id);

      if (error) throw error;

      toast.success('Product updated successfully');
      onSave();
      onOpenChange(false);
    } catch (error) {
      console.error('Error updating product:', error);
      toast.error('Failed to update product');
    } finally {
      setSaving(false);
    }
  };

  if (!product) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Product</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="details" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="details">Product Details</TabsTrigger>
            <TabsTrigger value="variations">Variations</TabsTrigger>
          </TabsList>

          <TabsContent value="details" className="space-y-4 mt-4">
            <div className="grid gap-4">
              <div>
                <Label htmlFor="name">Product Name</Label>
                <Input
                  id="name"
                  value={formData.name || ''}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                />
              </div>

              <div>
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={formData.description || ''}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows={3}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="category">Category</Label>
                  <Input
                    id="category"
                    value={formData.category || ''}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  />
                </div>

                 <div>
                   <Label htmlFor="base_cost">Base Cost ($)</Label>
                   <Input
                     id="base_cost"
                     type="number"
                     step="0.01"
                     value={formData.base_cost ?? ''}
                     onChange={(e) => setFormData({ ...formData, base_cost: e.target.value === '' ? undefined : parseFloat(e.target.value) as any })}
                     onBlur={(e) => setFormData({ ...formData, base_cost: e.target.value === '' ? 0 : (parseFloat(e.target.value) || 0) })}
                  />
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Allow Manufacturing</Label>
                  <p className="text-sm text-muted-foreground">
                    Enable manufacturing options for this product
                  </p>
                </div>
                <Switch
                  checked={allowManufacturing}
                  onCheckedChange={setAllowManufacturing}
                />
              </div>

              {allowManufacturing && (
                <div>
                  <Label htmlFor="manufacturing_cost">Manufacturing Cost ($)</Label>
                   <Input
                     id="manufacturing_cost"
                     type="number"
                     step="0.01"
                     value={formData.manufacturing_cost ?? ''}
                     onChange={(e) => setFormData({ ...formData, manufacturing_cost: e.target.value === '' ? undefined : parseFloat(e.target.value) as any })}
                     onBlur={(e) => setFormData({ ...formData, manufacturing_cost: e.target.value === '' ? 0 : (parseFloat(e.target.value) || 0) })}
                   />
                </div>
              )}

              <div>
                <Label htmlFor="image_urls">Image URLs (one per line)</Label>
                <Textarea
                  id="image_urls"
                  value={(formData.image_urls || []).join('\n')}
                  onChange={(e) => setFormData({ ...formData, image_urls: e.target.value.split('\n').filter(Boolean) })}
                  rows={3}
                  placeholder="https://example.com/image1.jpg"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="cad_file_url">CAD File URL</Label>
                  <Input
                    id="cad_file_url"
                    value={formData.cad_file_url || ''}
                    onChange={(e) => setFormData({ ...formData, cad_file_url: e.target.value })}
                  />
                </div>

                <div>
                  <Label htmlFor="model_3d_url">3D Model URL</Label>
                  <Input
                    id="model_3d_url"
                    value={formData.model_3d_url || ''}
                    onChange={(e) => setFormData({ ...formData, model_3d_url: e.target.value })}
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="variations">
            <VariationEditor productId={product.id} />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
