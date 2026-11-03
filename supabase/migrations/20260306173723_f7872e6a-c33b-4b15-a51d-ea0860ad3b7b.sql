CREATE POLICY "Allow public insert for design requests"
ON public.design_requests
FOR INSERT
TO anon, authenticated
WITH CHECK (true);