-- Allow public access to client branding for embeds
CREATE POLICY "Public can view client branding for embeds"
ON public.clients
FOR SELECT
USING (true);

-- Enable realtime for clients table so embeds sync instantly
ALTER PUBLICATION supabase_realtime ADD TABLE public.clients;