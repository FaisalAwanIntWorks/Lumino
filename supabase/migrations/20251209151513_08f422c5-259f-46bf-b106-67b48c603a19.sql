-- Add DELETE policies for client catalog reset functionality

-- Allow clients to delete their own catalog entries
CREATE POLICY "Clients can delete their own catalog" 
ON public.client_ring_catalog 
FOR DELETE 
USING (client_id = get_user_client_id(auth.uid()));

-- Allow clients to delete their own carat options
CREATE POLICY "Clients can delete their own carat options" 
ON public.client_carat_options 
FOR DELETE 
USING (client_id = get_user_client_id(auth.uid()));

-- Allow clients to delete their own size options
CREATE POLICY "Clients can delete their own size options" 
ON public.client_size_options 
FOR DELETE 
USING (client_id = get_user_client_id(auth.uid()));