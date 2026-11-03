import { stickyHeaderTableClass } from "@/components/ui/table";
import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from "@/components/ui/table";
import { Plus, Package, FileDown, Loader2, Clock, CheckCircle2, XCircle, ArrowRight, RotateCcw } from "lucide-react";
import { format } from "date-fns";
import { NewCadRequestDialog } from "./NewCadRequestDialog";
import { CadRequestDetailView } from "./CadRequestDetailView";

interface CadRequest {
  id: string;
  request_number: number | null;
  source: string;
  lead_id: string | null;
  lead_table: string | null;
  ring_product_name: string | null;
  is_custom_ring: boolean;
  metal_type: string | null;
  style: string | null;
  shape: string | null;
  ring_size: string | null;
  carat_size: string | null;
  custom_description: string | null;
  status: string;
  priority: string;
  admin_notes: string | null;
  cad_file_urls: string[] | null;
  delivered_at: string | null;
  customer_name: string | null;
  customer_email: string | null;
  client_feedback: string | null;
  created_at: string;
}

const formatRequestNumber = (n: number | null) => n ? `CAD-${String(n).padStart(4, '0')}` : null;

const statusConfig: Record<string, { label: string; icon: any; className: string }> = {
  pending: { label: "Pending", icon: Clock, className: "bg-amber-500/15 text-amber-600 border-amber-500/30" },
  in_progress: { label: "In Progress", icon: Loader2, className: "bg-blue-500/15 text-blue-600 border-blue-500/30" },
  completed: { label: "Completed", icon: CheckCircle2, className: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30" },
  rejected: { label: "Rejected", icon: XCircle, className: "bg-red-500/15 text-red-600 border-red-500/30" },
  revision_requested: { label: "Revision Requested", icon: RotateCcw, className: "bg-orange-500/15 text-orange-600 border-orange-500/30" },
};

const sourceLabels: Record<string, string> = {
  ring_os: "Ring OS",
  ring_builder: "Ring Builder",
  diamond: "Diamond Form",
  grillz: "Grillz",
  custom_enquiry: "Custom Enquiry",
  custom: "Custom",
  resize: "Resize",
};

interface CadRequestsTabProps {
  clientId: string;
}

export function CadRequestsTab({ clientId }: CadRequestsTabProps) {
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<CadRequest | null>(null);
  const [statusFilter, setStatusFilter] = useState("all");

  const { data: requests = [], isLoading, refetch } = useQuery({
    queryKey: ["cad-requests", clientId],
    queryFn: async () => {
      // Fetch CAD requests
      const { data: cadData, error: cadError } = await supabase
        .from("cad_requests")
        .select("*")
        .eq("client_id", clientId)
        .order("created_at", { ascending: false });
      if (cadError) throw cadError;

      // Fetch resize requests
      const { data: resizeData, error: resizeError } = await supabase
        .from("cad_resize_requests")
        .select("*")
        .eq("client_id", clientId)
        .order("created_at", { ascending: false });
      if (resizeError) throw resizeError;

      // Map resize requests to CadRequest shape
      const mappedResizes: CadRequest[] = (resizeData || []).map((r: any) => ({
        id: r.id,
        request_number: null,
        source: "resize",
        lead_id: null,
        lead_table: null,
        ring_product_name: r.product_name || "CAD Resize",
        is_custom_ring: false,
        metal_type: r.metal_type,
        style: r.style,
        shape: r.shape,
        ring_size: r.requested_size,
        carat_size: null,
        custom_description: `Resize from ${r.current_size} → ${r.requested_size}`,
        status: r.status,
        priority: "normal",
        admin_notes: r.admin_notes,
        cad_file_urls: null,
        delivered_at: null,
        customer_name: null,
        customer_email: null,
        client_feedback: null,
        created_at: r.created_at,
      }));

      const combined = [...(cadData || []) as unknown as CadRequest[], ...mappedResizes];
      combined.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      return combined;
    },
    enabled: !!clientId,
  });

  // Realtime subscription
  useEffect(() => {
    if (!clientId) return;
    const channel = supabase
      .channel(`cad-requests-${clientId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "cad_requests", filter: `client_id=eq.${clientId}` }, () => {
        refetch();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [clientId, refetch]);

  const filtered = statusFilter === "all" ? requests : requests.filter(r => r.status === statusFilter);
  const counts = requests.reduce<Record<string, number>>((acc, r) => {
    acc[r.status] = (acc[r.status] || 0) + 1;
    return acc;
  }, {});

  if (selectedRequest) {
    return (
      <CadRequestDetailView
        request={selectedRequest}
        onBack={() => { setSelectedRequest(null); refetch(); }}
      />
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">CAD Requests</h2>
          <p className="text-sm text-muted-foreground">Request and track CAD design files for your jewelry</p>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="gap-2">
          <Plus className="h-4 w-4" />
          New CAD Request
        </Button>
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        {["all", "pending", "in_progress", "completed", "revision_requested", "rejected"].map(s => (
          <Button
            key={s}
            size="sm"
            variant={statusFilter === s ? "default" : "outline"}
            onClick={() => setStatusFilter(s)}
            className="capitalize text-xs"
          >
            {s === "all" ? "All" : s.replace(/_/g, " ")}
            {s === "all" ? ` (${requests.length})` : counts[s] ? ` (${counts[s]})` : ""}
          </Button>
        ))}
      </div>

      {/* List */}
      {isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2].map(i => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Package className="h-10 w-10 mx-auto mb-3 opacity-40" />
          <p className="font-medium">No CAD requests yet</p>
          <p className="text-sm mt-1">Click "New CAD Request" to get started</p>
        </div>
      ) : (
        <>
          {/* Mobile cards */}
          <div className="md:hidden space-y-2">
            {filtered.map(req => {
              const sc = statusConfig[req.status] || statusConfig.pending;
              const StatusIcon = sc.icon;
              return (
                <Card
                  key={req.id}
                  className="cursor-pointer hover:bg-muted/30 transition-colors"
                  onClick={() => setSelectedRequest(req)}
                >
                  <CardContent className="p-4 flex items-center justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        {formatRequestNumber(req.request_number) && (
                          <span className="text-xs font-mono text-muted-foreground">{formatRequestNumber(req.request_number)}</span>
                        )}
                        <span className="font-medium text-sm truncate">
                          {req.ring_product_name || req.custom_description?.slice(0, 40) || "CAD Request"}
                        </span>
                        <Badge variant="outline" className="text-[10px]">{sourceLabels[req.source] || req.source}</Badge>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        {req.customer_name && <span>{req.customer_name}</span>}
                        {req.metal_type && <span>• {req.metal_type}</span>}
                        {req.ring_size && <span>• Size {req.ring_size}</span>}
                        <span>• {format(new Date(req.created_at), "MMM d, yyyy")}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      {req.cad_file_urls && req.cad_file_urls.length > 0 && (
                        <FileDown className="h-4 w-4 text-emerald-500" />
                      )}
                      <Badge variant="outline" className={`text-[10px] ${sc.className}`}>
                        <StatusIcon className={`h-3 w-3 mr-1 ${req.status === 'in_progress' ? 'animate-spin' : ''}`} />
                        {sc.label}
                      </Badge>
                      <ArrowRight className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Desktop table */}
          <div className="hidden md:block">
            <Table containerClassName={stickyHeaderTableClass}>
              <TableHeader>
                <TableRow>
                  <TableHead>Ref #</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Metal</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="w-[40px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(req => {
                  const sc = statusConfig[req.status] || statusConfig.pending;
                  const StatusIcon = sc.icon;
                  return (
                    <TableRow
                      key={req.id}
                      className="cursor-pointer hover:bg-muted/50 transition-colors"
                      onClick={() => setSelectedRequest(req)}
                    >
                      <TableCell className="text-xs font-mono text-muted-foreground">
                        {formatRequestNumber(req.request_number) || "—"}
                      </TableCell>
                      <TableCell className="font-medium text-sm max-w-[200px] truncate">
                        {req.ring_product_name || req.custom_description?.slice(0, 30) || "—"}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[10px]">{sourceLabels[req.source] || req.source}</Badge>
                      </TableCell>
                      <TableCell className="text-sm">{req.customer_name || "—"}</TableCell>
                      <TableCell className="text-sm">{req.metal_type || "—"}</TableCell>
                      <TableCell className="text-sm">{req.ring_size || "—"}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`text-[10px] ${sc.className}`}>
                          <StatusIcon className={`h-3 w-3 mr-1 ${req.status === 'in_progress' ? 'animate-spin' : ''}`} />
                          {sc.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {format(new Date(req.created_at), "MMM d, yyyy")}
                      </TableCell>
                      <TableCell>
                        {req.cad_file_urls && req.cad_file_urls.length > 0 && (
                          <FileDown className="h-4 w-4 text-emerald-500" />
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </>
      )}

      <NewCadRequestDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        clientId={clientId}
        onCreated={() => { refetch(); setCreateOpen(false); }}
      />
    </div>
  );
}
