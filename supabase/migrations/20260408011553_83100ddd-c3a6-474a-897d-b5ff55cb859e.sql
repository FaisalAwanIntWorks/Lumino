DROP FUNCTION IF EXISTS public.get_client_diamond_presets(uuid);

CREATE FUNCTION public.get_client_diamond_presets(client_uuid uuid)
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
  is_enabled boolean,
  cut_grade text,
  fluorescence text
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
    is_enabled,
    cut_grade,
    fluorescence
  FROM public.client_diamond_presets
  WHERE client_id = client_uuid
    AND is_enabled = true;
$$;