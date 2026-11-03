import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface Product {
  id: string;
  name: string;
  base_cost: number;
}

interface Client {
  id: string;
  company_name: string;
}

interface ClientProduct {
  id: string;
  client_id: string;
  product_id: string;
  is_enabled: boolean;
  markup_percentage: number;
  custom_retail_price: number | null;
}

export function ProductClientMatrix() {
  const [products, setProducts] = useState<Product[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [clientProducts, setClientProducts] = useState<ClientProduct[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [productsRes, clientsRes, cpRes] = await Promise.all([
        supabase.from('products').select('id, name, base_cost').eq('status', 'active'),
        supabase.from('clients').select('id, company_name').eq('status', 'active'),
        supabase.from('client_products').select('*')
      ]);

      if (productsRes.error) throw productsRes.error;
      if (clientsRes.error) throw clientsRes.error;
      if (cpRes.error) throw cpRes.error;

      setProducts(productsRes.data || []);
      setClients(clientsRes.data || []);
      setClientProducts(cpRes.data || []);
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error('Failed to load product-client matrix');
    } finally {
      setLoading(false);
    }
  };

  const getClientProduct = (productId: string, clientId: string) => {
    return clientProducts.find(cp => cp.product_id === productId && cp.client_id === clientId);
  };

  const toggleProductAccess = async (productId: string, clientId: string, currentStatus: boolean) => {
    try {
      const existingCp = getClientProduct(productId, clientId);

      if (existingCp) {
        const { error } = await supabase
          .from('client_products')
          .update({ is_enabled: !currentStatus })
          .eq('id', existingCp.id);
        
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('client_products')
          .insert({
            product_id: productId,
            client_id: clientId,
            is_enabled: true,
            markup_percentage: 100
          });
        
        if (error) throw error;
      }

      toast.success('Product access updated');
      fetchData();
    } catch (error) {
      console.error('Error updating product access:', error);
      toast.error('Failed to update product access');
    }
  };

  const updateMarkup = async (cpId: string, markup: number) => {
    try {
      const { error } = await supabase
        .from('client_products')
        .update({ markup_percentage: markup })
        .eq('id', cpId);

      if (error) throw error;
      toast.success('Markup updated');
      fetchData();
    } catch (error) {
      console.error('Error updating markup:', error);
      toast.error('Failed to update markup');
    }
  };

  if (loading) {
    return <div className="animate-pulse h-96 bg-muted rounded"></div>;
  }

  return (
    <Card className="p-6">
      <h3 className="font-semibold text-lg mb-4">Product-Client Access Matrix</h3>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b">
              <th className="text-left p-3 font-semibold sticky left-0 bg-background">Product</th>
              {clients.map(client => (
                <th key={client.id} className="text-center p-3 font-semibold min-w-[200px]">
                  {client.company_name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {products.map(product => (
              <tr key={product.id} className="border-b hover:bg-muted/50">
                <td className="p-3 font-medium sticky left-0 bg-background">
                  <div>
                    <p>{product.name}</p>
                    <p className="text-sm text-muted-foreground">${product.base_cost}</p>
                  </div>
                </td>
                {clients.map(client => {
                  const cp = getClientProduct(product.id, client.id);
                  return (
                    <td key={client.id} className="p-3 text-center">
                      <div className="flex flex-col items-center gap-2">
                        <Switch
                          checked={cp?.is_enabled || false}
                          onCheckedChange={() => toggleProductAccess(product.id, client.id, cp?.is_enabled || false)}
                        />
                        {cp?.is_enabled && (
                          <Input
                            type="number"
                            placeholder="Markup %"
                            defaultValue={cp.markup_percentage}
                            onBlur={(e) => updateMarkup(cp.id, Number(e.target.value))}
                            className="w-24 text-center"
                          />
                        )}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
