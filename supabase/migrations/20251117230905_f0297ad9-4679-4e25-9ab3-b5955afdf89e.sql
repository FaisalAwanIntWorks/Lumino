-- Insert dummy AI chat sessions with varied configurations
INSERT INTO ai_chat_sessions (client_id, session_id, started_at, ended_at, message_count, configuration_applied, design_saved, configuration_data) 
SELECT 
  c.id as client_id,
  'session_' || generate_series || '_' || substr(md5(random()::text), 1, 8) as session_id,
  NOW() - (random() * interval '30 days') as started_at,
  NOW() - (random() * interval '29 days') as ended_at,
  (random() * 12 + 3)::int as message_count,
  (random() > 0.3) as configuration_applied,
  (random() > 0.4) as design_saved,
  CASE (random() * 7)::int
    WHEN 0 THEN '{"metal": "18K White Gold", "shape": "Round", "carat": "1.5ct"}'::jsonb
    WHEN 1 THEN '{"metal": "14K Yellow Gold", "shape": "Princess", "carat": "1.0ct"}'::jsonb
    WHEN 2 THEN '{"metal": "Platinum", "shape": "Emerald", "carat": "2.0ct"}'::jsonb
    WHEN 3 THEN '{"metal": "Rose Gold", "shape": "Oval", "carat": "1.25ct"}'::jsonb
    WHEN 4 THEN '{"metal": "18K White Gold", "shape": "Cushion", "carat": "1.8ct"}'::jsonb
    WHEN 5 THEN '{"metal": "14K White Gold", "shape": "Marquise", "carat": "1.3ct"}'::jsonb
    ELSE '{"metal": "Platinum", "shape": "Pear", "carat": "1.6ct"}'::jsonb
  END as configuration_data
FROM generate_series(1, 52) as generate_series
CROSS JOIN (SELECT id FROM clients LIMIT 1) c;

-- Insert dummy orders with realistic data
INSERT INTO orders (
  client_id, 
  product_id, 
  customer_name, 
  customer_email, 
  total_amount, 
  status,
  shipping_status,
  created_at,
  configuration,
  customer_shipping,
  estimated_delivery_date
)
SELECT 
  c.id as client_id,
  p.id as product_id,
  CASE (random() * 14)::int
    WHEN 0 THEN 'Emily Chen'
    WHEN 1 THEN 'Michael Brown'
    WHEN 2 THEN 'Sarah Johnson'
    WHEN 3 THEN 'David Lee'
    WHEN 4 THEN 'Jessica Martinez'
    WHEN 5 THEN 'James Wilson'
    WHEN 6 THEN 'Ashley Garcia'
    WHEN 7 THEN 'Christopher Davis'
    WHEN 8 THEN 'Amanda Rodriguez'
    WHEN 9 THEN 'Daniel Anderson'
    WHEN 10 THEN 'Rachel Thompson'
    WHEN 11 THEN 'Matthew Taylor'
    WHEN 12 THEN 'Lauren White'
    ELSE 'Brandon Harris'
  END as customer_name,
  CASE (random() * 14)::int
    WHEN 0 THEN 'emily.chen@email.com'
    WHEN 1 THEN 'michael.brown@email.com'
    WHEN 2 THEN 'sarah.j@email.com'
    WHEN 3 THEN 'david.lee@email.com'
    WHEN 4 THEN 'jessica.m@email.com'
    WHEN 5 THEN 'james.w@email.com'
    WHEN 6 THEN 'ashley.g@email.com'
    WHEN 7 THEN 'chris.davis@email.com'
    WHEN 8 THEN 'amanda.r@email.com'
    WHEN 9 THEN 'daniel.a@email.com'
    WHEN 10 THEN 'rachel.t@email.com'
    WHEN 11 THEN 'matthew.t@email.com'
    WHEN 12 THEN 'lauren.w@email.com'
    ELSE 'brandon.h@email.com'
  END as customer_email,
  (random() * 12500 + 2500)::numeric(10,2) as total_amount,
  CASE (random() * 3)::int
    WHEN 0 THEN 'pending'
    WHEN 1 THEN 'fulfilled'
    WHEN 2 THEN 'fulfilled'
    ELSE 'pending'
  END as status,
  CASE (random() * 4)::int
    WHEN 0 THEN 'processing'
    WHEN 1 THEN 'shipped'
    WHEN 2 THEN 'in_transit'
    ELSE 'delivered'
  END as shipping_status,
  NOW() - (random() * interval '60 days') as created_at,
  '{"metal": "18K White Gold", "shape": "Round", "carat": 1.5, "engraving": "Forever & Always"}'::jsonb as configuration,
  '{"address": "123 Main St", "city": "New York", "state": "NY", "zip": "10001"}'::jsonb as customer_shipping,
  NOW() + (random() * interval '30 days') as estimated_delivery_date
FROM generate_series(1, 15) as generate_series
CROSS JOIN (SELECT id FROM clients LIMIT 1) c
CROSS JOIN (SELECT id FROM products ORDER BY random() LIMIT 1) p;

-- Add more dummy saved designs with variety
INSERT INTO saved_designs (
  client_id,
  product_id,
  customer_name,
  customer_email,
  customer_phone,
  configuration,
  follow_up_status,
  created_at,
  notes
)
SELECT 
  c.id as client_id,
  p.id as product_id,
  CASE (random() * 4)::int
    WHEN 0 THEN 'Jennifer Smith'
    WHEN 1 THEN 'Robert Taylor'
    WHEN 2 THEN 'Lisa Anderson'
    WHEN 3 THEN 'Kevin Martinez'
    ELSE 'Michelle Davis'
  END as customer_name,
  CASE (random() * 4)::int
    WHEN 0 THEN 'jennifer.s@email.com'
    WHEN 1 THEN 'robert.t@email.com'
    WHEN 2 THEN 'lisa.a@email.com'
    WHEN 3 THEN 'kevin.m@email.com'
    ELSE 'michelle.d@email.com'
  END as customer_email,
  CASE (random() * 4)::int
    WHEN 0 THEN '+1 555-0101'
    WHEN 1 THEN '+1 555-0102'
    WHEN 2 THEN '+1 555-0103'
    WHEN 3 THEN '+1 555-0104'
    ELSE '+1 555-0105'
  END as customer_phone,
  CASE (random() * 5)::int
    WHEN 0 THEN '{"metal": "Platinum", "shape": "Round", "carat": 2.0, "style": "Vintage"}'::jsonb
    WHEN 1 THEN '{"metal": "14K Yellow Gold", "shape": "Princess", "carat": 1.5, "style": "Modern"}'::jsonb
    WHEN 2 THEN '{"metal": "Rose Gold", "shape": "Oval", "carat": 1.8, "style": "Classic"}'::jsonb
    WHEN 3 THEN '{"metal": "18K White Gold", "shape": "Emerald", "carat": 1.3, "style": "Halo"}'::jsonb
    ELSE '{"metal": "Platinum", "shape": "Cushion", "carat": 2.2, "style": "Three Stone"}'::jsonb
  END as configuration,
  CASE (random() * 3)::int
    WHEN 0 THEN 'new'
    WHEN 1 THEN 'contacted'
    WHEN 2 THEN 'quote_sent'
    ELSE 'converted'
  END as follow_up_status,
  NOW() - (random() * interval '14 days') as created_at,
  CASE (random() * 3)::int
    WHEN 0 THEN 'Customer interested in customization'
    WHEN 1 THEN 'Waiting for budget approval'
    WHEN 2 THEN 'Requested additional photos'
    ELSE 'Ready to proceed with order'
  END as notes
FROM generate_series(1, 5) as generate_series
CROSS JOIN (SELECT id FROM clients LIMIT 1) c
CROSS JOIN (SELECT id FROM products ORDER BY random() LIMIT 1) p;