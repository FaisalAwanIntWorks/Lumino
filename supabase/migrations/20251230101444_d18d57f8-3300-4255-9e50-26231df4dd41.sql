-- Add public read access for client_carat_options (needed for embed configurator)
-- Only enabled options should be visible to public for product configuration
CREATE POLICY "Public can view enabled carat options for embed" 
ON public.client_carat_options 
FOR SELECT 
USING (is_enabled = true);