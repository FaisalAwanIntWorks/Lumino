-- Add new column for carat images folder path
ALTER TABLE public.my_master_db_data 
ADD COLUMN carotimages_folder_path TEXT;

-- Copy all values from folder_path to the new column
UPDATE public.my_master_db_data 
SET carotimages_folder_path = folder_path;