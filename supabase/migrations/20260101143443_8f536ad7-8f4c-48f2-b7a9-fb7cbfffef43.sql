-- Enable pgvector extension for embeddings
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;

-- Create ai_documents table for storing uploaded document metadata
CREATE TABLE public.ai_documents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'processing' CHECK (status IN ('processing', 'ready', 'error')),
  chunk_count INTEGER DEFAULT 0,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create ai_document_chunks table for storing text chunks with embeddings
CREATE TABLE public.ai_document_chunks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  document_id UUID NOT NULL REFERENCES public.ai_documents(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  embedding extensions.vector(768),
  chunk_index INTEGER NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create index for vector similarity search
CREATE INDEX ai_document_chunks_embedding_idx ON public.ai_document_chunks 
USING ivfflat (embedding extensions.vector_cosine_ops) WITH (lists = 100);

-- Create index for client_id lookup
CREATE INDEX ai_document_chunks_client_id_idx ON public.ai_document_chunks(client_id);
CREATE INDEX ai_documents_client_id_idx ON public.ai_documents(client_id);

-- Enable RLS
ALTER TABLE public.ai_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_document_chunks ENABLE ROW LEVEL SECURITY;

-- RLS policies for ai_documents
CREATE POLICY "Clients can view their own documents"
  ON public.ai_documents
  FOR SELECT
  USING (client_id = public.get_user_client_id(auth.uid()));

CREATE POLICY "Clients can insert their own documents"
  ON public.ai_documents
  FOR INSERT
  WITH CHECK (client_id = public.get_user_client_id(auth.uid()));

CREATE POLICY "Clients can update their own documents"
  ON public.ai_documents
  FOR UPDATE
  USING (client_id = public.get_user_client_id(auth.uid()));

CREATE POLICY "Clients can delete their own documents"
  ON public.ai_documents
  FOR DELETE
  USING (client_id = public.get_user_client_id(auth.uid()));

-- RLS policies for ai_document_chunks
CREATE POLICY "Clients can view their own chunks"
  ON public.ai_document_chunks
  FOR SELECT
  USING (client_id = public.get_user_client_id(auth.uid()));

CREATE POLICY "Clients can insert their own chunks"
  ON public.ai_document_chunks
  FOR INSERT
  WITH CHECK (client_id = public.get_user_client_id(auth.uid()));

CREATE POLICY "Clients can delete their own chunks"
  ON public.ai_document_chunks
  FOR DELETE
  USING (client_id = public.get_user_client_id(auth.uid()));

-- Create vector similarity search function
CREATE OR REPLACE FUNCTION public.match_document_chunks(
  query_embedding extensions.vector(768),
  match_client_id UUID,
  match_threshold FLOAT DEFAULT 0.7,
  match_count INT DEFAULT 5
)
RETURNS TABLE (
  id UUID,
  document_id UUID,
  content TEXT,
  metadata JSONB,
  similarity FLOAT
)
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT
    ai_document_chunks.id,
    ai_document_chunks.document_id,
    ai_document_chunks.content,
    ai_document_chunks.metadata,
    1 - (ai_document_chunks.embedding <=> query_embedding) AS similarity
  FROM ai_document_chunks
  WHERE ai_document_chunks.client_id = match_client_id
    AND 1 - (ai_document_chunks.embedding <=> query_embedding) > match_threshold
  ORDER BY ai_document_chunks.embedding <=> query_embedding
  LIMIT match_count;
$$;

-- Create trigger for updated_at
CREATE TRIGGER update_ai_documents_updated_at
  BEFORE UPDATE ON public.ai_documents
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Create storage bucket for AI documents
INSERT INTO storage.buckets (id, name, public)
VALUES ('ai-documents', 'ai-documents', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for ai-documents bucket
CREATE POLICY "Clients can upload their own documents"
  ON storage.objects
  FOR INSERT
  WITH CHECK (bucket_id = 'ai-documents' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Clients can view their own documents"
  ON storage.objects
  FOR SELECT
  USING (bucket_id = 'ai-documents' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Clients can delete their own documents"
  ON storage.objects
  FOR DELETE
  USING (bucket_id = 'ai-documents' AND auth.uid()::text = (storage.foldername(name))[1]);