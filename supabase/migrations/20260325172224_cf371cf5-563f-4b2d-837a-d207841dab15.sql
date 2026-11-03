DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'saved_designs') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE saved_designs;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'grill_form_leads') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE grill_form_leads;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'custom_enquiry_leads') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE custom_enquiry_leads;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'design_requests') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE design_requests;
  END IF;
END $$;