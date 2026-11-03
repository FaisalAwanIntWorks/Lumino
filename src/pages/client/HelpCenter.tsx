import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getPageCache, setPageCache, resolveOwnClientId } from "@/lib/page-cache";
import { useAuth } from "@/contexts/AuthContext";
import { useUserProfile } from "@/hooks/useUserProfile";
import { useAdminImpersonation } from "@/contexts/AdminImpersonationContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { Loader2, MessageSquarePlus, Send, ChevronRight, CheckCircle2, Clock, Inbox, Trash2 } from "lucide-react";
import { format } from "date-fns";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface Ticket {
  id: string;
  subject: string;
  category: string;
  priority: string;
  status: string;
  initial_message: string;
  created_at: string;
  updated_at: string;
  last_admin_reply_at: string | null;
}

interface Message {
  id: string;
  ticket_id: string;
  author_role: string;
  author_name: string | null;
  body: string;
  created_at: string;
}

const CATEGORIES = [
  { value: "general", label: "General Question" },
  { value: "bug", label: "Bug / Technical Issue" },
  { value: "billing", label: "Billing" },
  { value: "feature_request", label: "Feature Request" },
  { value: "integration", label: "Integration / Embed" },
  { value: "account", label: "Account / Access" },
];

function statusBadge(status: string) {
  const map: Record<string, { label: string; cls: string }> = {
    open: { label: "Open", cls: "bg-primary/15 text-primary border-primary/30" },
    in_progress: { label: "In Progress", cls: "bg-yellow-500/15 text-yellow-600 border-yellow-500/30" },
    answered: { label: "Answered", cls: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30" },
    closed: { label: "Closed", cls: "bg-muted text-muted-foreground border-border" },
  };
  const v = map[status] || map.open;
  return <Badge variant="outline" className={`${v.cls} font-medium`}>{v.label}</Badge>;
}

export default function HelpCenter() {
  const { user, role, staffInfo } = useAuth();
  const { profile } = useUserProfile();
  const { impersonatedClientId } = useAdminImpersonation();

  const [clientId, setClientId] = useState<string | null>(null);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [composeOpen, setComposeOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState("general");
  const [message, setMessage] = useState("");

  const [openTicket, setOpenTicket] = useState<Ticket | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [reply, setReply] = useState("");
  const [sendingReply, setSendingReply] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const deleteTicket = async (ticketId: string) => {
    setDeletingId(ticketId);
    const { error } = await (supabase as any).from("support_tickets").delete().eq("id", ticketId);
    setDeletingId(null);
    if (error) {
      toast({ title: "Failed to delete query", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Query deleted", description: "Your query and all replies have been permanently removed." });
    if (openTicket?.id === ticketId) setOpenTicket(null);
    setTickets((prev) => prev.filter((t) => t.id !== ticketId));
  };

  // Resolve client_id (owner / staff / admin impersonation)
  useEffect(() => {
    (async () => {
      if (!user) return;
      if (impersonatedClientId) { setClientId(impersonatedClientId); return; }
      if (role === "staff" && staffInfo?.clientId) { setClientId(staffInfo.clientId); return; }
      // Cached per session, so revisiting the tab skips this lookup.
      setClientId(await resolveOwnClientId(user.id).catch(() => null));
    })();
  }, [user, role, staffInfo?.clientId, impersonatedClientId]);

  const loadTickets = async () => {
    if (!clientId) return;
    const cacheKey = `help-tickets:${clientId}`;
    const cachedTickets = getPageCache<Ticket[]>(cacheKey);
    if (cachedTickets) setTickets(cachedTickets); else setLoading(true);
    const { data } = await (supabase as any)
      .from("support_tickets")
      .select("id, subject, category, priority, status, initial_message, created_at, updated_at, last_admin_reply_at")
      .eq("client_id", clientId)
      .order("updated_at", { ascending: false });
    setTickets(data || []);
    setPageCache(cacheKey, data || []);
    setLoading(false);
  };

  useEffect(() => { if (clientId) loadTickets(); }, [clientId]);

  const submitTicket = async () => {
    if (!user || !clientId) return;
    if (!subject.trim() || !message.trim()) {
      toast({ title: "Subject and message are required", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    const { data, error } = await (supabase as any).from("support_tickets").insert({
      client_id: clientId,
      created_by_user_id: user.id,
      created_by_name: profile.full_name || user.email?.split("@")[0],
      created_by_email: user.email,
      subject: subject.trim(),
      category,
      initial_message: message.trim(),
    }).select("id").single();

    if (error) {
      console.error(error);
      toast({ title: "Failed to submit", description: error.message, variant: "destructive" });
      setSubmitting(false);
      return;
    }

    // Fire-and-forget email notification (acknowledgement + admin alert)
    supabase.functions.invoke("send-support-email", {
      body: { ticket_id: data.id, type: "submitted" },
    }).catch((e) => console.warn("send-support-email failed", e));

    toast({
      title: "Query submitted",
      description: "The JewlX Technical Team will respond within 24 hours. Check your email for confirmation.",
    });
    setSubject(""); setMessage(""); setCategory("general");
    setComposeOpen(false);
    setSubmitting(false);
    loadTickets();
  };

  const openTicketView = async (t: Ticket) => {
    setOpenTicket(t);
    setMessages([]);
    const { data } = await (supabase as any)
      .from("support_ticket_messages")
      .select("*")
      .eq("ticket_id", t.id)
      .order("created_at", { ascending: true });
    setMessages(data || []);
  };

  const sendReply = async () => {
    if (!user || !openTicket || !reply.trim()) return;
    setSendingReply(true);
    const { error } = await (supabase as any).from("support_ticket_messages").insert({
      ticket_id: openTicket.id,
      author_user_id: user.id,
      author_role: "client",
      author_name: profile.full_name || user.email?.split("@")[0],
      author_email: user.email,
      body: reply.trim(),
    });
    if (error) {
      toast({ title: "Failed to send", description: error.message, variant: "destructive" });
      setSendingReply(false);
      return;
    }
    await (supabase as any).from("support_tickets").update({
      status: "in_progress",
      last_client_reply_at: new Date().toISOString(),
    }).eq("id", openTicket.id);

    supabase.functions.invoke("send-support-email", {
      body: { ticket_id: openTicket.id, type: "client_reply", reply_body: reply.trim() },
    }).catch(() => {});

    setReply("");
    setSendingReply(false);
    openTicketView(openTicket);
    loadTickets();
  };

  return (
    <div className="px-4 sm:px-8 lg:px-12 pt-[52px] pb-[80px]">
      <div className="flex items-start justify-between mb-8 gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold mb-1">Help Center</h1>
          <p className="text-muted-foreground text-sm">
            Submit a query and the JewlX Technical Team will respond within 24 hours.
          </p>
        </div>
        <Button onClick={() => setComposeOpen(true)} className="gap-2">
          <MessageSquarePlus className="h-4 w-4" /> New Query
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading…
        </div>
      ) : tickets.length === 0 ? (
        <Card className="p-12 text-center border-dashed">
          <Inbox className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
          <h3 className="font-semibold mb-1">No queries yet</h3>
          <p className="text-sm text-muted-foreground mb-5">Click "New Query" to ask the JewlX team anything about the platform.</p>
          <Button onClick={() => setComposeOpen(true)} variant="outline" className="gap-2">
            <MessageSquarePlus className="h-4 w-4" /> Submit your first query
          </Button>
        </Card>
      ) : (
        <div className="space-y-3">
          {tickets.map((t) => (
            <Card
              key={t.id}
              className="p-4 hover:border-primary/40 transition-colors"
            >
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0 flex-1 cursor-pointer" onClick={() => openTicketView(t)}>
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    {statusBadge(t.status)}
                    <span className="text-xs text-muted-foreground capitalize">{t.category.replace(/_/g, " ")}</span>
                  </div>
                  <h3 className="font-semibold truncate">{t.subject}</h3>
                  <p className="text-xs text-muted-foreground mt-1">
                    Submitted {format(new Date(t.created_at), "MMM d, yyyy 'at' h:mm a")}
                    {t.last_admin_reply_at && (
                      <span className="ml-2 inline-flex items-center gap-1 text-emerald-500">
                        <CheckCircle2 className="h-3 w-3" /> JewlX replied {format(new Date(t.last_admin_reply_at), "MMM d")}
                      </span>
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        onClick={(e) => e.stopPropagation()}
                        disabled={deletingId === t.id}
                        aria-label="Delete query"
                      >
                        {deletingId === t.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent onClick={(e) => e.stopPropagation()}>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete this query?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will permanently remove the query and all replies for both you and the JewlX team. This action cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => deleteTicket(t.id)}
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                          Delete permanently
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                  <ChevronRight className="h-4 w-4 text-muted-foreground cursor-pointer" onClick={() => openTicketView(t)} />
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Compose */}
      <Dialog open={composeOpen} onOpenChange={setComposeOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>New Query</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Subject</Label>
              <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Briefly describe your query" maxLength={200} />
            </div>
            <div>
              <Label>Message</Label>
              <Textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Provide as much detail as possible…" rows={6} />
            </div>
            <p className="text-xs text-muted-foreground flex items-start gap-1.5">
              <Clock className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              You'll receive an email confirmation. The JewlX Technical Team typically responds within 24 hours.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={() => setComposeOpen(false)} disabled={submitting}>Cancel</Button>
              <Button onClick={submitTicket} disabled={submitting} className="gap-2">
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Submit Query
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Ticket detail / thread */}
      <Dialog open={!!openTicket} onOpenChange={(o) => !o && setOpenTicket(null)}>
        <DialogContent className="max-w-2xl">
          {openTicket && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 flex-wrap">
                  {statusBadge(openTicket.status)}
                  <span>{openTicket.subject}</span>
                </DialogTitle>
              </DialogHeader>

              <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2">
                {/* Initial message */}
                <div className="border-l-2 border-primary/40 pl-3 py-1">
                  <div className="text-xs text-muted-foreground mb-1">
                    You — {format(new Date(openTicket.created_at), "MMM d, h:mm a")}
                  </div>
                  <p className="text-sm whitespace-pre-wrap">{openTicket.initial_message}</p>
                </div>

                {messages.map((m) => (
                  <div
                    key={m.id}
                    className={`pl-3 py-1 border-l-2 ${m.author_role === "admin" ? "border-emerald-500/60 bg-emerald-500/5 rounded-r" : "border-primary/40"}`}
                  >
                    <div className="text-xs text-muted-foreground mb-1">
                      {m.author_role === "admin" ? "JewlX Technical Team" : (m.author_name || "You")} — {format(new Date(m.created_at), "MMM d, h:mm a")}
                    </div>
                    <p className="text-sm whitespace-pre-wrap">{m.body}</p>
                  </div>
                ))}
              </div>

              {openTicket.status !== "closed" && (
                <div className="border-t pt-3 space-y-2">
                  <Textarea value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Add a reply…" rows={3} />
                  <div className="flex justify-end">
                    <Button onClick={sendReply} disabled={sendingReply || !reply.trim()} className="gap-2">
                      {sendingReply ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                      Send Reply
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
