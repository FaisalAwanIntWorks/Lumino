import { useState, useCallback } from 'react';
import { Upload, FileText, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useClientActivityLogger } from '@/hooks/useClientActivityLogger';

interface DocumentUploadProps {
  clientId: string;
  onUploadComplete: () => void;
}

export function DocumentUpload({ clientId, onUploadComplete }: DocumentUploadProps) {
  const { toast } = useToast();
  const activityLogger = useClientActivityLogger();
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);

  const handleDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); }, []);
  const handleDragLeave = useCallback((e: React.DragEvent) => { e.preventDefault(); setIsDragging(false); }, []);

  const processFile = async (file: File) => {
    if (file.type !== 'application/pdf') {
      toast({ title: 'Invalid file type', description: 'Please upload a PDF file', variant: 'destructive' });
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast({ title: 'File too large', description: 'Maximum file size is 10MB', variant: 'destructive' });
      return;
    }

    setUploading(true);
    setUploadProgress('Uploading file...');

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const filePath = `${user.id}/${Date.now()}-${file.name}`;
      const { error: uploadError } = await supabase.storage.from('ai-documents').upload(filePath, file);
      if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);

      setUploadProgress('Processing PDF...');

      const { error: parseError } = await supabase.functions.invoke('parse-pdf', {
        body: { clientId, filePath, filename: file.name, fileSize: file.size },
      });

      if (parseError) {
        toast({ title: 'PDF processing failed', description: parseError.message, variant: 'destructive' });
      } else {
        toast({ title: 'Document uploaded', description: 'Your PDF has been processed and added to the knowledge base.' });
        await activityLogger.logDocumentUpload(file.name, file.size);
      }

      onUploadComplete();
    } catch (error) {
      console.error('Upload error:', error);
      toast({ title: 'Upload failed', description: error instanceof Error ? error.message : 'An error occurred', variant: 'destructive' });
    } finally {
      setUploading(false);
      setUploadProgress(null);
    }
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) processFile(files[0]);
  }, [clientId]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) processFile(files[0]);
    e.target.value = '';
  };

  return (
    <Card
      className={`p-8 border-2 border-dashed transition-all ${isDragging ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {uploading ? (
        <div className="flex flex-col items-center gap-4 py-4">
          <Loader2 className="h-10 w-10 text-primary animate-spin" />
          <div className="text-center">
            <p className="font-medium text-foreground">{uploadProgress}</p>
            <p className="text-sm text-muted-foreground mt-1">Please wait while we process your document</p>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-4 py-4">
          <div className="p-4 rounded-full bg-primary/10"><Upload className="h-8 w-8 text-primary" /></div>
          <div className="text-center">
            <p className="font-medium text-foreground">Drag and drop a PDF file here</p>
            <p className="text-sm text-muted-foreground mt-1">or click to browse (max 10MB)</p>
          </div>
          <label>
            <input type="file" accept=".pdf,application/pdf" onChange={handleFileSelect} className="hidden" />
            <Button variant="outline" className="cursor-pointer" asChild>
              <span><FileText className="h-4 w-4 mr-2" />Select PDF</span>
            </Button>
          </label>
        </div>
      )}
    </Card>
  );
}
