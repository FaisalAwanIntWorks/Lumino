import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, Paperclip, Send, FileDown, Image as ImageIcon, X } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { getSignedUrl } from "@/lib/storage-utils";

interface ChatMessage {
  id: string;
  cad_request_id: string;
  sender_id: string;
  sender_name: string;
  sender_role: string;
  message: string | null;
  file_urls: string[] | null;
  created_at: string;
}

interface CadRequestChatProps {
  cadRequestId: string;
  currentUserId: string;
  currentUserName: string;
  currentUserRole: "admin" | "client" | "staff";
  clientId?: string;
}

const roleBadgeClass: Record<string, string> = {
  admin: "bg-primary/15 text-primary border-primary/30",
  client: "bg-blue-500/15 text-blue-600 border-blue-500/30",
  staff: "bg-purple-500/15 text-purple-600 border-purple-500/30",
};

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export function CadRequestChat({ cadRequestId, currentUserId, currentUserName, currentUserRole, clientId }: CadRequestChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [messageText, setMessageText] = useState("");
  const [sending, setSending] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});
  const signedUrlsRef = useRef<Record<string, string>>({});
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Keep ref in sync
  useEffect(() => {
    signedUrlsRef.current = signedUrls;
  }, [signedUrls]);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  // Fetch messages
  useEffect(() => {
    const fetchMessages = async () => {
      setLoading(true);
      const { data, error } = await (supabase as any)
        .from("cad_request_messages")
        .select("*")
        .eq("cad_request_id", cadRequestId)
        .order("created_at", { ascending: true });

      if (!error && data) {
        setMessages(data);
        const urls: Record<string, string> = {};
        for (const msg of data) {
          if (msg.file_urls?.length) {
            for (const url of msg.file_urls) {
              if (!url.startsWith("http")) {
                const signed = await getSignedUrl("cad-deliveries", url);
                if (signed) urls[url] = signed;
              }
            }
          }
        }
        setSignedUrls(urls);
      }
      setLoading(false);
    };
    fetchMessages();
  }, [cadRequestId]);

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel(`cad-chat-${cadRequestId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "cad_request_messages",
          filter: `cad_request_id=eq.${cadRequestId}`,
        },
        async (payload: any) => {
          const newMsg = payload.new as ChatMessage;
          setMessages((prev) => {
            if (prev.some((m) => m.id === newMsg.id)) return prev;
            return [...prev, newMsg];
          });
          // Generate signed URLs for new message files using ref
          if (newMsg.file_urls?.length) {
            for (const url of newMsg.file_urls) {
              if (!url.startsWith("http") && !signedUrlsRef.current[url]) {
                const signed = await getSignedUrl("cad-deliveries", url);
                if (signed) {
                  setSignedUrls((prev) => ({ ...prev, [url]: signed }));
                }
              }
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [cadRequestId]);

  // Auto-scroll on new messages
  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const valid = files.filter((f) => {
      if (f.size > MAX_FILE_SIZE) {
        toast.error(`${f.name} exceeds 10MB limit`);
        return false;
      }
      return true;
    });
    setSelectedFiles((prev) => [...prev, ...valid]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeFile = (idx: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSend = async () => {
    if (!messageText.trim() && selectedFiles.length === 0) return;
    setSending(true);

    try {
      // Upload files
      const fileUrls: string[] = [];
      for (const file of selectedFiles) {
        const filePath = `chat-attachments/${cadRequestId}/${crypto.randomUUID()}-${file.name}`;
        const { error } = await supabase.storage.from("cad-deliveries").upload(filePath, file);
        if (error) throw error;
        fileUrls.push(filePath);
      }

      // Insert message
      const { error } = await (supabase as any).from("cad_request_messages").insert({
        cad_request_id: cadRequestId,
        sender_id: currentUserId,
        sender_name: currentUserName,
        sender_role: currentUserRole,
        message: messageText.trim() || null,
        file_urls: fileUrls.length > 0 ? fileUrls : null,
      });

      if (error) throw error;

      const msgPreview = messageText.trim()
        ? messageText.trim().substring(0, 80) + (messageText.trim().length > 80 ? "..." : "")
        : "Sent an attachment";

      // Send notification to client when admin sends a message
      if (currentUserRole === "admin" && clientId) {
        await (supabase as any).from("client_notifications").insert({
          client_id: clientId,
          category: "cad_chat",
          title: "New CAD Message",
          message: msgPreview,
          metadata: { cad_request_id: cadRequestId },
        });
      }

      // Send notification to admins when client/staff sends a message
      if (currentUserRole !== "admin") {
        try {
          const { data: adminRoles } = await (supabase as any)
            .from("user_roles")
            .select("user_id")
            .eq("role", "agency_admin");
          if (adminRoles?.length) {
            const inserts = adminRoles.map((ar: { user_id: string }) => ({
              user_id: ar.user_id,
              category: "cad_chat",
              title: "New CAD Message",
              message: `${currentUserName}: ${msgPreview}`,
              metadata: { cad_request_id: cadRequestId, client_id: clientId },
            }));
            await (supabase as any).from("admin_notifications").insert(inserts);
          }
        } catch { /* non-critical */ }
      }

      setMessageText("");
      setSelectedFiles([]);
    } catch (err) {
      console.error("Send error:", err);
      toast.error("Failed to send message");
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const getFileUrl = (path: string) => signedUrls[path] || path;

  const isImage = (path: string) => /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(path);

  const getFileName = (path: string) => path.split("/").pop() || "file";

  if (loading) {
    return (
      <Card>
        <CardContent className="p-4 sm:p-5 flex items-center justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-4 sm:p-5">
        <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
          <Send className="h-4 w-4 text-muted-foreground" />
          Discussion
        </h4>

        {/* Messages */}
        <div className="h-[320px] overflow-y-auto border rounded-lg bg-muted/20 p-3 space-y-3 mb-3">
          {messages.length === 0 && (
            <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
              No messages yet. Start the conversation!
            </div>
          )}

          {messages.map((msg) => {
            const isOwn = msg.sender_id === currentUserId;
            return (
              <div key={msg.id} className={`flex ${isOwn ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[80%] ${isOwn ? "items-end" : "items-start"}`}>
                  <div className="flex items-center gap-1.5 mb-0.5">
                    {!isOwn && (
                      <>
                        <span className="text-xs font-medium">{msg.sender_name}</span>
                        <Badge variant="outline" className={`text-[9px] px-1 py-0 h-4 ${roleBadgeClass[msg.sender_role] || ""}`}>
                          {msg.sender_role}
                        </Badge>
                      </>
                    )}
                    <span className="text-[10px] text-muted-foreground">
                      {format(new Date(msg.created_at), "MMM d, h:mm a")}
                    </span>
                  </div>
                  <div
                    className={`rounded-lg px-3 py-2 text-sm ${
                      isOwn
                        ? "bg-primary text-primary-foreground"
                        : "bg-background border border-border"
                    }`}
                  >
                    {msg.message && <p className="whitespace-pre-wrap">{msg.message}</p>}
                    {msg.file_urls && msg.file_urls.length > 0 && (
                      <div className={`${msg.message ? "mt-2 pt-2 border-t" : ""} ${isOwn ? "border-primary-foreground/20" : "border-border"} space-y-1.5`}>
                        {msg.file_urls.map((url, idx) => {
                          const resolvedUrl = getFileUrl(url);
                          if (isImage(url)) {
                            return (
                              <img
                                key={idx}
                                src={resolvedUrl}
                                alt={getFileName(url)}
                                className="max-h-40 rounded border cursor-pointer hover:opacity-80 transition-opacity"
                                onClick={() => window.open(resolvedUrl, "_blank")}
                              />
                            );
                          }
                          return (
                            <a
                              key={idx}
                              href={resolvedUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className={`flex items-center gap-1.5 text-xs underline ${
                                isOwn ? "text-primary-foreground/80" : "text-muted-foreground"
                              }`}
                            >
                              <FileDown className="h-3 w-3" />
                              {getFileName(url)}
                            </a>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>

        {/* Selected files preview */}
        {selectedFiles.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-2">
            {selectedFiles.map((file, idx) => (
              <div key={idx} className="flex items-center gap-1.5 px-2 py-1 rounded bg-muted text-xs border">
                {file.type.startsWith("image/") ? (
                  <ImageIcon className="h-3 w-3 text-muted-foreground" />
                ) : (
                  <FileDown className="h-3 w-3 text-muted-foreground" />
                )}
                <span className="truncate max-w-[120px]">{file.name}</span>
                <button onClick={() => removeFile(idx)} className="ml-0.5 hover:text-destructive">
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Input */}
        <div className="flex gap-2">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={handleFileSelect}
            accept="image/*,.pdf,.doc,.docx,.stl,.obj,.step,.stp,.3dm,.igs,.iges"
          />
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="shrink-0 h-9 w-9"
            onClick={() => fileInputRef.current?.click()}
            disabled={sending}
          >
            <Paperclip className="h-4 w-4" />
          </Button>
          <Input
            value={messageText}
            onChange={(e) => setMessageText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message..."
            className="h-9 text-sm"
            disabled={sending}
          />
          <Button
            size="icon"
            className="shrink-0 h-9 w-9"
            onClick={handleSend}
            disabled={sending || (!messageText.trim() && selectedFiles.length === 0)}
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
