-- 1. Add manufacturing fields to products table
ALTER TABLE products ADD COLUMN IF NOT EXISTS manufacturing_cost numeric;

-- 2. Add manufacturing options to client_products
ALTER TABLE client_products ADD COLUMN IF NOT EXISTS allow_self_manufacturing boolean DEFAULT true;
ALTER TABLE client_products ADD COLUMN IF NOT EXISTS allow_jewelx_manufacturing boolean DEFAULT false;

-- 3. Enhance design_requests table
ALTER TABLE design_requests 
  ADD COLUMN IF NOT EXISTS reference_images text[],
  ADD COLUMN IF NOT EXISTS metal_preference text,
  ADD COLUMN IF NOT EXISTS stone_preference text,
  ADD COLUMN IF NOT EXISTS size text,
  ADD COLUMN IF NOT EXISTS special_requirements text;

-- 4. Create CRM integrations table
CREATE TABLE IF NOT EXISTS crm_integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  provider text NOT NULL,
  api_key text,
  webhook_url text,
  is_active boolean DEFAULT false,
  last_synced_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 5. Add RLS policies for crm_integrations
ALTER TABLE crm_integrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Clients can manage own CRM integrations"
  ON crm_integrations
  FOR ALL
  USING (client_id = get_user_client_id(auth.uid()));