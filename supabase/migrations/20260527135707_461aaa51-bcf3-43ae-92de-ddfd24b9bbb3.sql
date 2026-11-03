-- Add customer email branding columns to clients
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS email_logo_url text,
  ADD COLUMN IF NOT EXISTS customer_email_cta_label text,
  ADD COLUMN IF NOT EXISTS customer_email_cta_url text;

-- Public bucket for client branding assets (logos)
INSERT INTO storage.buckets (id, name, public)
VALUES ('client-branding', 'client-branding', true)
ON CONFLICT (id) DO NOTHING;

-- Helper: extract client_id (first folder) from object name and check ownership
-- Policies: an authenticated user can manage objects under {their_client_id}/...
DROP POLICY IF EXISTS "Client branding public read" ON storage.objects;
CREATE POLICY "Client branding public read"
ON storage.objects FOR SELECT
USING (bucket_id = 'client-branding');

DROP POLICY IF EXISTS "Client branding owner insert" ON storage.objects;

CREATE POLICY "Client branding owner insert"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'client-branding'
  AND EXISTS (
    SELECT 1 FROM public.clients c
    WHERE c.user_id = auth.uid()
      AND c.id::text = (storage.foldername(name))[1]
  )
);

DROP POLICY IF EXISTS "Client branding owner update" ON storage.objects;

CREATE POLICY "Client branding owner update"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'client-branding'
  AND EXISTS (
    SELECT 1 FROM public.clients c
    WHERE c.user_id = auth.uid()
      AND c.id::text = (storage.foldername(name))[1]
  )
);

DROP POLICY IF EXISTS "Client branding owner delete" ON storage.objects;

CREATE POLICY "Client branding owner delete"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'client-branding'
  AND EXISTS (
    SELECT 1 FROM public.clients c
    WHERE c.user_id = auth.uid()
      AND c.id::text = (storage.foldername(name))[1]
  )
);