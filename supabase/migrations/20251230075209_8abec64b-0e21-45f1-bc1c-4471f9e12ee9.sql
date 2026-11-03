-- Add image columns for different carat ranges to client_carat_options table
ALTER TABLE public.client_carat_options 
ADD COLUMN IF NOT EXISTS "image_0.5-1" text,
ADD COLUMN IF NOT EXISTS "image_1-1.5" text,
ADD COLUMN IF NOT EXISTS "image_1.5-2" text,
ADD COLUMN IF NOT EXISTS "image_2-2.5" text,
ADD COLUMN IF NOT EXISTS "image_2.5-3" text,
ADD COLUMN IF NOT EXISTS "image_3-3.5" text,
ADD COLUMN IF NOT EXISTS "image_3.5-4" text,
ADD COLUMN IF NOT EXISTS "image_4-5" text;