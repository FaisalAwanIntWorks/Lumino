UPDATE public.my_master_db_data
SET transparent_0_filename = transparent_0_filename || '.png'
WHERE transparent_0_filename IS NOT NULL AND transparent_0_filename !~* '\.(png|jpg|jpeg|webp|avif)$';

UPDATE public.my_master_db_data
SET transparent_1_filename = transparent_1_filename || '.png'
WHERE transparent_1_filename IS NOT NULL AND transparent_1_filename !~* '\.(png|jpg|jpeg|webp|avif)$';

UPDATE public.my_master_db_data
SET transparent_2_filename = transparent_2_filename || '.png'
WHERE transparent_2_filename IS NOT NULL AND transparent_2_filename !~* '\.(png|jpg|jpeg|webp|avif)$';

UPDATE public.my_master_db_data
SET transparent_3_filename = transparent_3_filename || '.png'
WHERE transparent_3_filename IS NOT NULL AND transparent_3_filename !~* '\.(png|jpg|jpeg|webp|avif)$';