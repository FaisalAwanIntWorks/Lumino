-- Allow agency_admin to view all AI chat sessions (mirrors the saved_designs admin policy)
CREATE POLICY "Admins can view all chat sessions"
  ON public.ai_chat_sessions
  FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'agency_admin'::app_role));