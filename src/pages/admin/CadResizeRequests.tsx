import { stickyHeaderTableClass } from "@/components/ui/table";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Loader2, Package, Search, ArrowLeft } from "lucide-react";
import { format } from "date-fns";
import { AdminResizeRequestDetail } from "@/components/cad-requests/AdminResizeRequestDetail";

type ResizeRequest = {
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
};

const STATUS_OPTIONS = ["pending", "in_progress", "completed", "rejected"] as const;

const statusColor: Record<string, string> = {
  pending: "bg-amber-500/15 text-amber-600 border-amber-500/30",
  in_progress: "bg-blue-500/15 text-blue-600 border-blue-500/30",
  completed: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30",
  rejected: "bg-red-500/15 text-red-600 border-red-500/30",
};

export default function CadResizeRequests() {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [clientFilter, setClientFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedRequest, setSelectedRequest] = useState<ResizeRequest | null>(null);

  const { data: clients = [] } = useQuery({
    queryKey: ["admin-clients-list"],
    queryFn: async () => {
      const { data } = await supabase.from("clients").select("id, company_name").order("company_name");
      return data || [];
    },
  });

  const { data: requests = [], isLoading } = useQuery({
    queryKey: ["admin-cad-resize-requests"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cad_resize_requests")
        .select("*, clients(company_name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as ResizeRequest[];
    },
  });

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

  const filtered = requests.filter(r => {
    if (statusFilter !== "all" && r.status !== statusFilter) return false;
    if (clientFilter !== "all" && r.client_id !== clientFilter) return false;
    if (searchQuery) {
      const q = searchQuery.trim().toLowerCase();
      const matchesProduct = r.product_name?.toLowerCase().includes(q);
      const matchesClient = r.clients?.company_name?.toLowerCase().includes(q);
      const matchesOrder = r.order_id?.toLowerCase().includes(q);
      if (!matchesProduct && !matchesClient && !matchesOrder) return false;
    }
    return true;
  });

  const counts = requests.reduce<Record<string, number>>((acc, r) => {
    acc[r.status] = (acc[r.status] || 0) + 1;
    return acc;
  }, {});

  if (selectedRequest) {
    return (
      <div className="p-4 md:p-6">
        <AdminResizeRequestDetail
          request={selectedRequest}
          onBack={() => setSelectedRequest(null)}
        />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">CAD Resize Requests</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage CAD resize requests from clients
          </p>
        </div>
        <div className="flex gap-2 flex-wrap text-xs">
          <Badge variant="outline">{requests.length} total</Badge>
          {counts.pending && <Badge variant="outline" className={statusColor.pending}>{counts.pending} pending</Badge>}
          {counts.in_progress && <Badge variant="outline" className={statusColor.in_progress}>{counts.in_progress} in progress</Badge>}
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by product, client, order..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="pl-9 h-9 text-sm"
          />
        </div>
        <Select value={clientFilter} onValueChange={setClientFilter}>
          <SelectTrigger className="w-[180px] h-9 text-xs">
            <SelectValue placeholder="All Clients" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all" className="text-xs">All Clients</SelectItem>
            {clients.map(c => (
              <SelectItem key={c.id} value={c.id} className="text-xs">{c.company_name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex gap-2 flex-wrap">
        {["all", ...STATUS_OPTIONS].map(s => (
          <Button
            key={s}
            size="sm"
            variant={statusFilter === s ? "default" : "outline"}
            onClick={() => setStatusFilter(s)}
            className="capitalize text-xs"
          >
            {s === "all" ? "All" : s.replace("_", " ")}
            {s === "all" ? ` (${requests.length})` : counts[s] ? ` (${counts[s]})` : ""}
          </Button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Package className="h-10 w-10 mx-auto mb-3 opacity-40" />
          <p>No resize requests found</p>
        </div>
      ) : (
        <Table containerClassName={stickyHeaderTableClass}>
          <TableHeader>
            <TableRow>
              <TableHead>Product</TableHead>
              <TableHead>Client</TableHead>
              <TableHead>Current Size</TableHead>
              <TableHead>Requested Size</TableHead>
              <TableHead>Metal</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map(req => (
              <TableRow
                key={req.id}
                className="cursor-pointer hover:bg-muted/50 transition-colors"
                onClick={() => setSelectedRequest(req)}
              >
                <TableCell className="font-medium text-sm max-w-[200px] truncate">
                  {req.product_name || "—"}
                </TableCell>
                <TableCell className="text-sm">{req.clients?.company_name || "—"}</TableCell>
                <TableCell className="text-sm font-mono">{req.current_size}</TableCell>
                <TableCell className="text-sm font-mono font-semibold">{req.requested_size}</TableCell>
                <TableCell className="text-sm">{req.metal_type || "—"}</TableCell>
                <TableCell>
                  <Badge variant="outline" className={`text-[10px] ${statusColor[req.status] || ""}`}>
                    {req.status.replace("_", " ")}
                  </Badge>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {format(new Date(req.created_at), "MMM d, yyyy")}
                </TableCell>
                <TableCell>
                  <div onClick={e => e.stopPropagation()}>
                    <Select
                      value={req.status}
                      onValueChange={val => updateMutation.mutate({ id: req.id, status: val })}
                    >
                      <SelectTrigger className="w-[110px] h-7 text-[10px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {STATUS_OPTIONS.map(s => (
                          <SelectItem key={s} value={s} className="capitalize text-xs">{s.replace("_", " ")}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
