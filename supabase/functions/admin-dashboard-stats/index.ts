import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Order statuses that void the sale for revenue purposes. Compared
// case-insensitively so a client's own "Cancelled" / "Refunded" tag counts.
const VOID_ORDER_STATUSES = new Set(["refunded", "canceled", "cancelled"]);
const isVoidOrderStatus = (status: unknown) =>
  VOID_ORDER_STATUSES.has(String(status ?? "").trim().toLowerCase());

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } }
  );

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData.user) throw new Error("Authentication failed");

    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userData.user.id)
      .eq("role", "agency_admin")
      .maybeSingle();
    if (!roleData) throw new Error("Unauthorized: not an admin");

    const body = await req.json().catch(() => ({}));
    const { clientId, dateFrom, dateTo } = body;

    const addDateFilter = (q: any) => {
      if (dateFrom) q = q.gte("created_at", dateFrom);
      if (dateTo) q = q.lte("created_at", dateTo);
      return q;
    };
    const addClientFilter = (q: any) => {
      if (clientId) q = q.eq("client_id", clientId);
      return q;
    };
    const addBoth = (q: any) => addDateFilter(addClientFilter(q));

    // ---------- Parallel queries ----------
    //
    // Lead tables are aggregated in SQL (get_admin_lead_aggregates). This
    // used to SELECT up to 500 rows per table (1000 for saved_designs) with
    // no ORDER BY and group them here; any table over the cap inside the
    // range (diamond_form_leads is >1100 in the default 30-day view) fed an
    // arbitrary subset into Top Clients, the Lead Activity chart and the
    // Lead Status pie. Only the exact-count KPI tile was unaffected.
    const [
      clientsRes,
      ordersRes,
      leadAggRes,
      trafficEventsRes,
      cadStatusReqRes,
      cadStatusResizeRes,
      productRevenueRes,
    ] = await Promise.all([
      supabase.from("clients").select("id, company_name, status"),
      addBoth(supabase.from("orders").select("id, total_amount, status, created_at, client_id").order("created_at", { ascending: false }).limit(5000)),
      supabase.rpc("get_admin_lead_aggregates", {
        p_client_id: clientId ?? null,
        p_start: dateFrom ?? null,
        p_end: dateTo ?? null,
      }),
      // Daily widget views, aggregated in SQL. Was a raw `.limit(5000)` with no
      // ORDER BY, so any busier window silently returned an arbitrary subset and
      // the traffic chart under-reported.
      supabase.rpc("get_widget_view_daily", {
        p_client_id: clientId ?? null,
        p_start_date: dateFrom ?? null,
        p_end_date: dateTo ?? null,
        p_timezone: "UTC",
      }),
      addBoth(supabase.from("cad_requests").select("status")),
      addBoth(supabase.from("cad_resize_requests").select("status")),
      // Revenue per product + client + currency: line-item price only (no tax /
      // shipping), refunded + cancelled orders excluded, currencies never added
      // together. The all-clients view leaves out internal/test accounts
      // (clients.exclude_from_admin_revenue); those accounts still see their own
      // revenue on their own dashboard.
      supabase.rpc("get_product_revenue", {
        p_client_id: clientId ?? null,
        p_start: dateFrom ?? null,
        p_end: dateTo ?? null,
        p_exclude_internal: !clientId,
      }),
    ]);

    if (leadAggRes.error) {
      throw new Error(`get_admin_lead_aggregates failed: ${leadAggRes.error.message}`);
    }
    type ClientCount = { client_id: string; count: number };
    const leadAgg = (leadAggRes.data ?? {}) as {
      totals?: Record<string, number>;
      total_leads?: number;
      daily?: { day: string; count: number }[];
      per_client?: ClientCount[];
      per_client_metal?: ClientCount[];
      ai_per_client?: ClientCount[];
      lead_status?: Record<string, number>;
      booking_status?: Record<string, number>;
    };
    const leadTotals = leadAgg.totals ?? {};

    const allClients = clientsRes.data || [];
    const clientNameMap: Record<string, string> = {};
    allClients.forEach((c: any) => { clientNameMap[c.id] = c.company_name; });

    const orders = ordersRes.data || [];

    // ===== KPIs =====
    // Refunded / cancelled orders are excluded, matching get_product_revenue.
    const totalRevenue = orders
      .filter((o: any) => !isVoidOrderStatus(o.status))
      .reduce((s: number, o: any) => s + Number(o.total_amount || 0), 0);
    const totalLeads = Number(leadAgg.total_leads ?? 0);
    const totalBookings = Number(leadTotals.appointment_bookings ?? 0);
    const totalMetalIQ = Number(leadTotals.metal_buying_leads ?? 0);

    // ===== Revenue distribution (null when the RPC is unavailable, so the UI
    // can fall back to the legacy tile instead of showing a wrong $0) =====
    type CurrencyAmount = { currency: string; amount: number; orders: number };
    type RevenueClient = { id: string; name: string; currency: string; amount: number; orders: number };
    const sumByCurrency = (rows: RevenueClient[]): CurrencyAmount[] => {
      const m: Record<string, CurrencyAmount> = {};
      rows.forEach((r) => {
        const c = (m[r.currency] ||= { currency: r.currency, amount: 0, orders: 0 });
        c.amount += r.amount;
        c.orders += r.orders;
      });
      return Object.values(m).sort((a, b) => b.amount - a.amount);
    };
    let revenueBreakdown: {
      byCurrency: CurrencyAmount[];
      byProduct: { product: string; byCurrency: CurrencyAmount[]; clients: RevenueClient[] }[];
    } | null = null;
    if (productRevenueRes.error) {
      console.error("[ADMIN-DASHBOARD-STATS] get_product_revenue failed:", productRevenueRes.error.message);
    } else {
      const rows = ((productRevenueRes.data as any[]) || []).map((r: any) => ({
        product: String(r.product || "other"),
        id: r.client_id,
        name: r.company_name || "Unknown",
        currency: r.currency || "USD",
        amount: Number(r.revenue || 0),
        orders: Number(r.order_count || 0),
      }));
      // Shopify-backed products always listed (even at zero) so the split is
      // readable; metal_iq / other only when rows exist.
      const products = ["ring_os", "ring_builder", "grillz_builder", "custom_enquiry"];
      rows.forEach((r) => { if (!products.includes(r.product)) products.push(r.product); });
      revenueBreakdown = {
        byCurrency: sumByCurrency(rows),
        byProduct: products.map((product) => {
          const clients = rows.filter((r) => r.product === product).map(({ product: _p, ...c }) => c);
          return { product, byCurrency: sumByCurrency(clients), clients };
        }),
      };
    }

    // ===== Daily Leads (for chart) — UTC day buckets, already sorted =====
    const dailyLeads = (leadAgg.daily ?? []).map((r) => ({
      date: String(r.day).slice(0, 10),
      count: Number(r.count || 0),
    }));

    // ===== Daily Traffic (for chart) =====
    if (trafficEventsRes.error) {
      console.error("[ADMIN-DASHBOARD-STATS] get_widget_view_daily failed:", trafficEventsRes.error.message);
    }
    const dailyTraffic = ((trafficEventsRes.data as any[]) || [])
      .map((r: any) => ({
        date: typeof r.day === "string" ? r.day.slice(0, 10) : String(r.day),
        count: Number(r.total_count || 0),
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // ===== Top Clients (RPC rows arrive sorted desc; slice defensively) =====
    const toTopClients = (rows: ClientCount[] | undefined) =>
      (rows ?? [])
        .map((r) => ({ id: r.client_id, name: clientNameMap[r.client_id] || "Unknown", count: Number(r.count || 0) }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 8);
    const topClientsByLeads = toTopClients(leadAgg.per_client);
    const topClientsByGenerations = toTopClients(leadAgg.ai_per_client);
    const topClientsByMetalIQ = toTopClients(leadAgg.per_client_metal);

    // ===== Status counts =====
    const countStatuses = (rows: any[]) => {
      const m: Record<string, number> = {};
      rows.forEach((r: any) => {
        const s = r.status || "unknown";
        m[s] = (m[s] || 0) + 1;
      });
      return m;
    };
    const toNumberMap = (obj: Record<string, number> | undefined) => {
      const m: Record<string, number> = {};
      Object.entries(obj ?? {}).forEach(([k, v]) => { m[k] = Number(v || 0); });
      return m;
    };

    // Lead follow_up_status across the 6 non-booking sources (null -> "new")
    const leadStatusCounts = toNumberMap(leadAgg.lead_status);

    // Booking statuses (separate — confirmed/cancelled/etc)
    const bookingStatusCounts = toNumberMap(leadAgg.booking_status);

    const orderStatusCounts = countStatuses(orders);

    const cadCombined = [...(cadStatusReqRes.data || []), ...(cadStatusResizeRes.data || [])];
    const cadStatusCounts = countStatuses(cadCombined);

    const result = {
      totalRevenue,
      revenueBreakdown,
      totalLeads,
      totalBookings,
      totalMetalIQ,
      // Exact per-table counts, so the dashboard can split leads by module.
      leadTotals: Object.fromEntries(Object.entries(leadTotals).map(([k, v]) => [k, Number(v || 0)])),
      dailyLeads,
      dailyTraffic,
      topClientsByLeads,
      topClientsByGenerations,
      topClientsByMetalIQ,
      leadStatusCounts,
      bookingStatusCounts,
      orderStatusCounts,
      cadStatusCounts,
    };

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[ADMIN-DASHBOARD-STATS] ERROR:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
