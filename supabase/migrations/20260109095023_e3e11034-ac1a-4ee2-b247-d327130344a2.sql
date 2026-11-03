-- Create client_stone_inventory table for managing diamond/stone products
CREATE TABLE public.client_stone_inventory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  stone_type TEXT NOT NULL CHECK (stone_type IN ('natural', 'lab')),
  carat NUMERIC(4,2) NOT NULL,
  color TEXT NOT NULL,
  clarity TEXT NOT NULL,
  price NUMERIC(10,2) NOT NULL,
  sku TEXT,
  is_enabled BOOLEAN DEFAULT true,
  shopify_product_id TEXT,
  shopify_variant_id TEXT,
  shopify_sync_status TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.client_stone_inventory ENABLE ROW LEVEL SECURITY;

-- RLS policies for client_stone_inventory
CREATE POLICY "Clients can view their own stones"
  ON public.client_stone_inventory
  FOR SELECT
  USING (client_id IN (SELECT id FROM public.clients WHERE user_id = auth.uid()));

CREATE POLICY "Clients can insert their own stones"
  ON public.client_stone_inventory
  FOR INSERT
  WITH CHECK (client_id IN (SELECT id FROM public.clients WHERE user_id = auth.uid()));

CREATE POLICY "Clients can update their own stones"
  ON public.client_stone_inventory
  FOR UPDATE
  USING (client_id IN (SELECT id FROM public.clients WHERE user_id = auth.uid()));

CREATE POLICY "Clients can delete their own stones"
  ON public.client_stone_inventory
  FOR DELETE
  USING (client_id IN (SELECT id FROM public.clients WHERE user_id = auth.uid()));

-- Admin staff can manage all stones
CREATE POLICY "Admin staff can manage all stones"
  ON public.client_stone_inventory
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.admin_staff_members 
      WHERE user_id = auth.uid() AND status = 'active'
    )
  );

-- Create index for common queries
CREATE INDEX idx_client_stone_inventory_client_id ON public.client_stone_inventory(client_id);
CREATE INDEX idx_client_stone_inventory_sync_status ON public.client_stone_inventory(shopify_sync_status);

-- Create trigger for updated_at
CREATE TRIGGER update_client_stone_inventory_updated_at
  BEFORE UPDATE ON public.client_stone_inventory
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();