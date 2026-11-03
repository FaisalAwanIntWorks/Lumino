-- Create table to track metal prices over time
CREATE TABLE public.metal_price_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  metal_type TEXT NOT NULL, -- 'gold', 'silver', 'platinum'
  price_per_oz NUMERIC NOT NULL,
  currency TEXT DEFAULT 'USD',
  recorded_at TIMESTAMPTZ DEFAULT NOW(),
  source TEXT DEFAULT 'api'
);

-- Create index for efficient querying by metal and date
CREATE INDEX idx_metal_price_history_type_date 
ON public.metal_price_history(metal_type, recorded_at DESC);

-- Enable RLS
ALTER TABLE public.metal_price_history ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read metal prices (public market data)
CREATE POLICY "Authenticated users can read metal prices"
ON public.metal_price_history
FOR SELECT
TO authenticated
USING (true);

-- Only service role can insert/update (via edge function)
CREATE POLICY "Service role can insert metal prices"
ON public.metal_price_history
FOR INSERT
TO service_role
WITH CHECK (true);

CREATE POLICY "Service role can update metal prices"
ON public.metal_price_history
FOR UPDATE
TO service_role
USING (true);