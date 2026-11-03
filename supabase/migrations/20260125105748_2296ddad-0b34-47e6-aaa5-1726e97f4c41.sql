-- Drop and recreate get_client_branding function with widget_theme
DROP FUNCTION IF EXISTS public.get_client_branding(UUID);

CREATE FUNCTION public.get_client_branding(client_uuid UUID)
RETURNS TABLE (
  id UUID,
  company_name TEXT,
  logo_url TEXT,
  branding_config JSONB,
  allowed_domains TEXT[],
  widget_theme TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    c.id,
    c.company_name,
    c.logo_url,
    c.branding_config,
    c.allowed_domains,
    c.widget_theme
  FROM public.clients c
  WHERE c.id = client_uuid;
$$;

-- Grant execute on the function to anon for embed access
GRANT EXECUTE ON FUNCTION public.get_client_branding(UUID) TO anon;
GRANT EXECUTE ON FUNCTION public.get_client_branding(UUID) TO authenticated;