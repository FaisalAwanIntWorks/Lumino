-- Create favorite_designs table
CREATE TABLE favorite_designs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  configuration jsonb NOT NULL,
  name text,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, configuration)
);

-- Enable RLS on favorite_designs
ALTER TABLE favorite_designs ENABLE ROW LEVEL SECURITY;

-- RLS Policies for favorite_designs
CREATE POLICY "Users can view own favorites"
  ON favorite_designs FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own favorites"
  ON favorite_designs FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own favorites"
  ON favorite_designs FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Create comparison_sets table
CREATE TABLE comparison_sets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  configurations jsonb[] NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS on comparison_sets
ALTER TABLE comparison_sets ENABLE ROW LEVEL SECURITY;

-- RLS Policies for comparison_sets
CREATE POLICY "Users can manage own comparisons"
  ON comparison_sets FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);