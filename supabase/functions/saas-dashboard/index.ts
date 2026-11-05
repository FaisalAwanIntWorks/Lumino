import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "npm:stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const log = (step: string, details?: any) => {
  console.log(`[SAAS-DASHBOARD] ${step}${details ? ` - ${JSON.stringify(details)}` : ""}`);
};

const PRODUCT_TO_PLAN: Record<string, string> = {
  "prod_UGgB0Tb65CLIxU": "Custom X",
  "prod_UGgC8yqQ2TOCDo": "RingOS",
  "prod_UGgDWYC2ZhDSRc": "Aurezo Suite",
  "prod_U9aNbkeYJBargN": "RingOS",
};

/** Convert dateRange string to a unix timestamp cutoff */
function getDateCutoff(dateRange: string | undefined): number | null {
  if (!dateRange || dateRange === "all") return null;
  const now = Date.now();
  const ms: Record<string, number> = {
    "7d": 7 * 86400000,
    "30d": 30 * 86400000,
    "90d": 90 * 86400000,
    "12m": 365 * 86400000,
  };
  const offset = ms[dateRange];
  return offset ? Math.floor((now - offset) / 1000) : null;
}

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
    log("Function started");

    // Auth check
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

    log("Auth verified");

    // Parse dateRange from body
    const body = await req.json().catch(() => ({}));
    const dateRange = body.dateRange as string | undefined;
    const cutoff = getDateCutoff(dateRange);

    log("Date range", { dateRange, cutoff });

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY not set");

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil", maxNetworkRetries: 3 });

    // Build Stripe list params with optional created filter
    const stripeCreatedFilter = cutoff ? { created: { gte: cutoff } } : {};

    // Fetch Stripe data + activity log in parallel
    const [
      activeSubsRes,
      canceledSubsRes,
      pastDueSubsRes,
      trialingSubsRes,
      customersRes,
      invoicesRes,
      clientsRes,
      aiUsageRes,
      activityRes,
    ] = await Promise.all([
      stripe.subscriptions.list({ status: "active", limit: 100 }),
      stripe.subscriptions.list({ status: "canceled", limit: 100 }),
      stripe.subscriptions.list({ status: "past_due", limit: 100 }),
      stripe.subscriptions.list({ status: "trialing", limit: 100 }),
      stripe.customers.list({ limit: 100, ...stripeCreatedFilter }),
      stripe.invoices.list({ limit: 100, ...stripeCreatedFilter }),
      supabase.from("clients").select("id, company_name, status, created_at, updated_at, email"),
      supabase.from("ai_usage_logs").select("client_id, feature, created_at").order("created_at", { ascending: false }).limit(1000),
      supabase.from("admin_logging_information").select("id, action_type, action_category, description, admin_email, created_at, target_client_name").order("created_at", { ascending: false }).limit(30),
    ]);

    const allClients = clientsRes.data || [];
    const now = new Date();
    const cutoffDate = cutoff ? new Date(cutoff * 1000) : null;
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    // For filtered views, use the cutoff date; for "all" use month start
    const periodStart = cutoffDate || monthStart;

    // KPIs
    const totalClients = allClients.length;
    const newThisMonth = allClients.filter((c: any) => new Date(c.created_at) >= periodStart).length;
    const churnedThisMonth = canceledSubsRes.data.filter((s) => {
      const canceledAt = s.canceled_at ? new Date(s.canceled_at * 1000) : null;
      return canceledAt && canceledAt >= periodStart;
    }).length;

    // MRR from active subscriptions
    let mrr = 0;
    const planDistribution: Record<string, number> = {};
    const revenueByPlan: Record<string, number> = {};

    for (const sub of [...activeSubsRes.data, ...trialingSubsRes.data]) {
      const item = sub.items.data[0];
      if (!item) continue;
      const monthlyAmount = item.price.unit_amount
        ? (item.price.recurring?.interval === "year"
          ? item.price.unit_amount / 12
          : item.price.unit_amount) / 100
        : 0;
      mrr += monthlyAmount;

      const productId = typeof item.price.product === "string" ? item.price.product : "";
      const planName = PRODUCT_TO_PLAN[productId] || "Other";
      planDistribution[planName] = (planDistribution[planName] || 0) + 1;
      revenueByPlan[planName] = (revenueByPlan[planName] || 0) + monthlyAmount;
    }

    // Filter invoices by date range
    const filteredInvoices = cutoff
      ? invoicesRes.data.filter((inv) => (inv.created || 0) >= cutoff)
      : invoicesRes.data;

    // Total revenue from paid invoices
    const paidInvoices = filteredInvoices.filter((inv) => inv.status === "paid");
    const totalStripeRevenue = paidInvoices.reduce((sum, inv) => sum + (inv.amount_paid || 0), 0) / 100;

    // Failed payments
    const failedPayments = filteredInvoices.filter((inv) => inv.status === "open" || inv.status === "uncollectible").length;

    // Average revenue per client
    const avgRevenuePerClient = totalClients > 0 ? totalStripeRevenue / totalClients : 0;

    // MRR over time (last 12 months from invoices — always show 12 months for trend context)
    const allPaidInvoices = invoicesRes.data.filter((inv) => inv.status === "paid");
    const mrrOverTime: { month: string; mrr: number }[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const label = d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
      const monthRevenue = allPaidInvoices
        .filter((inv) => {
          const invDate = new Date((inv.created || 0) * 1000);
          return invDate.getFullYear() === d.getFullYear() && invDate.getMonth() === d.getMonth();
        })
        .reduce((sum, inv) => sum + (inv.amount_paid || 0), 0) / 100;
      mrrOverTime.push({ month: label, mrr: monthRevenue });
    }

    // New clients vs cancellations over time (last 12 months)
    const growthOverTime: { month: string; newClients: number; cancellations: number }[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const nextMonth = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
      const label = d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
      const nc = allClients.filter((c: any) => {
        const cd = new Date(c.created_at);
        return cd >= d && cd < nextMonth;
      }).length;
      const cancels = canceledSubsRes.data.filter((s) => {
        const ca = s.canceled_at ? new Date(s.canceled_at * 1000) : null;
        return ca && ca >= d && ca < nextMonth;
      }).length;
      growthOverTime.push({ month: label, newClients: nc, cancellations: cancels });
    }

    // Plan distribution array
    const planDistArr = Object.entries(planDistribution).map(([name, count]) => ({ name, count }));
    const revByPlanArr = Object.entries(revenueByPlan).map(([name, revenue]) => ({ name, revenue: Math.round(revenue) }));

    // Top clients by AI usage (filtered by date range)
    const aiUsageLogs = aiUsageRes.data || [];
    const filteredAiLogs = cutoffDate
      ? aiUsageLogs.filter((r: any) => new Date(r.created_at) >= cutoffDate)
      : aiUsageLogs;
    const aiCountMap: Record<string, number> = {};
    filteredAiLogs.forEach((r: any) => {
      aiCountMap[r.client_id] = (aiCountMap[r.client_id] || 0) + 1;
    });
    const topClientsByAI = Object.entries(aiCountMap)
      .map(([clientId, count]) => {
        const client = allClients.find((c: any) => c.id === clientId);
        return { name: client?.company_name || "Unknown", usage: count };
      })
      .sort((a, b) => b.usage - a.usage)
      .slice(0, 10);

    // Top clients by revenue (from invoices matched by email)
    const clientEmailMap: Record<string, string> = {};
    allClients.forEach((c: any) => {
      if (c.email) clientEmailMap[c.email.toLowerCase()] = c.company_name;
    });
    const revenueByClient: Record<string, number> = {};
    paidInvoices.forEach((inv) => {
      const email = inv.customer_email?.toLowerCase() || "";
      const clientName = clientEmailMap[email] || email || "Unknown";
      revenueByClient[clientName] = (revenueByClient[clientName] || 0) + (inv.amount_paid || 0) / 100;
    });
    const topClientsByRevenue = Object.entries(revenueByClient)
      .map(([name, revenue]) => ({ name, revenue: Math.round(revenue) }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);

    // Recent signups (filtered)
    const filteredClients = cutoffDate
      ? allClients.filter((c: any) => new Date(c.created_at) >= cutoffDate)
      : allClients;
    const recentSignups = filteredClients
      .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 20)
      .map((c: any) => ({ name: c.company_name, status: c.status, created_at: c.created_at }));

    // Recent activity events
    const recentEvents = (activityRes.data || []).map((e: any) => ({
      id: e.id,
      type: e.action_type,
      category: e.action_category,
      description: e.description,
      admin: e.admin_email,
      client: e.target_client_name,
      created_at: e.created_at,
    }));

    const result = {
      kpis: {
        totalClients,
        newThisMonth,
        churnedThisMonth,
        mrr: Math.round(mrr),
        totalStripeRevenue: Math.round(totalStripeRevenue),
        failedPayments,
        avgRevenuePerClient: Math.round(avgRevenuePerClient),
        activeSubscriptions: activeSubsRes.data.length,
        trialingSubscriptions: trialingSubsRes.data.length,
        pastDueSubscriptions: pastDueSubsRes.data.length,
      },
      charts: {
        mrrOverTime,
        growthOverTime,
        planDistribution: planDistArr,
        revenueByPlan: revByPlanArr,
      },
      tables: {
        topClientsByRevenue,
        topClientsByAI,
        recentSignups,
        recentEvents,
      },
    };

    log("Returning SaaS data", { totalClients, mrr: Math.round(mrr), activeSubscriptions: activeSubsRes.data.length, dateRange });

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    log("ERROR", { message: msg });
    return new Response(JSON.stringify({ error: msg }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
