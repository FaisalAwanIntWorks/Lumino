-- Create secure RPC function for public access to client diamond presets
-- This allows anonymous embed widgets to fetch diamond presets without authentication
CREATE OR REPLACE FUNCTION public.get_client_diamond_presets(client_uuid uuid)
RETURNS TABLE (
  id uuid,
  stone_type text,
  shape_id text,
  carat_range text,
  carat_value numeric,
  color text,
  clarity text,
  base_price numeric,
  custom_price numeric,
  is_enabled boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT 
    id,
    stone_type,
    shape_id,
    carat_range,
    carat_value,
    color,
    clarity,
    base_price,
    custom_price,
    is_enabled
  FROM public.client_diamond_presets
  WHERE client_id = client_uuid
    AND is_enabled = true;
$$;

-- Grant execute permission to anonymous users for embed access
GRANT EXECUTE ON FUNCTION public.get_client_diamond_presets(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.get_client_diamond_presets(uuid) TO authenticated;