UPDATE public.clients
SET allowed_domains = ARRAY(
  SELECT DISTINCT unnest(
    COALESCE(allowed_domains, ARRAY[]::text[]) || ARRAY['asteridiamonds.com','www.asteridiamonds.com']
  )
)
WHERE id = '693da9e8-ecfe-4ea0-9469-2d72547c5839';