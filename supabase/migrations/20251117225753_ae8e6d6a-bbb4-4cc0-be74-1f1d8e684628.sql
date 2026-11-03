-- Create client_products junction table for product access management
CREATE TABLE IF NOT EXISTS client_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE NOT NULL,
  product_id UUID REFERENCES products(id) ON DELETE CASCADE NOT NULL,
  is_enabled BOOLEAN DEFAULT true,
  markup_percentage NUMERIC DEFAULT 100,
  custom_retail_price NUMERIC,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(client_id, product_id)
);

-- RLS policies for client_products
ALTER TABLE client_products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage all client products"
  ON client_products FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_roles 
      WHERE user_roles.user_id = auth.uid() 
      AND user_roles.role = 'agency_admin'
    )
  );

CREATE POLICY "Clients can view their own product access"
  ON client_products FOR SELECT
  USING (
    client_id IN (
      SELECT id FROM clients WHERE user_id = auth.uid()
    )
  );

-- Create AI chat tracking tables
CREATE TABLE IF NOT EXISTS ai_chat_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL,
  started_at TIMESTAMPTZ DEFAULT now(),
  ended_at TIMESTAMPTZ,
  message_count INTEGER DEFAULT 0,
  configuration_applied BOOLEAN DEFAULT false,
  design_saved BOOLEAN DEFAULT false,
  configuration_data JSONB
);

CREATE TABLE IF NOT EXISTS ai_chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES ai_chat_sessions(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  intent TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS policies for AI chat tables
ALTER TABLE ai_chat_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Clients can view their own chat sessions"
  ON ai_chat_sessions FOR SELECT
  USING (
    client_id IN (
      SELECT id FROM clients WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "System can create chat sessions"
  ON ai_chat_sessions FOR INSERT
  WITH CHECK (true);

CREATE POLICY "System can update chat sessions"
  ON ai_chat_sessions FOR UPDATE
  USING (true);

CREATE POLICY "Clients can view messages for their sessions"
  ON ai_chat_messages FOR SELECT
  USING (
    session_id IN (
      SELECT id FROM ai_chat_sessions 
      WHERE client_id IN (
        SELECT id FROM clients WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "System can create chat messages"
  ON ai_chat_messages FOR INSERT
  WITH CHECK (true);

-- Insert dummy saved designs data
INSERT INTO saved_designs (client_id, product_id, customer_name, customer_email, customer_phone, configuration, notes, follow_up_status) 
SELECT 
  c.id as client_id,
  p.id as product_id,
  'Sarah Johnson',
  'sarah.j@example.com',
  '+1-555-0123',
  '{"style":"Halo","metal":"18K White Gold","stone":"Natural","carat":1.5,"shape":"Round","size":"6.5","shank":"High Polish"}'::jsonb,
  'Interested in vintage-inspired design with extra sparkle',
  'new'
FROM clients c
CROSS JOIN LATERAL (
  SELECT id FROM products WHERE category = 'ring' LIMIT 1
) p
WHERE NOT EXISTS (
  SELECT 1 FROM saved_designs WHERE customer_email = 'sarah.j@example.com'
)
LIMIT 1;

INSERT INTO saved_designs (client_id, product_id, customer_name, customer_email, customer_phone, configuration, notes, follow_up_status) 
SELECT 
  c.id as client_id,
  p.id as product_id,
  'Michael Chen',
  'michael.chen@example.com',
  '+1-555-0456',
  '{"style":"Solitaire","metal":"Platinum","stone":"Lab-Grown","carat":2.0,"shape":"Emerald","size":"7","shank":"High Polish"}'::jsonb,
  'Looking for modern, clean design. Budget flexible.',
  'contacted'
FROM clients c
CROSS JOIN LATERAL (
  SELECT id FROM products WHERE category = 'ring' LIMIT 1
) p
WHERE NOT EXISTS (
  SELECT 1 FROM saved_designs WHERE customer_email = 'michael.chen@example.com'
)
LIMIT 1;

INSERT INTO saved_designs (client_id, product_id, customer_name, customer_email, customer_phone, configuration, notes, follow_up_status) 
SELECT 
  c.id as client_id,
  p.id as product_id,
  'Emma Rodriguez',
  'emma.r@example.com',
  '+1-555-0789',
  '{"style":"Three-Stone","metal":"14K Rose Gold","stone":"Natural","carat":1.0,"shape":"Oval","size":"5.5","shank":"Pave"}'::jsonb,
  'Prefers rose gold. Anniversary gift.',
  'quote_sent'
FROM clients c
CROSS JOIN LATERAL (
  SELECT id FROM products WHERE category = 'ring' LIMIT 1
) p
WHERE NOT EXISTS (
  SELECT 1 FROM saved_designs WHERE customer_email = 'emma.r@example.com'
)
LIMIT 1;

INSERT INTO saved_designs (client_id, product_id, customer_name, customer_email, customer_phone, configuration, notes, follow_up_status) 
SELECT 
  c.id as client_id,
  p.id as product_id,
  'James Wilson',
  'james.w@example.com',
  NULL,
  '{"style":"Pave-Rail","metal":"18K White Gold","stone":"Lab-Grown","carat":1.5,"shape":"Cushion","size":"8","shank":"3-Row Pave"}'::jsonb,
  'Very detail oriented. Asked about certification.',
  'contacted'
FROM clients c
CROSS JOIN LATERAL (
  SELECT id FROM products WHERE category = 'ring' LIMIT 1
) p
WHERE NOT EXISTS (
  SELECT 1 FROM saved_designs WHERE customer_email = 'james.w@example.com'
)
LIMIT 1;

INSERT INTO saved_designs (client_id, product_id, customer_name, customer_email, customer_phone, configuration, notes, follow_up_status) 
SELECT 
  c.id as client_id,
  p.id as product_id,
  'Olivia Martinez',
  'olivia.m@example.com',
  '+1-555-0321',
  '{"style":"Vintage","metal":"14K Yellow Gold","stone":"Natural","carat":1.5,"shape":"Round","size":"6","shank":"Channel Set"}'::jsonb,
  'Loves vintage styles. Family heirloom aesthetic.',
  'new'
FROM clients c
CROSS JOIN LATERAL (
  SELECT id FROM products WHERE category = 'ring' LIMIT 1
) p
WHERE NOT EXISTS (
  SELECT 1 FROM saved_designs WHERE customer_email = 'olivia.m@example.com'
)
LIMIT 1;