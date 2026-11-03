
CREATE TABLE public.my_master_db_data_backup AS
SELECT * FROM public.my_master_db_data;

-- Add a primary key to the backup table
ALTER TABLE public.my_master_db_data_backup
  ADD CONSTRAINT my_master_db_data_backup_pkey PRIMARY KEY (id);
