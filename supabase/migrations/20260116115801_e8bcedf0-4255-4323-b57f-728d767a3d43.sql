-- Allow staff members (linked to a client) to view/edit AI training + configuration based on staff_members.permissions.catalog_access
-- catalog_access values supported: true / 'true' (view), 'edit' (edit)

-- =============== ai_training_examples ===============
CREATE POLICY "Staff with catalog access can view training examples"
ON public.ai_training_examples
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.staff_members sm
    WHERE sm.user_id = auth.uid()
      AND sm.client_id = ai_training_examples.client_id
      AND (
        sm.permissions->>'catalog_access' = 'true'
        OR lower(sm.permissions->>'catalog_access') = 'edit'
      )
  )
);

CREATE POLICY "Staff with edit access can insert training examples"
ON public.ai_training_examples
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.staff_members sm
    WHERE sm.user_id = auth.uid()
      AND sm.client_id = ai_training_examples.client_id
      AND lower(sm.permissions->>'catalog_access') = 'edit'
  )
);

CREATE POLICY "Staff with edit access can update training examples"
ON public.ai_training_examples
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.staff_members sm
    WHERE sm.user_id = auth.uid()
      AND sm.client_id = ai_training_examples.client_id
      AND lower(sm.permissions->>'catalog_access') = 'edit'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.staff_members sm
    WHERE sm.user_id = auth.uid()
      AND sm.client_id = ai_training_examples.client_id
      AND lower(sm.permissions->>'catalog_access') = 'edit'
  )
);

CREATE POLICY "Staff with edit access can delete training examples"
ON public.ai_training_examples
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.staff_members sm
    WHERE sm.user_id = auth.uid()
      AND sm.client_id = ai_training_examples.client_id
      AND lower(sm.permissions->>'catalog_access') = 'edit'
  )
);

-- =============== ai_configurations ===============
CREATE POLICY "Staff with catalog access can view AI configurations"
ON public.ai_configurations
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.staff_members sm
    WHERE sm.user_id = auth.uid()
      AND sm.client_id = ai_configurations.client_id
      AND (
        sm.permissions->>'catalog_access' = 'true'
        OR lower(sm.permissions->>'catalog_access') = 'edit'
      )
  )
);

CREATE POLICY "Staff with edit access can insert AI configurations"
ON public.ai_configurations
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.staff_members sm
    WHERE sm.user_id = auth.uid()
      AND sm.client_id = ai_configurations.client_id
      AND lower(sm.permissions->>'catalog_access') = 'edit'
  )
);

CREATE POLICY "Staff with edit access can update AI configurations"
ON public.ai_configurations
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.staff_members sm
    WHERE sm.user_id = auth.uid()
      AND sm.client_id = ai_configurations.client_id
      AND lower(sm.permissions->>'catalog_access') = 'edit'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.staff_members sm
    WHERE sm.user_id = auth.uid()
      AND sm.client_id = ai_configurations.client_id
      AND lower(sm.permissions->>'catalog_access') = 'edit'
  )
);

-- =============== ai_documents ===============
CREATE POLICY "Staff with catalog access can view AI documents"
ON public.ai_documents
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.staff_members sm
    WHERE sm.user_id = auth.uid()
      AND sm.client_id = ai_documents.client_id
      AND (
        sm.permissions->>'catalog_access' = 'true'
        OR lower(sm.permissions->>'catalog_access') = 'edit'
      )
  )
);

CREATE POLICY "Staff with edit access can insert AI documents"
ON public.ai_documents
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.staff_members sm
    WHERE sm.user_id = auth.uid()
      AND sm.client_id = ai_documents.client_id
      AND lower(sm.permissions->>'catalog_access') = 'edit'
  )
);

CREATE POLICY "Staff with edit access can update AI documents"
ON public.ai_documents
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.staff_members sm
    WHERE sm.user_id = auth.uid()
      AND sm.client_id = ai_documents.client_id
      AND lower(sm.permissions->>'catalog_access') = 'edit'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.staff_members sm
    WHERE sm.user_id = auth.uid()
      AND sm.client_id = ai_documents.client_id
      AND lower(sm.permissions->>'catalog_access') = 'edit'
  )
);

CREATE POLICY "Staff with edit access can delete AI documents"
ON public.ai_documents
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.staff_members sm
    WHERE sm.user_id = auth.uid()
      AND sm.client_id = ai_documents.client_id
      AND lower(sm.permissions->>'catalog_access') = 'edit'
  )
);

-- =============== ai_document_chunks ===============
CREATE POLICY "Staff with catalog access can view AI document chunks"
ON public.ai_document_chunks
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.staff_members sm
    WHERE sm.user_id = auth.uid()
      AND sm.client_id = ai_document_chunks.client_id
      AND (
        sm.permissions->>'catalog_access' = 'true'
        OR lower(sm.permissions->>'catalog_access') = 'edit'
      )
  )
);

CREATE POLICY "Staff with edit access can insert AI document chunks"
ON public.ai_document_chunks
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.staff_members sm
    WHERE sm.user_id = auth.uid()
      AND sm.client_id = ai_document_chunks.client_id
      AND lower(sm.permissions->>'catalog_access') = 'edit'
  )
);

CREATE POLICY "Staff with edit access can update AI document chunks"
ON public.ai_document_chunks
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.staff_members sm
    WHERE sm.user_id = auth.uid()
      AND sm.client_id = ai_document_chunks.client_id
      AND lower(sm.permissions->>'catalog_access') = 'edit'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.staff_members sm
    WHERE sm.user_id = auth.uid()
      AND sm.client_id = ai_document_chunks.client_id
      AND lower(sm.permissions->>'catalog_access') = 'edit'
  )
);

CREATE POLICY "Staff with edit access can delete AI document chunks"
ON public.ai_document_chunks
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.staff_members sm
    WHERE sm.user_id = auth.uid()
      AND sm.client_id = ai_document_chunks.client_id
      AND lower(sm.permissions->>'catalog_access') = 'edit'
  )
);

-- =============== ai_chat_sessions (analytics visibility) ===============
CREATE POLICY "Staff with catalog access can view AI chat sessions"
ON public.ai_chat_sessions
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.staff_members sm
    WHERE sm.user_id = auth.uid()
      AND sm.client_id = ai_chat_sessions.client_id
      AND (
        sm.permissions->>'catalog_access' = 'true'
        OR lower(sm.permissions->>'catalog_access') = 'edit'
      )
  )
);
