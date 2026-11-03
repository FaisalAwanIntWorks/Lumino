-- Add images_filepath column to client_carat_options
ALTER TABLE public.client_carat_options 
ADD COLUMN IF NOT EXISTS images_filepath TEXT;