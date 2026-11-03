import { useState, useEffect } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Send, Loader2, CheckCircle, Mail, Clock } from "lucide-react";
import { format } from "date-fns";
import { getCurrencySymbol } from "@/lib/pricing-utils";

interface SendQuoteSectionProps {
  leadId: string;
  leadSource: string;
  clientId: string;
  customerEmail: string;
  customerName: string;
  currency: string;
}

interface QuoteHistoryItem {
  id: string;
  quote_amount: number;
  customer_email: string;
  sent_at: string;
  status: string;
}

export const SendQuoteSection = ({
  leadId, leadSource, clientId, customerEmail, customerName, currency,
}: SendQuoteSectionProps) => {
  const [quoteAmount, setQuoteAmount] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [history, setHistory] = useState<QuoteHistoryItem[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);

  // Fetch quote history
  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const { data } = await supabase
          .from('lead_quote_history')
          .select('id, quote_amount, customer_email, sent_at, status')
          .eq('lead_id', leadId)
          .eq('lead_source', leadSource)
          .order('sent_at', { ascending: false });

        if (data) setHistory(data);
      } catch (err) {
        console.error('Failed to fetch quote history:', err);
      } finally {
        setLoadingHistory(false);
      }
    };
    fetchHistory();
  }, [leadId, leadSource]);

  const handleSendQuote = async () => {
    const amount = parseFloat(quoteAmount);
    if (isNaN(amount) || amount <= 0) {
      toast.error('Please enter a valid amount');
      return;
    }

    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke('send-quote-estimate', {
        body: {
          leadId,
          leadSource,
          clientId,
          customerEmail,
          customerName,
          quoteAmount: amount,
          currency,
          message: message || undefined,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      // Add to history
      setHistory(prev => [{
        id: data?.quoteId || crypto.randomUUID(),
        quote_amount: amount,
        customer_email: customerEmail,
        sent_at: new Date().toISOString(),
        status: 'sent',
      }, ...prev]);

      setQuoteAmount("");
      setMessage("");
      toast.success('Quote sent successfully', {
        description: `${getCurrencySymbol(currency)}${amount.toLocaleString()} sent to ${customerEmail}`,
      });
    } catch (err: any) {
      console.error('Failed to send quote:', err);
      toast.error('Failed to send quote', { description: err.message });
    } finally {
      setSending(false);
    }
  };

  const symbol = getCurrencySymbol(currency);

  return (
    <div className="pb-5 border-b border-border/40">
        <h4 className="text-sm font-semibold mb-4 flex items-center gap-2">
          <Send className="h-4 w-4 text-muted-foreground" />
          Send Quote Estimate
        </h4>

        <div className="space-y-3">
          <div className="flex gap-3 items-end">
            <div className="flex-1">
              <Label className="text-xs">Amount ({currency})</Label>
              <div className="relative mt-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">{symbol}</span>
                <Input
                  type="number"
                  placeholder="0"
                  value={quoteAmount}
                  onChange={(e) => setQuoteAmount(e.target.value)}
                  className="pl-8"
                  min="0"
                  step="1"
                />
              </div>
            </div>
            <Button
              onClick={handleSendQuote}
              disabled={sending || !quoteAmount}
              size="default"
              className="gap-2"
            >
              {sending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              Send Quote
            </Button>
          </div>

          <div>
            <Label className="text-xs">Message (Optional)</Label>
            <Input
              placeholder="Add a personal note..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="mt-1"
            />
          </div>

          <p className="text-xs text-muted-foreground flex items-center gap-1.5">
            <Mail className="h-3 w-3" />
            Quote will be sent to {customerEmail}
          </p>
        </div>

        {/* Quote History */}
        {history.length > 0 && (
          <div className="mt-4 pt-4 border-t border-border/60">
            <p className="text-xs font-medium text-muted-foreground mb-2">Quote History</p>
            <div className="space-y-2">
              {history.map((q) => (
                <div key={q.id} className="flex items-center justify-between text-sm p-2 rounded-lg bg-muted/30">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-3.5 w-3.5 text-emerald-500" />
                    <span className="font-medium">
                      {new Intl.NumberFormat('en-US', { style: 'currency', currency, minimumFractionDigits: 0 }).format(q.quote_amount)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {format(new Date(q.sent_at), 'MMM d, h:mm a')}
                    </span>
                    <Badge variant="outline" className="text-[10px] capitalize">{q.status}</Badge>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
    </div>
  );
};
