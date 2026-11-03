
-- Add options column to store dropdown/custom option values for questions
ALTER TABLE public.client_custom_enquiry_questions
ADD COLUMN IF NOT EXISTS options JSONB DEFAULT NULL;

-- Add comment for clarity
COMMENT ON COLUMN public.client_custom_enquiry_questions.options IS 'Stores custom options for dropdown/custom_options question types as JSON array of strings';
