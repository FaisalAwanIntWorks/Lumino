-- Create my_master_db_data table to store CSV data
CREATE TABLE my_master_db_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unique_id TEXT NOT NULL,
  combination_id TEXT NOT NULL,
  style_name TEXT,
  shank_id TEXT,
  shank_name TEXT,
  visual_color TEXT,
  visual_color_name TEXT,
  shape_id TEXT,
  shape_name TEXT,
  folder_path TEXT,
  
  -- Image files (4 angles)
  image_0_filename TEXT,
  image_0_status BOOLEAN DEFAULT false,
  image_1_filename TEXT,
  image_1_status BOOLEAN DEFAULT false,
  image_2_filename TEXT,
  image_2_status BOOLEAN DEFAULT false,
  image_3_filename TEXT,
  image_3_status BOOLEAN DEFAULT false,
  
  -- Video & 3D Model
  video_filename TEXT,
  video_status BOOLEAN DEFAULT false,
  glb_model_filename TEXT,
  glb_model_status BOOLEAN DEFAULT false,
  
  -- Transparent images (4 angles)
  transparent_0_filename TEXT,
  transparent_0_status BOOLEAN DEFAULT false,
  transparent_1_filename TEXT,
  transparent_1_status BOOLEAN DEFAULT false,
  transparent_2_filename TEXT,
  transparent_2_status BOOLEAN DEFAULT false,
  transparent_3_filename TEXT,
  transparent_3_status BOOLEAN DEFAULT false,
  
  -- Model photo & CAD files
  model_photo_filename TEXT,
  model_photo_status BOOLEAN DEFAULT false,
  manufacture_cad_filename TEXT,
  manufacture_cad_status BOOLEAN DEFAULT false,
  rendered_cad_filename TEXT,
  rendered_cad_status BOOLEAN DEFAULT false,
  
  -- Tracking columns
  files_uploaded TEXT,
  total_files INTEGER DEFAULT 13,
  all_upload_complete BOOLEAN DEFAULT false,
  drive_link TEXT,
  last_updated TIMESTAMPTZ,
  notes TEXT,
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create indexes for fast lookups
CREATE INDEX idx_my_master_db_data_unique_id ON my_master_db_data(unique_id);
CREATE INDEX idx_my_master_db_data_combination_id ON my_master_db_data(combination_id);

-- Enable RLS
ALTER TABLE my_master_db_data ENABLE ROW LEVEL SECURITY;

-- Anyone can view (public catalog data)
CREATE POLICY "Anyone can view my_master_db_data"
  ON my_master_db_data FOR SELECT USING (true);

-- Only admins can manage
CREATE POLICY "Only admins can manage my_master_db_data"
  ON my_master_db_data FOR ALL
  USING (has_role(auth.uid(), 'agency_admin'::app_role));