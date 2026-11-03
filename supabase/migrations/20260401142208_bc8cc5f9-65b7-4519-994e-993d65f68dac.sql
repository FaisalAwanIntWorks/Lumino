
CREATE TABLE public.carat_size_images (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  diamond_shape TEXT NOT NULL,
  folder_path TEXT,
  image_0_filename TEXT,
  image_1_filename TEXT,
  image_2_filename TEXT,
  image_3_filename TEXT,
  image_4_filename TEXT,
  image_5_filename TEXT,
  image_6_filename TEXT,
  image_7_filename TEXT,
  image_8_filename TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.carat_size_images ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read carat_size_images"
  ON public.carat_size_images FOR SELECT
  USING (true);

CREATE POLICY "Admins can manage carat_size_images"
  ON public.carat_size_images FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'agency_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'agency_admin'));
