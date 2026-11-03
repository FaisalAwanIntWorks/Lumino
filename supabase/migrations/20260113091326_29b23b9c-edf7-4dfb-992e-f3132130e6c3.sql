-- Add RLS policy for clients to delete their own saved designs (leads)
CREATE POLICY "Clients can delete their own saved designs"
ON public.saved_designs
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM clients c
    WHERE c.user_id = auth.uid()
    AND c.id = saved_designs.client_id
  )
);