import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';
import { ChevronDown, ChevronUp } from 'lucide-react';

interface EmailLog {
  id: string;
  email_type: string;
  recipient_email: string;
  subject: string;
  status: string;
  created_at: string;
  error_message: string | null;
  metadata: Record<string, unknown> | null;
}

const EMAIL_TYPE_LABELS: Record<string, string> = {
  customer_confirmation: 'Customer Confirmation',
  quote_estimate: 'Quote Sent',
  lead_follow_up: 'Follow-Up Email',
  form_lead_notification: 'Admin Notification',
  lead_notification: 'Lead Alert',
  lead_deletion_notification: 'Deletion Notice',
  appointment_notification: 'Appointment Alert',
  welcome_email: 'Welcome Email',
};

interface LeadEmailHistoryProps {
  leadId: string;
  clientId: string;
  customerEmail?: string;
}

export function LeadEmailHistory({ leadId, clientId, customerEmail }: LeadEmailHistoryProps) {
  const [emails, setEmails] = useState<EmailLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    fetchEmailLogs();
  }, [leadId, customerEmail]);

  const fetchEmailLogs = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const response = await supabase.functions.invoke('get-lead-email-logs', {
        body: { leadId, customerEmail, clientId },
      });

      if (response.error) throw response.error;
      setEmails((response.data?.data || []) as EmailLog[]);
    } catch (err) {
      console.error('Failed to fetch email logs:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="mt-4">
        <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
          📧 Email History
        </h4>
        <p className="text-xs text-muted-foreground py-2 text-center">Loading...</p>
      </div>
    );
  }

  if (emails.length === 0) {
    return (
      <div className="mt-4">
        <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
          📧 Email History
        </h4>
        <p className="text-xs text-muted-foreground py-2 text-center">No emails sent yet</p>
      </div>
    );
  }

  const visibleEmails = expanded ? emails : emails.slice(0, 3);
  const hasMore = emails.length > 3;

  return (
    <div className="mt-4">
      <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
        📧 Email History
        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
          {emails.length}
        </Badge>
      </h4>

      <ScrollArea className={expanded ? 'h-[250px]' : undefined}>
        <div className="space-y-2">
          {visibleEmails.map((email) => (
            <div key={email.id} className="flex gap-2.5 py-2 border-b border-border/30 last:border-0">
              <span className="text-sm shrink-0 mt-0.5">
                {email.status === 'sent' ? '✅' : '❌'}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-xs font-medium text-foreground">
                    {EMAIL_TYPE_LABELS[email.email_type] || email.email_type}
                  </span>
                  <Badge
                    variant={email.status === 'sent' ? 'default' : 'destructive'}
                    className="text-[9px] px-1 py-0 h-4"
                  >
                    {email.status === 'sent' ? 'Sent' : 'Failed'}
                  </Badge>
                </div>
                <p className="text-[11px] text-muted-foreground truncate mt-0.5" title={email.subject}>
                  {email.subject}
                </p>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  → {email.recipient_email} · {format(new Date(email.created_at), 'MMM d, h:mm a')}
                </p>
                {email.error_message && (
                  <p className="text-[10px] text-destructive mt-0.5 truncate" title={email.error_message}>
                    Error: {email.error_message}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>

      {hasMore && (
        <Button
          variant="ghost"
          size="sm"
          className="w-full h-7 text-xs text-muted-foreground mt-1"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? (
            <>Show less <ChevronUp className="h-3 w-3 ml-1" /></>
          ) : (
            <>Show all {emails.length} emails <ChevronDown className="h-3 w-3 ml-1" /></>
          )}
        </Button>
      )}
    </div>
  );
}
