import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { StatusTagSelector } from '@/components/status/StatusTagSelector';
import { toast } from 'sonner';
import { format } from 'date-fns';
import type { StatusTag } from '@/hooks/useClientStatusTags';
import { LeadEmailHistory } from './LeadEmailHistory';

interface FollowUpNote {
  id: string;
  note_type: string;
  content: string;
  author_name: string | null;
  author_email: string | null;
  created_at: string;
}

interface LeadFollowUpSectionProps {
  leadId: string;
  leadIds?: string[];
  leadSource: string;
  clientId: string;
  currentStatus: string;
  customerEmail?: string;
  customerName?: string;
  tags: StatusTag[];
  getTagColor: (tagName: string) => string;
  onCreateTag?: (tagName: string, tagColor: string) => void;
  onDeleteTag?: (tagId: string) => void;
  onStatusChange: (newStatus: string) => void;
  hasEditAccess: boolean;
}

const NOTE_TYPE_LABELS: Record<string, string> = {
  note: '📝 Note',
  call: '📞 Call',
  email: '✉️ Email',
  status_change: '🔄 Status',
};

export function LeadFollowUpSection({
  leadId,
  leadIds,
  leadSource,
  clientId,
  currentStatus,
  customerEmail,
  customerName,
  tags,
  getTagColor,
  onCreateTag,
  onDeleteTag,
  onStatusChange,
  hasEditAccess,
}: LeadFollowUpSectionProps) {
  const [notes, setNotes] = useState<FollowUpNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [newNoteContent, setNewNoteContent] = useState('');
  const [adding, setAdding] = useState(false);
  // Bumped after each send so Email History refetches
  const [emailHistoryKey, setEmailHistoryKey] = useState(0);

  useEffect(() => {
    fetchNotes();
  }, [leadId, leadIds?.join(',')]);

  const fetchNotes = async () => {
    try {
      const idsToQuery = leadIds && leadIds.length > 0 ? leadIds : [leadId];
      const { data, error } = await supabase
        .from('lead_follow_up_notes')
        .select('*')
        .in('lead_id', idsToQuery)
        .eq('client_id', clientId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setNotes((data || []) as FollowUpNote[]);
    } catch (err) {
      console.error('Failed to fetch follow-up notes:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSendEmail = async () => {
    const content = newNoteContent.trim();
    if (!content) return;
    if (!customerEmail) {
      toast.error('This lead has no email address');
      return;
    }
    setAdding(true);
    try {
      // Email the customer first — the note is only logged once it actually went out
      const response = await supabase.functions.invoke('send-lead-followup-email', {
        body: { leadId, clientId, customerEmail, customerName, message: content },
      });
      if (response.error) {
        let message = 'Failed to send email';
        try {
          const body = await response.error.context?.json?.();
          if (body?.error) message = body.error;
        } catch {
          // keep the generic message
        }
        throw new Error(message);
      }

      const { data: { user } } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from('lead_follow_up_notes')
        .insert({
          lead_id: leadId,
          lead_source: leadSource,
          client_id: clientId,
          note_type: 'email',
          content,
          author_name: user?.user_metadata?.full_name || user?.email?.split('@')[0] || null,
          author_email: user?.email || null,
        })
        .select()
        .single();

      setNewNoteContent('');
      setEmailHistoryKey(k => k + 1);
      if (error) {
        console.error('Email sent but failed to log note:', error);
      } else {
        setNotes(prev => [data as FollowUpNote, ...prev]);
      }

      // Auto-update status to 'contacted' if currently 'new'
      if (currentStatus === 'new') {
        onStatusChange('contacted');
      }

      toast.success(`Email sent to ${customerEmail}`);
    } catch (err) {
      console.error('Failed to send follow-up email:', err);
      toast.error(err instanceof Error ? err.message : 'Failed to send email');
    } finally {
      setAdding(false);
    }
  };

  const handleStatusChangeWithLog = async (newStatus: string) => {
    // Log a status_change note
    try {
      const { data: { user } } = await supabase.auth.getUser();
      await supabase.from('lead_follow_up_notes').insert({
        lead_id: leadId,
        lead_source: leadSource,
        client_id: clientId,
        note_type: 'status_change',
        content: `Status changed from "${currentStatus}" to "${newStatus}"`,
        author_name: user?.user_metadata?.full_name || user?.email?.split('@')[0] || null,
        author_email: user?.email || null,
      });
    } catch {
      // Non-blocking
    }

    onStatusChange(newStatus);
    fetchNotes(); // Refresh to show the new status_change note
  };

  return (
    <div>
      <h4 className="text-sm font-semibold mb-3">Follow-Up</h4>

      {/* Status selector */}
      <div className="flex items-center gap-2 mb-4">
        <span className="text-xs text-muted-foreground">Status:</span>
        <StatusTagSelector
          currentStatus={currentStatus}
          tags={tags}
          onStatusChange={handleStatusChangeWithLog}
          onCreateTag={hasEditAccess ? onCreateTag : undefined}
          onDeleteTag={hasEditAccess ? onDeleteTag : undefined}
          getTagColor={getTagColor}
          disabled={!hasEditAccess}
        />
      </div>

      {/* Add note form */}
      {hasEditAccess && (
        <div className="mb-4">
          <div className="flex gap-2">
            <span className="inline-flex items-center h-8 px-2.5 rounded-md border border-input text-xs shrink-0">
              ✉️ Email
            </span>
            <Input
              value={newNoteContent}
              onChange={e => setNewNoteContent(e.target.value)}
              placeholder={customerEmail ? 'Write a message to email...' : 'No email on this lead'}
              className="h-8 text-xs flex-1"
              disabled={!customerEmail || adding}
              onKeyDown={e => e.key === 'Enter' && !adding && handleSendEmail()}
            />
            <Button
              size="sm"
              className="h-8 text-xs px-3"
              onClick={handleSendEmail}
              disabled={!newNoteContent.trim() || adding || !customerEmail}
            >
              {adding ? 'Sending...' : 'Send'}
            </Button>
          </div>
          {customerEmail && (
            <p className="text-[10px] text-muted-foreground mt-1.5">
              Sends to {customerEmail} — replies come to your account email.
            </p>
          )}
        </div>
      )}

      {/* Activity timeline */}
      <ScrollArea className="max-h-[200px]">
        {loading ? (
          <p className="text-xs text-muted-foreground py-3 text-center">Loading...</p>
        ) : notes.length === 0 ? (
          <p className="text-xs text-muted-foreground py-3 text-center">No activity yet</p>
        ) : (
          <div className="space-y-2">
            {notes.map(note => (
              <div key={note.id} className="flex gap-2.5 py-2 border-b border-border/30 last:border-0">
                <span className="text-sm shrink-0 mt-0.5">
                  {note.note_type === 'call' ? '📞' : note.note_type === 'email' ? '✉️' : note.note_type === 'status_change' ? '🔄' : '📝'}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-foreground">{note.content}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {note.author_name || note.author_email || 'Unknown'} · {format(new Date(note.created_at), 'MMM d, h:mm a')}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>

      <Separator className="my-4" />

      <LeadEmailHistory
        key={emailHistoryKey}
        leadId={leadId}
        clientId={clientId}
        customerEmail={customerEmail}
      />
    </div>
  );
}
