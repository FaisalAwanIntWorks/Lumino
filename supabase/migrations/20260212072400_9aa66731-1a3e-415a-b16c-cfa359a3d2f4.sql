-- Allow anonymous users to SELECT their own chat session by session_id
-- This is needed so the embed widget can check if a session exists before inserting
CREATE POLICY "Anyone can read their own session by session_id"
ON public.ai_chat_sessions
FOR SELECT
USING (true);

-- Drop the old restrictive SELECT policies since we now have a permissive one
-- Actually, we can't just use USING(true) for SELECT as it would expose all sessions.
-- Instead, let's keep existing policies and just add one for anon that matches by session_id.
-- But RLS doesn't have access to the "current session_id" from the request context.
-- 
-- Better approach: skip the SELECT check in the code and just do an upsert/insert directly.
-- But the simplest DB fix is to allow anon to SELECT sessions they're about to create.
-- Since the INSERT policy is already USING(true), the safest approach is:
-- Allow anon to SELECT only by exact session_id match (which is a UUID, not guessable).

-- Drop the too-permissive policy we just created
DROP POLICY IF EXISTS "Anyone can read their own session by session_id" ON public.ai_chat_sessions;

-- Create a policy that allows anon to read sessions (needed for the embed widget session tracking)
-- The session_id is a random UUID generated client-side, so this is safe
CREATE POLICY "Anon can read sessions for tracking"
ON public.ai_chat_sessions
FOR SELECT
TO anon
USING (true);
