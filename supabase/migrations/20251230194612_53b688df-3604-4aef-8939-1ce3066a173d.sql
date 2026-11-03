-- Add 8 new columns for carat image filenames
ALTER TABLE public.my_master_db_data 
ADD COLUMN carot_image_0_filename TEXT,
ADD COLUMN carot_image_1_filename TEXT,
ADD COLUMN carot_image_2_filename TEXT,
ADD COLUMN carot_image_3_filename TEXT,
ADD COLUMN carot_image_4_filename TEXT,
ADD COLUMN carot_image_5_filename TEXT,
ADD COLUMN carot_image_6_filename TEXT,
ADD COLUMN carot_image_7_filename TEXT;