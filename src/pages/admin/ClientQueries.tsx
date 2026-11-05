import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useUserProfile } from "@/hooks/useUserProfile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "@/hooks/use-toast";
import { Loader2, Send, ChevronRight, Search, Inbox, Trash2 } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { format } from "date-fns";

interface AdminTicket {
  id: string;
  client_id: string;
  created_by_name: string | null;
  created_by_email: string;
  subject: string;
  category: string;
  priority: string;
  status: string;
  initial_message: string;
  created_at: string;
  updated_at: string;
  last_admin_reply_at: string | null;
  last_client_reply_at: string | null;
  clients?: { company_name: string | null } | null;
}

interface Message {
  id: string;
  ticket_id: string;
  author_role: string;
  author_name: string | null;
  body: string;
  created_at: string;
}

const STATUSES = [
  { value: "open", label: "Open" },
  { value: "in_progress", label: "In Progress" },
  { value: "answered", label: "Answered" },
  { value: "closed", label: "Closed" },
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

export default function ClientQueries() {
  const { user } = useAuth();
  const { profile } = useUserProfile();
  const [tickets, setTickets] = useState<AdminTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState("open");

  const [openTicket, setOpenTicket] = useState<AdminTicket | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from("support_tickets")
      .select("*, clients:client_id(company_name)")
      .order("updated_at", { ascending: false });
    if (error) console.error(error);
    setTickets(data || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  // Realtime: refresh when tickets/messages change
  useEffect(() => {
    const ch = supabase
      .channel("admin-support-tickets")
      .on("postgres_changes", { event: "*", schema: "public", table: "support_tickets" }, load)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "support_ticket_messages" }, () => {
        if (openTicket) openView(openTicket);
        load();
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openTicket?.id]);

  const filtered = useMemo(() => {
    return tickets.filter((t) => {
      if (tab === "all") {} else if (tab === "active") {
        if (!["open", "in_progress"].includes(t.status)) return false;
      } else if (t.status !== tab) return false;
      const q = search.trim().toLowerCase();
      if (!q) return true;
      return (
        t.subject.toLowerCase().includes(q) ||
        t.created_by_email.toLowerCase().includes(q) ||
        (t.clients?.company_name || "").toLowerCase().includes(q)
      );
    });
  }, [tickets, tab, search]);

  const counts = useMemo(() => ({
    open: tickets.filter((t) => t.status === "open").length,
    active: tickets.filter((t) => ["open", "in_progress"].includes(t.status)).length,
    answered: tickets.filter((t) => t.status === "answered").length,
    all: tickets.length,
  }), [tickets]);

  const openView = async (t: AdminTicket) => {
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
    setSending(true);
    const body = reply.trim();
    const { error } = await (supabase as any).from("support_ticket_messages").insert({
      ticket_id: openTicket.id,
      author_user_id: user.id,
      author_role: "admin",
      author_name: profile.full_name || "Aurezo Technical Team",
      author_email: user.email,
      body,
    });
    if (error) {
      toast({ title: "Failed to send", description: error.message, variant: "destructive" });
      setSending(false);
      return;
    }
    await (supabase as any).from("support_tickets").update({
      status: "answered",
      last_admin_reply_at: new Date().toISOString(),
    }).eq("id", openTicket.id);

    supabase.functions.invoke("send-support-email", {
      body: { ticket_id: openTicket.id, type: "admin_reply", reply_body: body },
    }).catch(() => {});

    toast({ title: "Reply sent", description: "Client has been notified by email." });
    setReply("");
    setSending(false);
    openView(openTicket);
    load();
  };

  const updateStatus = async (status: string) => {
    if (!openTicket) return;
    await (supabase as any).from("support_tickets").update({ status }).eq("id", openTicket.id);
    setOpenTicket({ ...openTicket, status });
    load();
  };

  const deleteTicket = async () => {
    if (!openTicket) return;
    const { error } = await (supabase as any).from("support_tickets").delete().eq("id", openTicket.id);
    if (error) {
      toast({ title: "Failed to delete", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Query deleted", description: "Removed permanently from both admin and client." });
    setOpenTicket(null);
    load();
  };

  return (
    <div className="px-4 sm:px-8 lg:px-12 pt-[52px] pb-[80px]">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-1">Client Queries</h1>
        <p className="text-muted-foreground text-sm">Support tickets submitted by clients and their staff across the platform.</p>
      </div>

      <div className="flex items-center gap-3 mb-6 flex-wrap">
        <div className="relative flex-1 min-w-[240px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search subject, email, or company…" className="pl-9" />
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="active">Active ({counts.active})</TabsTrigger>
          <TabsTrigger value="open">Open ({counts.open})</TabsTrigger>
          <TabsTrigger value="answered">Answered ({counts.answered})</TabsTrigger>
          <TabsTrigger value="all">All ({counts.all})</TabsTrigger>
        </TabsList>
        <TabsContent value={tab} className="mt-6">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading…
            </div>
          ) : filtered.length === 0 ? (
            <Card className="p-12 text-center border-dashed">
              <Inbox className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">No tickets in this view.</p>
            </Card>
          ) : (
            <div className="space-y-3">
              {filtered.map((t) => (
                <Card key={t.id} className="p-4 hover:border-primary/40 cursor-pointer transition-colors" onClick={() => openView(t)}>
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        {statusBadge(t.status)}
                        <span className="text-xs text-muted-foreground capitalize">{t.category.replace(/_/g, " ")}</span>
                        <span className="text-xs text-foreground/80 font-medium">{t.clients?.company_name || "Unknown client"}</span>
                      </div>
                      <h3 className="font-semibold truncate">{t.subject}</h3>
                      <p className="text-xs text-muted-foreground mt-1">
                        From {t.created_by_name || t.created_by_email} ({t.created_by_email}) — {format(new Date(t.created_at), "MMM d, yyyy 'at' h:mm a")}
                      </p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

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

              <div className="text-xs text-muted-foreground -mt-2 mb-2">
                {openTicket.clients?.company_name || "—"} • {openTicket.created_by_name || openTicket.created_by_email} ({openTicket.created_by_email})
              </div>

              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <span className="text-xs text-muted-foreground">Status:</span>
                <Select value={openTicket.status} onValueChange={updateStatus}>
                  <SelectTrigger className="w-40 h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                  </SelectContent>
                </Select>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-8 ml-auto text-destructive hover:text-destructive hover:bg-destructive/10 gap-1.5">
                      <Trash2 className="h-3.5 w-3.5" /> Delete query
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete this query?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will permanently remove the query and all replies for both the client and admin. This action cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={deleteTicket} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                        Delete permanently
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>

              <div className="space-y-4 max-h-[55vh] overflow-y-auto pr-2 border-t pt-3">
                <div className="border-l-2 border-primary/40 pl-3 py-1">
                  <div className="text-xs text-muted-foreground mb-1">
                    {openTicket.created_by_name || openTicket.created_by_email} — {format(new Date(openTicket.created_at), "MMM d, h:mm a")}
                  </div>
                  <p className="text-sm whitespace-pre-wrap">{openTicket.initial_message}</p>
                </div>

                {messages.map((m) => (
                  <div
                    key={m.id}
                    className={`pl-3 py-1 border-l-2 ${m.author_role === "admin" ? "border-emerald-500/60 bg-emerald-500/5 rounded-r" : "border-primary/40"}`}
                  >
                    <div className="text-xs text-muted-foreground mb-1">
                      {m.author_role === "admin" ? `Aurezo Technical Team (${m.author_name || "Admin"})` : (m.author_name || "Client")} — {format(new Date(m.created_at), "MMM d, h:mm a")}
                    </div>
                    <p className="text-sm whitespace-pre-wrap">{m.body}</p>
                  </div>
                ))}
              </div>

              {openTicket.status !== "closed" && (
                <div className="border-t pt-3 space-y-2">
                  <Textarea value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Type your reply to the client…" rows={4} />
                  <div className="flex justify-end gap-2">
                    <Button onClick={sendReply} disabled={sending || !reply.trim()} className="gap-2">
                      {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                      Send Reply & Mark Answered
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
