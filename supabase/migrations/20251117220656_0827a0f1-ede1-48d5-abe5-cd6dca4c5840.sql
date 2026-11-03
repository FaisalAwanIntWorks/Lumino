-- Create storage bucket for product assets
INSERT INTO storage.buckets (id, name, public)
VALUES ('product-assets', 'product-assets', true);

-- Add RLS policies for product-assets bucket
CREATE POLICY "Admins can upload product assets"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'product-assets' AND
  has_role(auth.uid(), 'agency_admin'::app_role)
);

CREATE POLICY "Admins can update product assets"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'product-assets' AND
  has_role(auth.uid(), 'agency_admin'::app_role)
);

CREATE POLICY "Admins can delete product assets"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'product-assets' AND
  has_role(auth.uid(), 'agency_admin'::app_role)
);

CREATE POLICY "Anyone can view product assets"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'product-assets');

-- Create ai_configurations table
CREATE TABLE ai_configurations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  system_prompt TEXT NOT NULL DEFAULT 'You are a helpful jewelry expert assistant.',
  model_name TEXT DEFAULT 'google/gemini-2.5-flash',
  temperature NUMERIC DEFAULT 0.7,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS on ai_configurations
ALTER TABLE ai_configurations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Clients can view their own AI config"
ON ai_configurations FOR SELECT
USING (client_id = get_user_client_id(auth.uid()));

CREATE POLICY "Clients can update their own AI config"
ON ai_configurations FOR UPDATE
USING (client_id = get_user_client_id(auth.uid()));

CREATE POLICY "Clients can insert their own AI config"
ON ai_configurations FOR INSERT
WITH CHECK (client_id = get_user_client_id(auth.uid()));

CREATE POLICY "Admins can view all AI configs"
ON ai_configurations FOR SELECT
USING (has_role(auth.uid(), 'agency_admin'::app_role));

-- Create ai_training_examples table
CREATE TABLE ai_training_examples (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS on ai_training_examples
ALTER TABLE ai_training_examples ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Clients can manage their own training examples"
ON ai_training_examples FOR ALL
USING (client_id = get_user_client_id(auth.uid()));

CREATE POLICY "Admins can view all training examples"
ON ai_training_examples FOR SELECT
USING (has_role(auth.uid(), 'agency_admin'::app_role));

-- Add trigger for updated_at on ai_configurations
CREATE TRIGGER update_ai_configurations_updated_at
BEFORE UPDATE ON ai_configurations
FOR EACH ROW
EXECUTE FUNCTION handle_updated_at();