REVOKE SELECT, UPDATE, DELETE ON public.diamond_form_leads FROM anon;
GRANT INSERT ON public.diamond_form_leads TO anon;
GRANT SELECT (id) ON public.diamond_form_leads TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.diamond_form_leads TO authenticated;
GRANT ALL ON public.diamond_form_leads TO service_role;

DROP POLICY IF EXISTS "Anon can read submitted diamond lead ids" ON public.diamond_form_leads;
CREATE POLICY "Anon can read submitted diamond lead ids"
ON public.diamond_form_leads
FOR SELECT
TO anon
USING (true);