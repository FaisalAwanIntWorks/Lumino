import { useState } from 'react';
import { FileText, Trash2, Loader2, CheckCircle2, AlertCircle, Clock, RefreshCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useClientActivityLogger } from '@/hooks/useClientActivityLogger';

interface Document {
  id: string;
  client_id: string;
  filename: string;
  file_path: string;
  file_size: number;
  status: string;
  chunk_count: number;
  error_message: string | null;
  created_at: string;
}

interface DocumentsListProps {
  documents: Document[];
  onDocumentDeleted: () => void;
}

export function DocumentsList({ documents, onDocumentDeleted }: DocumentsListProps) {
  const { toast } = useToast();
  const activityLogger = useClientActivityLogger();
  const [deleting, setDeleting] = useState<string | null>(null);
  const [reprocessing, setReprocessing] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [documentToDelete, setDocumentToDelete] = useState<Document | null>(null);

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatDate = (dateString: string) =>
    new Date(dateString).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

  const handleDeleteClick = (doc: Document) => { setDocumentToDelete(doc); setDeleteDialogOpen(true); };

  const handleDeleteConfirm = async () => {
    if (!documentToDelete) return;
    setDeleting(documentToDelete.id);
    setDeleteDialogOpen(false);

    try {
      await supabase.storage.from('ai-documents').remove([documentToDelete.file_path]);
      toast({ title: 'Document deleted', description: 'The document has been removed from your knowledge base.' });
      await activityLogger.logDocumentDelete(documentToDelete.filename, documentToDelete.id);
      onDocumentDeleted();
    } catch (error) {
      console.error('Delete error:', error);
      toast({ title: 'Delete failed', description: error instanceof Error ? error.message : 'An error occurred', variant: 'destructive' });
    } finally {
      setDeleting(null);
      setDocumentToDelete(null);
    }
  };

  const handleReprocess = async (doc: Document) => {
    setReprocessing(doc.id);
    try {
      const { error: parseError } = await supabase.functions.invoke('parse-pdf', {
        body: { documentId: doc.id, clientId: doc.client_id, filePath: doc.file_path },
      });

      if (parseError) {
        toast({ title: 'Reprocess failed', description: parseError.message, variant: 'destructive' });
      } else {
        toast({ title: 'Reprocessing started', description: 'We are re-reading the PDF and rebuilding chunks for chat.' });
      }
      onDocumentDeleted();
    } catch (error) {
      console.error('Reprocess error:', error);
      toast({ title: 'Reprocess failed', description: error instanceof Error ? error.message : 'An error occurred', variant: 'destructive' });
    } finally {
      setReprocessing(null);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'ready': return <Badge variant="default" className="bg-green-500/10 text-green-600 border-green-500/20"><CheckCircle2 className="h-3 w-3 mr-1" />Ready</Badge>;
      case 'processing': return <Badge variant="secondary" className="bg-yellow-500/10 text-yellow-600 border-yellow-500/20"><Clock className="h-3 w-3 mr-1 animate-pulse" />Processing</Badge>;
      case 'error': return <Badge variant="destructive" className="bg-red-500/10 text-red-600 border-red-500/20"><AlertCircle className="h-3 w-3 mr-1" />Error</Badge>;
      default: return <Badge variant="secondary">{status}</Badge>;
    }
  };

  if (documents.length === 0) {
    return (
      <Card className="p-8">
        <div className="flex flex-col items-center gap-4 text-center py-8">
          <div className="p-4 rounded-full bg-muted"><FileText className="h-8 w-8 text-muted-foreground" /></div>
          <div>
            <p className="font-medium text-foreground">No documents yet</p>
            <p className="text-sm text-muted-foreground mt-1">Upload a PDF to add it to your AI knowledge base</p>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <>
      <Card className="divide-y divide-border">
        {documents.map((doc) => (
          <div key={doc.id} className="p-4 flex items-center justify-between gap-4 hover:bg-muted/50 transition-colors">
            <div className="flex items-center gap-4 min-w-0 flex-1">
              <div className="p-2 rounded-lg bg-primary/10 shrink-0"><FileText className="h-5 w-5 text-primary" /></div>
              <div className="min-w-0 flex-1">
                <p className="font-medium text-foreground truncate">{doc.filename}</p>
                <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
                  <span>{formatFileSize(doc.file_size)}</span>
                  {doc.status === 'ready' && <><span>•</span><span>{doc.chunk_count} chunks</span></>}
                  <span>•</span>
                  <span>{formatDate(doc.created_at)}</span>
                </div>
                {doc.status === 'error' && doc.error_message && <p className="text-sm text-destructive mt-1">{doc.error_message}</p>}
              </div>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              {getStatusBadge(doc.status)}
              <Button variant="ghost" size="icon" onClick={() => handleReprocess(doc)} disabled={reprocessing === doc.id || deleting === doc.id} className="text-muted-foreground hover:text-foreground" title="Reprocess PDF">
                {reprocessing === doc.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
              </Button>
              <Button variant="ghost" size="icon" onClick={() => handleDeleteClick(doc)} disabled={deleting === doc.id || reprocessing === doc.id} className="text-muted-foreground hover:text-destructive" title="Delete document">
                {deleting === doc.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        ))}
      </Card>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Document</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{documentToDelete?.filename}"? This will remove all extracted content from your knowledge base. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteConfirm} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
