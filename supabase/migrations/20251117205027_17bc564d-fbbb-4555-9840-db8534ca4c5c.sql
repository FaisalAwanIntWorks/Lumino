-- Ensure a default agency exists and create a demo client user
DO $$
DECLARE
  agency_rec RECORD;
  demo_client_id uuid;
BEGIN
  -- Ensure at least one agency exists
  SELECT id INTO agency_rec FROM public.agencies LIMIT 1;
  IF agency_rec.id IS NULL THEN
    INSERT INTO public.agencies (name, primary_color, secondary_color)
    VALUES ('Jewlx', '#6366F1', '#E8B4B8');
    SELECT id INTO agency_rec FROM public.agencies LIMIT 1;
  END IF;

  -- Create demo client user if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'client@demo.com') THEN
    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change
    )
    VALUES (
      '00000000-0000-0000-0000-000000000000',
      gen_random_uuid(),
      'authenticated',
      'authenticated',
      'client@demo.com',
      crypt(gen_random_uuid()::text, gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}',
      '{"company_name":"Demo Client"}',
      now(),
      now(),
      '', '', '', ''
    );
  END IF;

  -- Ensure user role for demo client
  SELECT id INTO demo_client_id FROM auth.users WHERE email = 'client@demo.com' LIMIT 1;
  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = demo_client_id AND role = 'client'
  ) THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (demo_client_id, 'client');
  END IF;

  -- Ensure client record exists for demo client
  IF NOT EXISTS (SELECT 1 FROM public.clients WHERE user_id = demo_client_id) THEN
    INSERT INTO public.clients (user_id, agency_id, company_name, email, status)
    VALUES (demo_client_id, agency_rec.id, 'Demo Client', 'client@demo.com', 'active');
  END IF;
END $$;