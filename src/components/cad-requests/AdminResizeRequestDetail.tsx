import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, Clock, CheckCircle2, XCircle, Loader2, Building2, Upload, FileDown, Package } from "lucide-react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { getSignedUrl } from "@/lib/storage-utils";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CadRequestChat } from "@/components/cad-requests/CadRequestChat";

interface ResizeRequest {
  id: string;
  client_id: string;
  requested_by: string;
  order_id: string;
  product_name: string | null;
  current_size: string;
  requested_size: string;
  metal_type: string | null;
  style: string | null;
  shape: string | null;
  status: string;
  admin_notes: string | null;
  created_at: string;
  updated_at: string;
  clients: { company_name: string } | null;
}

const STATUS_OPTIONS = ["pending", "in_progress", "completed", "rejected"] as const;
const PRIORITY_OPTIONS = ["normal", "urgent", "low"] as const;

const statusConfig: Record<string, { label: string; icon: any; className: string }> = {
  pending: { label: "Pending", icon: Clock, className: "bg-amber-500/15 text-amber-600 border-amber-500/30" },
  in_progress: { label: "In Progress", icon: Loader2, className: "bg-blue-500/15 text-blue-600 border-blue-500/30" },
  completed: { label: "Completed", icon: CheckCircle2, className: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30" },
  rejected: { label: "Rejected", icon: XCircle, className: "bg-red-500/15 text-red-600 border-red-500/30" },
};

const priorityConfig: Record<string, { label: string; className: string }> = {
  urgent: { label: "Urgent", className: "bg-red-500/15 text-red-600 border-red-500/30" },
  normal: { label: "Normal", className: "bg-blue-500/15 text-blue-600 border-blue-500/30" },
  low: { label: "Low", className: "bg-muted text-muted-foreground border-border" },
};

interface Props {
  request: ResizeRequest;
  onBack: () => void;
}

export function AdminResizeRequestDetail({ request: initialRequest, onBack }: Props) {
  const qc = useQueryClient();
  const [request, setRequest] = useState(initialRequest);
  const [notesText, setNotesText] = useState(request.admin_notes || "");
  const [priority, setPriority] = useState("normal");
  const [currentUser, setCurrentUser] = useState<{ id: string; email: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [deliveredFiles, setDeliveredFiles] = useState<string[]>([]);
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});

  const sc = statusConfig[request.status] || statusConfig.pending;
  const StatusIcon = sc.icon;

  // Get current user
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) setCurrentUser({ id: data.user.id, email: data.user.email || '' });
    });
  }, []);

  // Generate signed URLs for delivered files
  const refreshSignedUrls = useCallback(async (files: string[]) => {
    const urls: Record<string, string> = {};
    for (const path of files) {
      const url = await getSignedUrl('cad-deliveries', path);
      if (url) urls[path] = url;
    }
    setSignedUrls(urls);
  }, []);

  useEffect(() => {
    if (deliveredFiles.length > 0) refreshSignedUrls(deliveredFiles);
  }, [deliveredFiles, refreshSignedUrls]);

  const updateMutation = useMutation({
    mutationFn: async (payload: { id: string; [key: string]: any }) => {
      const { id, ...update } = payload;
      const { error } = await supabase.from("cad_resize_requests").update(update).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-cad-resize-requests"] });
      toast.success("Request updated");
    },
    onError: () => toast.error("Failed to update request"),
  });

  const handleUploadCadFile = async (files: FileList) => {
    setUploading(true);
    try {
      const newPaths: string[] = [];
      for (const file of Array.from(files)) {
        const filePath = `resize/${request.client_id}/${request.id}/${Date.now()}_${file.name}`;
        const { error } = await supabase.storage.from("cad-deliveries").upload(filePath, file, { cacheControl: '3600', upsert: false });
        if (error) { console.error('Upload error:', error); continue; }
        newPaths.push(filePath);
      }
      if (newPaths.length > 0) {
        setDeliveredFiles(prev => [...prev, ...newPaths]);
        toast.success(`${newPaths.length} file(s) uploaded`);
      }
    } catch {
      toast.error("Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const InfoRow = ({ label, value }: { label: string; value: string | null | undefined }) => {
    if (!value) return null;
    return (
      <div className="flex items-center justify-between py-2 border-b border-border/40 last:border-0">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className="text-sm font-medium">{value}</span>
      </div>
    );
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <Button variant="ghost" size="sm" onClick={onBack} className="gap-2 -ml-2">
        <ArrowLeft className="h-4 w-4" />
        Back to CAD Requests
      </Button>

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">
            {request.product_name || "Resize Request"}
          </h2>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <Badge variant="outline" className="bg-violet-500/15 text-violet-600 border-violet-500/30 text-[10px]">Resize</Badge>
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Building2 className="h-3 w-3" />
              {request.clients?.company_name || "Unknown Client"}
            </span>
            <span className="text-xs text-muted-foreground">•</span>
            <span className="text-xs text-muted-foreground">
              {format(new Date(request.created_at), "MMM d, yyyy 'at' h:mm a")}
            </span>
          </div>
        </div>
        <Badge variant="outline" className={`${sc.className} text-xs`}>
          <StatusIcon className={`h-3 w-3 mr-1 ${request.status === "in_progress" ? "animate-spin" : ""}`} />
          {sc.label}
        </Badge>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
        {/* Left: Details + Uploaded Files */}
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardContent className="p-4 sm:p-5">
              <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <Package className="h-4 w-4" /> Resize Details
              </h4>
              <InfoRow label="Current Size" value={request.current_size} />
              <InfoRow label="Requested Size" value={request.requested_size} />
              <InfoRow label="Product" value={request.product_name} />
              <InfoRow label="Metal Type" value={request.metal_type} />
              <InfoRow label="Style" value={request.style} />
              <InfoRow label="Shape" value={request.shape} />
              <InfoRow label="Order ID" value={request.order_id?.slice(0, 8)} />
            </CardContent>
          </Card>

          {/* Upload CAD Files */}
          <Card>
            <CardContent className="p-4 sm:p-5 space-y-3">
              <h4 className="text-sm font-semibold flex items-center gap-2">
                <Upload className="h-4 w-4" /> Upload CAD Files
              </h4>
              <div className="border-2 border-dashed border-border rounded-lg p-4 text-center">
                <input
                  type="file"
                  id="resize-cad-upload"
                  multiple
                  accept=".3dm,.stl,.step,.stp,.obj,.fbx,.jpg,.jpeg,.png,.pdf"
                  onChange={(e) => e.target.files && handleUploadCadFile(e.target.files)}
                  className="hidden"
                />
                <label htmlFor="resize-cad-upload" className="cursor-pointer flex flex-col items-center gap-2">
                  {uploading ? (
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  ) : (
                    <Upload className="h-6 w-6 text-muted-foreground" />
                  )}
                  <span className="text-sm text-muted-foreground">Click to upload CAD files (.3dm, .stl, images, etc.)</span>
                </label>
              </div>
              {deliveredFiles.length > 0 && (
                <div className="space-y-2">
                  <h5 className="text-xs font-semibold text-muted-foreground">Delivered Files</h5>
                  {deliveredFiles.map((path) => (
                    <div key={path} className="flex items-center gap-2 p-2 bg-muted/30 rounded">
                      <FileDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      <span className="text-xs truncate flex-1">{path.split('/').pop()}</span>
                      {signedUrls[path] && (
                        <a href={signedUrls[path]} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline">
                          Download
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Discussion / Chat */}
          {currentUser && (
            <CadRequestChat
              cadRequestId={request.id}
              currentUserId={currentUser.id}
              currentUserName={currentUser.email}
              currentUserRole="admin"
              clientId={request.client_id}
            />
          )}
        </div>

        {/* Right: Status, Priority, Notes */}
        <div className="space-y-4">
          <Card>
            <CardContent className="p-4 sm:p-5 space-y-4">
              <h4 className="text-sm font-semibold">Status & Priority</h4>
              <div className="space-y-2">
                <label className="text-xs text-muted-foreground">Status</label>
                <Select
                  value={request.status}
                  onValueChange={val => {
                    updateMutation.mutate({ id: request.id, status: val });
                    setRequest(prev => ({ ...prev, status: val }));
                  }}
                >
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS.map(s => (
                      <SelectItem key={s} value={s} className="capitalize text-xs">
                        {s.replace("_", " ")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-xs text-muted-foreground">Priority</label>
                <Select value={priority} onValueChange={setPriority}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PRIORITY_OPTIONS.map(p => {
                      const pc = priorityConfig[p];
                      return (
                        <SelectItem key={p} value={p} className="capitalize text-xs">
                          {pc.label}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4 sm:p-5 space-y-4">
              <h4 className="text-sm font-semibold">Admin Notes</h4>
              <Textarea
                placeholder="Admin notes..."
                value={notesText}
                onChange={e => setNotesText(e.target.value)}
                rows={4}
                className="text-sm"
              />
              <Button
                size="sm"
                className="w-full"
                disabled={notesText === (request.admin_notes || "")}
                onClick={() => {
                  updateMutation.mutate({ id: request.id, admin_notes: notesText });
                  setRequest(prev => ({ ...prev, admin_notes: notesText }));
                }}
              >
                Save Notes
              </Button>
            </CardContent>
          </Card>

          {/* Timeline */}
          <Card>
            <CardContent className="p-4 sm:p-5 space-y-3">
              <h4 className="text-sm font-semibold flex items-center gap-2">
                <Clock className="h-4 w-4" /> Timeline
              </h4>
              <div className="space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Created</span>
                  <span>{format(new Date(request.created_at), "MMM d, yyyy h:mm a")}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Last Updated</span>
                  <span>{format(new Date(request.updated_at), "MMM d, yyyy h:mm a")}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
