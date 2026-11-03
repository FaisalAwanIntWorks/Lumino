CREATE OR REPLACE FUNCTION public._carat_display_name(p_carat numeric)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT to_char(p_carat, 'FM999990.00') || ' ct';
$$;

UPDATE public.client_carat_options
SET display_name = public._carat_display_name(carat_value)
WHERE display_name ~ '–';