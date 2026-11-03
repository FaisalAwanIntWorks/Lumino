-- Add manufacturing and commission tracking fields to orders table
ALTER TABLE public.orders
ADD COLUMN IF NOT EXISTS commission_collected boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS customer_requested_manufacturing boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS manufacturing_status text DEFAULT 'new_request',
ADD COLUMN IF NOT EXISTS manufacturing_notes text,
ADD COLUMN IF NOT EXISTS manufacturing_cad_files text[];

-- Add check constraint for manufacturing_status
ALTER TABLE public.orders
DROP CONSTRAINT IF EXISTS orders_manufacturing_status_check;

ALTER TABLE public.orders
ADD CONSTRAINT orders_manufacturing_status_check 
CHECK (manufacturing_status IN ('new_request', 'under_review', 'quote_sent', 'approved', 'in_production', 'completed'));

-- Insert 15 dummy manufacturing orders for Demo Client
INSERT INTO orders (
  client_id,
  product_id,
  customer_name,
  customer_email,
  total_amount,
  status,
  configuration,
  customer_requested_manufacturing,
  manufacturing_status,
  manufacturing_notes,
  commission_deducted,
  commission_collected,
  created_at,
  customer_shipping
)
SELECT 
  'e02e4bb7-30fa-4f45-967d-0bedbf980506'::uuid,
  p.id,
  customer_name,
  customer_email,
  total_amount,
  order_status,
  configuration::jsonb,
  true,
  mfg_status,
  notes,
  (total_amount * 0.10),
  collected,
  NOW() - (days_ago || ' days')::interval,
  '{"address":"123 Custom St, Manufacturing City"}'::jsonb
FROM (VALUES
  ('Jennifer Adams', 'jadams@email.com', 8500.00, 'pending', '{"style":"Custom Halo","metal":"Platinum","stone":"Natural","carat":2.5,"shape":"Cushion","specialRequests":"Vintage milgrain detail"}', 'under_review', 'Customer wants intricate vintage details. Reviewing feasibility.', false, '12'),
  ('Marcus Thompson', 'mthompson@email.com', 15200.00, 'pending', '{"style":"Custom Three Stone","metal":"18K White Gold","stone":"Natural","carat":3.0,"shape":"Emerald","specialRequests":"Hidden halo, pave band"}', 'quote_sent', 'Quote sent for $15,200. Awaiting customer approval.', false, '8'),
  ('Rachel Kim', 'rkim@email.com', 6800.00, 'pending', '{"style":"Custom Solitaire","metal":"Rose Gold","stone":"Lab-Grown","carat":1.8,"shape":"Oval","specialRequests":"Twisted band design"}', 'in_production', 'CAD approved. Manufacturing in progress. ETA 2 weeks.', false, '18'),
  ('David Chen', 'dchen@email.com', 12300.00, 'fulfilled', '{"style":"Custom Vintage","metal":"Yellow Gold","stone":"Natural","carat":2.2,"shape":"Round","specialRequests":"Art deco inspired"}', 'completed', 'Manufacturing completed. Ready for delivery.', true, '35'),
  ('Lisa Martinez', 'lmartinez@email.com', 4200.00, 'pending', '{"type":"Grill","metal":"White Gold","teeth":"Top 6","style":"Open Face","specialRequests":"Diamond cuts on canines"}', 'new_request', 'New custom grill request. Initial review pending.', false, '3'),
  ('Brandon Lee', 'blee@email.com', 18500.00, 'pending', '{"style":"Custom Halo","metal":"Platinum","stone":"Natural","carat":3.5,"shape":"Radiant","specialRequests":"Double halo, micropave"}', 'quote_sent', 'Premium design. Quote sent. Follow-up scheduled.', false, '6'),
  ('Ashley Wilson', 'awilson@email.com', 5600.00, 'pending', '{"style":"Custom Solitaire","metal":"14K White Gold","stone":"Lab-Grown","carat":1.5,"shape":"Princess","specialRequests":"Cathedral setting"}', 'approved', 'Design approved. Starting CAD modeling.', false, '14'),
  ('Michael Brown', 'mbrown@email.com', 9200.00, 'fulfilled', '{"style":"Custom Three Stone","metal":"Platinum","stone":"Natural","carat":2.0,"shape":"Oval","specialRequests":"Tapered baguettes"}', 'completed', 'Delivered. Customer very satisfied.', true, '42'),
  ('Sophie Taylor', 'staylor@email.com', 3800.00, 'pending', '{"type":"Grill","metal":"Yellow Gold","teeth":"Bottom 8","style":"Full Set","specialRequests":"Smooth finish, no diamonds"}', 'under_review', 'Reviewing dental impressions for fit.', false, '5'),
  ('James Rodriguez', 'jrodriguez@email.com', 22000.00, 'pending', '{"style":"Custom Halo","metal":"Platinum","stone":"Natural","carat":4.0,"shape":"Cushion","specialRequests":"Triple halo, hidden diamonds"}', 'new_request', 'High-value custom order. Requires senior designer review.', false, '2'),
  ('Emily Davis', 'edavis@email.com', 7100.00, 'pending', '{"style":"Custom Vintage","metal":"Rose Gold","stone":"Lab-Grown","carat":1.6,"shape":"Pear","specialRequests":"Filigree details"}', 'in_production', 'Filigree work in progress. Very intricate design.', false, '21'),
  ('Ryan Harris', 'rharris@email.com', 5200.00, 'fulfilled', '{"type":"Grill","metal":"White Gold","teeth":"Top 8","style":"Open Face","specialRequests":"Diamond dust finish"}', 'completed', 'Custom grill completed and shipped.', true, '28'),
  ('Victoria Lopez', 'vlopez@email.com', 11800.00, 'pending', '{"style":"Custom Solitaire","metal":"Platinum","stone":"Natural","carat":2.8,"shape":"Emerald","specialRequests":"Art deco band"}', 'quote_sent', 'Detailed quote with design mockups sent.', false, '7'),
  ('Nathan White', 'nwhite@email.com', 6900.00, 'pending', '{"style":"Custom Three Stone","metal":"Yellow Gold","stone":"Natural","carat":1.8,"shape":"Round","specialRequests":"Vintage bezel settings"}', 'approved', 'CAD files approved. Moving to casting.', false, '16'),
  ('Megan Clark', 'mclark@email.com', 14500.00, 'fulfilled', '{"style":"Custom Halo","metal":"18K White Gold","stone":"Natural","carat":2.6,"shape":"Oval","specialRequests":"Petal halo design"}', 'completed', 'Beautiful execution. Customer left 5-star review.', true, '38')
) AS mfg_orders(customer_name, customer_email, total_amount, order_status, configuration, mfg_status, notes, collected, days_ago)
CROSS JOIN LATERAL (
  SELECT id FROM products 
  WHERE category = 'Engagement Rings' OR category = 'Grills'
  ORDER BY random() 
  LIMIT 1
) p
WHERE EXISTS (SELECT 1 FROM public.clients WHERE id = 'e02e4bb7-30fa-4f45-967d-0bedbf980506'::uuid);
