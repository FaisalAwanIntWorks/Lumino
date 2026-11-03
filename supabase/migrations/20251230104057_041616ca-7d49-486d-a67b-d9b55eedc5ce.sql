-- Rename columns from image_X-Y format to image_filename_N format
ALTER TABLE public.client_carat_options 
  RENAME COLUMN "image_0.5-1" TO image_filename_0;

ALTER TABLE public.client_carat_options 
  RENAME COLUMN "image_1-1.5" TO image_filename_1;

ALTER TABLE public.client_carat_options 
  RENAME COLUMN "image_1.5-2" TO image_filename_2;

ALTER TABLE public.client_carat_options 
  RENAME COLUMN "image_2-2.5" TO image_filename_3;

ALTER TABLE public.client_carat_options 
  RENAME COLUMN "image_2.5-3" TO image_filename_4;

ALTER TABLE public.client_carat_options 
  RENAME COLUMN "image_3-3.5" TO image_filename_5;

ALTER TABLE public.client_carat_options 
  RENAME COLUMN "image_3.5-4" TO image_filename_6;

ALTER TABLE public.client_carat_options 
  RENAME COLUMN "image_4-5" TO image_filename_7;