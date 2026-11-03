
CREATE TABLE public.grill_preview_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES public.grill_form_leads(id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  generation_number INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.grill_preview_images ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can insert preview images"
  ON public.grill_preview_images FOR INSERT WITH CHECK (true);

CREATE POLICY "Authenticated users can view preview images"
  ON public.grill_preview_images FOR SELECT TO authenticated
  USING (
    lead_id IN (
      SELECT id FROM public.grill_form_leads
      WHERE client_id = public.get_user_client_id(auth.uid())
    )
    OR public.has_role(auth.uid(), 'agency_admin')
  );

CREATE POLICY "Anonymous can read preview images"
  ON public.grill_preview_images FOR SELECT TO anon
  USING (true);
