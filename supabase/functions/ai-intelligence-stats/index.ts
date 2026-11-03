import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, serviceKey);

    // Auth check
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authErr } = await sb.auth.getUser(token);
    if (authErr || !user) return json({ error: "Unauthorized" }, 401);

    const { data: roleCheck } = await sb.rpc("has_role", { _user_id: user.id, _role: "agency_admin" });
    if (!roleCheck) return json({ error: "Forbidden" }, 403);

    const { days = 30, clientId } = await req.json().catch(() => ({}));
    const since = new Date(Date.now() - days * 86400000).toISOString();
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();

    // Build client filter
    const clientFilter = clientId ? `AND client_id = '${clientId}'` : "";

    // 1) KPIs — total requests, tokens, cost by feature category
    // Use direct queries instead
    let logsQuery = sb
      .from("ai_usage_logs")
      .select("id, client_id, feature, model, input_tokens, output_tokens, cached, created_at")
      .gte("created_at", since)
      .order("created_at", { ascending: false });
    if (clientId) logsQuery = logsQuery.eq("client_id", clientId);

    let sessionsQuery = sb
      .from("ai_chat_sessions")
      .select("id, session_id, client_id, message_count, configuration_applied, design_saved, started_at, ended_at")
      .gte("started_at", since)
      .order("started_at", { ascending: false });
    if (clientId) sessionsQuery = sessionsQuery.eq("client_id", clientId);

    let monthlySummaryQuery = sb
      .from("ai_usage_monthly_summary")
      .select("*")
      .order("month", { ascending: true });
    if (clientId) monthlySummaryQuery = monthlySummaryQuery.eq("client_id", clientId);

    const clientsQuery = sb.from("clients").select("id, company_name");

    // Fetch effective costs from platform_ai_config
    const { data: configRow } = await sb
      .from("platform_ai_config" as any)
      .select("image_base_cost, image_multiplier, chat_base_cost, chat_multiplier")
      .limit(1)
      .single();
    const cfg = configRow as any;
    const effectiveImageCost = cfg ? (cfg.image_base_cost ?? 0.072) * (cfg.image_multiplier ?? 1) : 0.072;
    const effectiveChatCost = cfg ? (cfg.chat_base_cost ?? 0.0009) * (cfg.chat_multiplier ?? 1) : 0.0009;
    const baseImageCost = cfg?.image_base_cost ?? 0.072;
    const baseChatCost = cfg?.chat_base_cost ?? 0.0009;

    // Fetch all pages of logs (bypass 1000 limit)
    async function fetchAll<T>(query: any): Promise<T[]> {
      const PAGE = 1000;
      let all: T[] = [];
      let offset = 0;
      while (true) {
        const { data, error } = await query.range(offset, offset + PAGE - 1);
        if (error) throw error;
        if (!data || data.length === 0) break;
        all = all.concat(data);
        if (data.length < PAGE) break;
        offset += PAGE;
      }
      return all;
    }

    const [logs, sessions, monthlySummary, clientsData] = await Promise.all([
      fetchAll<any>(logsQuery),
      fetchAll<any>(sessionsQuery),
      fetchAll<any>(monthlySummaryQuery),
      clientsQuery.then(r => r.data ?? []),
    ]);

    const clientMap: Record<string, string> = {};
    clientsData.forEach((c: any) => { clientMap[c.id] = c.company_name; });

    // ── Compute aggregates ──

    // Feature breakdown
    const featureCounts: Record<string, number> = {};
    const modelCounts: Record<string, number> = {};
    const clientCounts: Record<string, { requests: number; cost: number; baseCost: number; name: string }> = {};
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let cachedCount = 0;

    const chatFeatures = new Set(["ring_chat", "help_chat"]);
    const imageFeatures = new Set(["ring_preview", "grillz_preview", "enquiry_preview"]);

    // Use dynamic costs from config
    function featureCostClient(feature: string): number {
      if (imageFeatures.has(feature)) return effectiveImageCost;
      return effectiveChatCost;
    }
    function featureCostBase(feature: string): number {
      if (imageFeatures.has(feature)) return baseImageCost;
      return baseChatCost;
    }

    logs.forEach((l: any) => {
      featureCounts[l.feature] = (featureCounts[l.feature] || 0) + 1;
      modelCounts[l.model] = (modelCounts[l.model] || 0) + 1;
      totalInputTokens += l.input_tokens || 0;
      totalOutputTokens += l.output_tokens || 0;
      if (l.cached) cachedCount++;

      const cid = l.client_id;
      if (!clientCounts[cid]) clientCounts[cid] = { requests: 0, cost: 0, baseCost: 0, name: clientMap[cid] || "Unknown" };
      clientCounts[cid].requests++;
      clientCounts[cid].cost += featureCostClient(l.feature);
      clientCounts[cid].baseCost += featureCostBase(l.feature);
    });

    const totalRequests = logs.length;
    const chatCount = logs.filter((l: any) => chatFeatures.has(l.feature)).length;
    const imageCount = logs.filter((l: any) => imageFeatures.has(l.feature)).length;
    const costEstCount = logs.filter((l: any) => l.feature === "cost_estimate").length;
    const totalClientCharge = chatCount * effectiveChatCost + imageCount * effectiveImageCost + costEstCount * effectiveChatCost;
    const totalBaseCost = chatCount * baseChatCost + imageCount * baseImageCost + costEstCount * baseChatCost;
    const cacheRate = totalRequests > 0 ? Math.round((cachedCount / totalRequests) * 100) : 0;

    // Cost breakdown — both base and client charge
    const costBreakdown = {
      chat: chatCount * effectiveChatCost,
      image: imageCount * effectiveImageCost,
      costEstimate: costEstCount * effectiveChatCost,
      baseCost: { chat: chatCount * baseChatCost, image: imageCount * baseImageCost, costEstimate: costEstCount * baseChatCost },
    };

    // Top clients
    const topClientsByRequests = Object.entries(clientCounts)
      .map(([id, v]) => ({ clientId: id, name: v.name, requests: v.requests, cost: v.cost }))
      .sort((a, b) => b.requests - a.requests)
      .slice(0, 10);

    const topClientsByCost = [...topClientsByRequests].sort((a, b) => b.cost - a.cost).slice(0, 10);

    // Unique active clients
    const activeClients = new Set(logs.map((l: any) => l.client_id)).size;
    const avgCostPerClient = activeClients > 0 ? totalClientCharge / activeClients : 0;

    // Model distribution
    const modelDistribution = Object.entries(modelCounts)
      .map(([model, count]) => ({ model, count }))
      .sort((a, b) => b.count - a.count);

    // Feature distribution
    const featureDistribution = Object.entries(featureCounts)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);

    // Daily trend
    const dayMap: Record<string, Record<string, number>> = {};
    for (let i = Math.min(days, 90) - 1; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
      dayMap[d] = {};
    }
    logs.forEach((l: any) => {
      const d = l.created_at.slice(0, 10);
      if (dayMap[d]) {
        dayMap[d][l.feature] = (dayMap[d][l.feature] || 0) + 1;
      }
    });
    const dailyTrend = Object.entries(dayMap).map(([date, feats]) => ({
      date,
      ...feats,
      total: Object.values(feats).reduce((a, b) => a + b, 0),
    }));

    // Chat session stats
    const totalSessions = sessions.length;
    const configApplied = sessions.filter((s: any) => s.configuration_applied).length;
    const designSaved = sessions.filter((s: any) => s.design_saved).length;
    const converted = sessions.filter((s: any) => s.configuration_applied || s.design_saved).length;
    const conversionRate = totalSessions > 0 ? Math.round((converted / totalSessions) * 100) : 0;

    // Average session duration (minutes)
    const durableSessions = sessions.filter((s: any) => s.started_at && s.ended_at);
    const avgDurationMin = durableSessions.length > 0
      ? Math.round(durableSessions.reduce((sum: number, s: any) => sum + (new Date(s.ended_at).getTime() - new Date(s.started_at).getTime()), 0) / durableSessions.length / 60000)
      : 0;

    // Projected monthly cost (based on daily average)
    const daysInData = Math.max(1, Math.min(days, 90));
    const dailyAvgCost = totalClientCharge / daysInData;
    const projectedMonthlyCost = dailyAvgCost * 30;
    const dailyAvgBaseCost = totalBaseCost / daysInData;
    const projectedMonthlyBaseCost = dailyAvgBaseCost * 30;

    // Monthly summary for historical chart
    const monthlyChart = monthlySummary.reduce((acc: any[], row: any) => {
      let entry = acc.find((e) => e.month === row.month);
      if (!entry) {
        entry = { month: row.month, requests: 0, tokens: 0 };
        acc.push(entry);
      }
      entry.requests += row.total_requests;
      entry.tokens += row.total_input_tokens + row.total_output_tokens;
      return acc;
    }, []);

    // Per-client cost table (for cost analysis)
    // Fetch wallet data for balance info
    const { data: wallets } = await sb.from("client_wallets").select("client_id, balance, lifetime_credits, lifetime_debits");
    const { data: freeCredits } = await sb.from("client_free_credits").select("client_id, dollars_remaining").gt("expires_at", new Date().toISOString()).gt("dollars_remaining", 0);

    const walletMap: Record<string, { balance: number; lifetimeCredits: number; lifetimeDebits: number }> = {};
    (wallets ?? []).forEach((w: any) => {
      walletMap[w.client_id] = { balance: w.balance, lifetimeCredits: w.lifetime_credits, lifetimeDebits: w.lifetime_debits };
    });

    const freeMap: Record<string, number> = {};
    (freeCredits ?? []).forEach((f: any) => {
      freeMap[f.client_id] = (freeMap[f.client_id] || 0) + f.dollars_remaining;
    });

    const clientCostTable = Object.entries(clientCounts).map(([id, v]) => ({
      clientId: id,
      name: v.name,
      requests: v.requests,
      estimatedCost: Number(v.cost.toFixed(4)),
      walletBalance: walletMap[id]?.balance ?? 0,
      freeCreditsRemaining: freeMap[id] ?? 0,
      lifetimeDebits: walletMap[id]?.lifetimeDebits ?? 0,
    })).sort((a, b) => b.estimatedCost - a.estimatedCost);

    return json({
      kpis: {
        totalRequests,
        chatCount,
        imageCount,
        costEstCount,
        cachedCount,
        cacheRate,
        totalInputTokens,
        totalOutputTokens,
        totalCost: Number(totalClientCharge.toFixed(4)),
        totalBaseCost: Number(totalBaseCost.toFixed(4)),
        activeClients,
        avgCostPerClient: Number(avgCostPerClient.toFixed(4)),
        projectedMonthlyCost: Number(projectedMonthlyCost.toFixed(2)),
        projectedMonthlyBaseCost: Number(projectedMonthlyBaseCost.toFixed(2)),
        pricing: {
          imageBaseCost: baseImageCost,
          imageMultiplier: cfg?.image_multiplier ?? 1,
          imageEffective: effectiveImageCost,
          chatBaseCost: baseChatCost,
          chatMultiplier: cfg?.chat_multiplier ?? 1,
          chatEffective: effectiveChatCost,
        },
      },
      costBreakdown,
      featureDistribution,
      modelDistribution,
      dailyTrend,
      topClientsByRequests,
      topClientsByCost,
      sessionStats: {
        totalSessions,
        configApplied,
        designSaved,
        converted,
        conversionRate,
        avgDurationMin,
      },
      monthlyChart,
      clientCostTable,
      clientMap,
    });
  } catch (err) {
    console.error("ai-intelligence-stats error:", err);
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
