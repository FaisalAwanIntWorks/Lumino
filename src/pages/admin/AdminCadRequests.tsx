import { stickyHeaderTableClass } from "@/components/ui/table";
import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Loader2, Search } from "lucide-react";
import { format } from "date-fns";
import { AdminCadRequestDetailView } from "@/components/cad-requests/AdminCadRequestDetailView";
import { AdminResizeRequestDetail } from "@/components/cad-requests/AdminResizeRequestDetail";

const statusConfig: Record<string, { label: string; className: string }> = {
  pending: { label: "Pending", className: "bg-amber-500/15 text-amber-600 border-amber-500/30" },
  in_progress: { label: "In Progress", className: "bg-blue-500/15 text-blue-600 border-blue-500/30" },
  completed: { label: "Completed", className: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30" },
  revision_requested: { label: "Revision", className: "bg-orange-500/15 text-orange-600 border-orange-500/30" },
  rejected: { label: "Rejected", className: "bg-red-500/15 text-red-600 border-red-500/30" },
};

const sourceLabels: Record<string, string> = {
  ring_os: "Ring OS", ring_builder: "Ring Builder", grillz: "Grillz",
  custom_enquiry: "Custom Enquiry", custom: "Custom",
};

interface UnifiedRow {
  id: string;
  type: 'design' | 'resize';
  status: string;
  created_at: string;
  client_name: string;
  customer_name: string;
  customer_email: string;
  product_label: string;
  source: string;
  request_number?: number;
  raw: any;
}

export default function AdminCadRequests() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [selectedItem, setSelectedItem] = useState<UnifiedRow | null>(null);
  const deepLinkId = searchParams.get('id');

  // Fetch both tables in parallel
  const { data: designRequests, isLoading: loadingDesigns } = useQuery({
    queryKey: ["admin-cad-requests", statusFilter],
    queryFn: async () => {
      let query = (supabase as any)
        .from("cad_requests")
        .select("*, clients(company_name)")
        .order("created_at", { ascending: false })
        .limit(200);
      if (statusFilter !== "all") query = query.eq("status", statusFilter);
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
  });

  const { data: resizeRequests, isLoading: loadingResizes } = useQuery({
    queryKey: ["admin-cad-resize-requests", statusFilter],
    queryFn: async () => {
      let query = (supabase as any)
        .from("cad_resize_requests")
        .select("*, clients(company_name)")
        .order("created_at", { ascending: false })
        .limit(200);
      if (statusFilter !== "all") query = query.eq("status", statusFilter);
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
  });

  const isLoading = loadingDesigns || loadingResizes;

  // Merge into a unified list
  const unified: UnifiedRow[] = [
    ...(designRequests || []).map((r: any) => ({
      id: r.id,
      type: 'design' as const,
      status: r.status,
      created_at: r.created_at,
      client_name: r.clients?.company_name || '—',
      customer_name: r.customer_name || '—',
      customer_email: r.customer_email || '',
      product_label: r.ring_product_name || r.custom_description?.slice(0, 40) || '—',
      source: sourceLabels[r.source] || r.source,
      request_number: r.request_number,
      raw: r,
    })),
    ...(resizeRequests || []).map((r: any) => ({
      id: r.id,
      type: 'resize' as const,
      status: r.status,
      created_at: r.created_at,
      client_name: r.clients?.company_name || '—',
      customer_name: '—',
      customer_email: '',
      product_label: r.product_name || `${r.current_size} → ${r.requested_size}`,
      source: 'Resize',
      raw: r,
    })),
  ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  // Deep-link: auto-select item from URL query param
  useEffect(() => {
    if (deepLinkId && unified.length > 0 && !selectedItem) {
      const match = unified.find(r => r.id === deepLinkId);
      if (match) {
        setSelectedItem(match);
        setSearchParams({}, { replace: true });
      }
    }
  }, [deepLinkId, unified.length]);

  // Apply filters
  const filtered = unified.filter((r) => {
    if (typeFilter !== 'all' && r.type !== typeFilter) return false;
    if (!search.trim()) return true;
    const s = search.toLowerCase();
    return (
      r.customer_name.toLowerCase().includes(s) ||
      r.customer_email.toLowerCase().includes(s) ||
      r.product_label.toLowerCase().includes(s) ||
      r.client_name.toLowerCase().includes(s) ||
      String(r.request_number || "").includes(s)
    );
  });

  // Detail views
  if (selectedItem) {
    if (selectedItem.type === 'design') {
      return (
        <div className="p-4 sm:p-6 lg:p-8">
          <AdminCadRequestDetailView
            request={selectedItem.raw}
            onBack={() => setSelectedItem(null)}
          />
        </div>
      );
    }
    return (
      <div className="p-4 sm:p-6 lg:p-8">
        <AdminResizeRequestDetail
          request={selectedItem.raw}
          onBack={() => setSelectedItem(null)}
        />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">CAD Requests</h1>
        <p className="text-muted-foreground text-sm mt-1">All CAD design and resize requests from clients</p>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search by name, email, product..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
        </div>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="design">Design</SelectItem>
            <SelectItem value="resize">Resize</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="in_progress">In Progress</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="revision_requested">Revision</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">No CAD requests found.</div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <Table containerClassName={stickyHeaderTableClass}>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[80px]">ID</TableHead>
                <TableHead className="w-[80px]">Type</TableHead>
                <TableHead>Client</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Product / Details</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((r) => {
                const sc = statusConfig[r.status] || statusConfig.pending;
                return (
                  <TableRow key={r.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setSelectedItem(r)}>
                    <TableCell className="font-mono text-xs">
                      {r.request_number ? `CAD-${String(r.request_number).padStart(4, "0")}` : r.id.slice(0, 8)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`text-[10px] ${r.type === 'resize' ? 'bg-violet-500/15 text-violet-600 border-violet-500/30' : 'bg-sky-500/15 text-sky-600 border-sky-500/30'}`}>
                        {r.type === 'resize' ? 'Resize' : 'Design'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">{r.client_name}</TableCell>
                    <TableCell>
                      <div>
                        <p className="text-sm font-medium">{r.customer_name}</p>
                        <p className="text-xs text-muted-foreground">{r.customer_email}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[10px]">{r.source}</Badge>
                    </TableCell>
                    <TableCell className="text-sm max-w-[200px] truncate">{r.product_label}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`text-[10px] ${sc.className}`}>{sc.label}</Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {format(new Date(r.created_at), "MMM d, yyyy")}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
