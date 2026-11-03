-- Create table for client-specific option pricing
CREATE TABLE public.client_option_prices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  option_type TEXT NOT NULL, -- 'style', 'shank', 'metal'
  option_id TEXT NOT NULL,   -- 'solitaire', 'high-polish', '14k-yellow', etc.
  price NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(client_id, option_type, option_id)
);

-- Enable RLS
ALTER TABLE public.client_option_prices ENABLE ROW LEVEL SECURITY;

-- Clients can manage their own prices
CREATE POLICY "Clients can manage their own option prices"
ON public.client_option_prices
FOR ALL
USING (client_id = get_user_client_id(auth.uid()));

-- Admins can view all
CREATE POLICY "Admins can view all option prices"
ON public.client_option_prices
FOR SELECT
USING (has_role(auth.uid(), 'agency_admin'::app_role));

-- Create index for faster lookups
CREATE INDEX idx_client_option_prices_client_id ON public.client_option_prices(client_id);
CREATE INDEX idx_client_option_prices_lookup ON public.client_option_prices(client_id, option_type);