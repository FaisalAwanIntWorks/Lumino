-- Allow public/anon read access to client onboarding preferences for embed widget
CREATE POLICY "Allow public read of client preferences by client_id"
ON client_onboarding_preferences FOR SELECT
TO anon
USING (true);

-- Allow public/anon read access to client metal variants for embed widget
CREATE POLICY "Allow public read of client metal variants by client_id"
ON client_metal_variants FOR SELECT
TO anon
USING (true);

-- Allow public/anon read access to client option prices for embed widget
CREATE POLICY "Allow public read of client option prices by client_id"
ON client_option_prices FOR SELECT
TO anon
USING (true);