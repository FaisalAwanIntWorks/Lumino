import { stickyHeaderTableClass } from "@/components/ui/table";
import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, PieChart, Pie, Cell, LineChart, Line, AreaChart, Area } from 'recharts';
import { format, subDays } from 'date-fns';
import { Database, MessageSquare, Image, Calculator, Zap, TrendingUp, Download, ChevronDown, ChevronRight, Search, RefreshCw, DollarSign, Users, Clock, Brain } from 'lucide-react';
import { toast } from 'sonner';
import { dollarsToCredits } from '@/lib/credit-utils';

// ─── Types ───────────────────────────────────────────────────────────
type IntelligenceData = {
  kpis: {
    totalRequests: number;
    chatCount: number;
    imageCount: number;
    costEstCount: number;
    cachedCount: number;
    cacheRate: number;
    totalInputTokens: number;
    totalOutputTokens: number;
    totalCost: number;
    activeClients: number;
    avgCostPerClient: number;
    projectedMonthlyCost: number;
  };
  costBreakdown: { chat: number; image: number; costEstimate: number };
  featureDistribution: { name: string; value: number }[];
  modelDistribution: { model: string; count: number }[];
  dailyTrend: any[];
  topClientsByRequests: { clientId: string; name: string; requests: number; cost: number }[];
  topClientsByCost: { clientId: string; name: string; requests: number; cost: number }[];
  sessionStats: {
    totalSessions: number;
    configApplied: number;
    designSaved: number;
    converted: number;
    conversionRate: number;
    avgDurationMin: number;
  };
  monthlyChart: { month: string; requests: number; tokens: number }[];
  clientCostTable: { clientId: string; name: string; requests: number; estimatedCost: number; walletBalance: number; freeCreditsRemaining: number; lifetimeDebits: number }[];
  clientMap: Record<string, string>;
};

type ChatSession = {
  id: string;
  session_id: string;
  client_id: string | null;
  message_count: number | null;
  configuration_applied: boolean | null;
  design_saved: boolean | null;
  started_at: string | null;
  ended_at: string | null;
};

type ChatMessage = { id: string; role: string; content: string; created_at: string | null };

type UsageLog = {
  id: string;
  client_id: string;
  feature: string;
  model: string;
  input_tokens: number | null;
  output_tokens: number | null;
  cached: boolean | null;
  created_at: string;
};

const FEATURE_COLORS = [
  'hsl(var(--primary))',
  'hsl(var(--accent))',
  'hsl(210, 70%, 55%)',
  'hsl(150, 60%, 45%)',
  'hsl(35, 80%, 55%)',
  'hsl(280, 60%, 55%)',
  'hsl(0, 65%, 55%)',
  'hsl(180, 50%, 45%)',
];

const MODEL_COLORS = [
  'hsl(220, 70%, 55%)',
  'hsl(160, 60%, 45%)',
  'hsl(30, 80%, 55%)',
  'hsl(280, 60%, 50%)',
  'hsl(350, 65%, 55%)',
  'hsl(190, 55%, 45%)',
];

// ─── Data hooks ──────────────────────────────────────────────────────

function useIntelligenceStats(days: number, clientId?: string) {
  return useQuery({
    queryKey: ['ai-intelligence-stats', days, clientId],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('ai-intelligence-stats', {
        body: { days, clientId: clientId || undefined },
      });
      if (error) throw error;
      return data as IntelligenceData;
    },
    staleTime: 2 * 60 * 1000,
  });
}

// Client-side queries for tabs that need row-level data (sessions, logs)
function useUsageLogs(days: number, clientId?: string) {
  return useQuery({
    queryKey: ['ai-dc-usage-logs', days, clientId],
    queryFn: async () => {
      const since = subDays(new Date(), days).toISOString();
      let q = supabase
        .from('ai_usage_logs')
        .select('id, client_id, feature, model, input_tokens, output_tokens, cached, created_at')
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(1000);
      if (clientId) q = q.eq('client_id', clientId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as UsageLog[];
    },
  });
}

function useChatSessions(days: number, clientId?: string) {
  return useQuery({
    queryKey: ['ai-dc-chat-sessions', days, clientId],
    queryFn: async () => {
      const since = subDays(new Date(), days).toISOString();
      let q = supabase
        .from('ai_chat_sessions')
        .select('id, session_id, client_id, message_count, configuration_applied, design_saved, started_at, ended_at')
        .gte('started_at', since)
        .order('started_at', { ascending: false })
        .limit(1000);
      if (clientId) q = q.eq('client_id', clientId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as ChatSession[];
    },
  });
}

// ─── Summary Card ────────────────────────────────────────────────────

function SummaryCard({ icon: Icon, label, value, sub }: { icon: any; label: string; value: string; sub?: string }) {
  return (
    <Card>
      <CardContent className="p-4 flex items-center gap-3">
        <div className="p-2 rounded-lg bg-primary/10">
          <Icon className="h-5 w-5 text-primary" />
        </div>
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-xl font-bold">{value}</p>
          {sub && <p className="text-[10px] text-muted-foreground">{sub}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Overview Tab ────────────────────────────────────────────────────

function OverviewTab({ data }: { data: IntelligenceData }) {
  const { kpis, featureDistribution, modelDistribution, dailyTrend, topClientsByRequests, monthlyChart } = data;

  const trendConfig = { total: { label: 'Total Requests', color: 'hsl(var(--primary))' } };
  const pieConfig = featureDistribution.reduce((acc, f, i) => {
    acc[f.name] = { label: f.name, color: FEATURE_COLORS[i % FEATURE_COLORS.length] };
    return acc;
  }, {} as Record<string, { label: string; color: string }>);

  const modelConfig = modelDistribution.reduce((acc, m, i) => {
    acc[m.model] = { label: m.model, color: MODEL_COLORS[i % MODEL_COLORS.length] };
    return acc;
  }, {} as Record<string, { label: string; color: string }>);

  const trendFormatted = dailyTrend.map(d => ({
    ...d,
    dateLabel: format(new Date(d.date), 'MMM d'),
  }));

  return (
    <div className="space-y-6">
      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <SummaryCard icon={Zap} label="Total Requests" value={kpis.totalRequests.toLocaleString()} />
        <SummaryCard icon={DollarSign} label="Estimated Cost" value={`$${kpis.totalCost.toFixed(2)}`} sub={`${dollarsToCredits(kpis.totalCost).toLocaleString()} credits`} />
        <SummaryCard icon={Users} label="Active Clients" value={kpis.activeClients.toLocaleString()} />
        <SummaryCard icon={DollarSign} label="Avg Cost/Client" value={`$${kpis.avgCostPerClient.toFixed(2)}`} sub={`Projected: $${kpis.projectedMonthlyCost.toFixed(0)}/mo`} />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <SummaryCard icon={MessageSquare} label="Chat Requests" value={kpis.chatCount.toLocaleString()} />
        <SummaryCard icon={Image} label="Image Generations" value={kpis.imageCount.toLocaleString()} />
        <SummaryCard icon={Calculator} label="Cost Estimates" value={kpis.costEstCount.toLocaleString()} />
        <SummaryCard icon={Database} label="Cache Hit Rate" value={`${kpis.cacheRate}%`} sub={`${kpis.cachedCount.toLocaleString()} cached`} />
      </div>

      {/* Daily trend */}
      <Card>
        <CardHeader><CardTitle className="text-base">Daily AI Usage</CardTitle></CardHeader>
        <CardContent>
          <ChartContainer config={trendConfig} className="h-[300px] w-full">
            <LineChart data={trendFormatted}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border/30" />
              <XAxis dataKey="dateLabel" tick={{ fontSize: 11 }} className="text-muted-foreground" />
              <YAxis tick={{ fontSize: 11 }} className="text-muted-foreground" />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Line type="monotone" dataKey="total" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
            </LineChart>
          </ChartContainer>
        </CardContent>
      </Card>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Feature distribution */}
        <Card>
          <CardHeader><CardTitle className="text-base">Feature Distribution</CardTitle></CardHeader>
          <CardContent>
            <div className="flex flex-col items-center gap-4">
              <ChartContainer config={pieConfig} className="h-[220px] w-full">
                <PieChart>
                  <Pie data={featureDistribution} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`} labelLine={false}>
                    {featureDistribution.map((_, i) => <Cell key={i} fill={FEATURE_COLORS[i % FEATURE_COLORS.length]} />)}
                  </Pie>
                  <ChartTooltip content={<ChartTooltipContent />} />
                </PieChart>
              </ChartContainer>
              <div className="flex flex-col gap-1.5 w-full">
                {featureDistribution.map((f, i) => (
                  <div key={f.name} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: FEATURE_COLORS[i % FEATURE_COLORS.length] }} />
                      <span className="text-muted-foreground">{f.name}</span>
                    </div>
                    <span className="font-medium">{f.value.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Model distribution */}
        <Card>
          <CardHeader><CardTitle className="text-base">Model Performance</CardTitle></CardHeader>
          <CardContent>
            <ChartContainer config={modelConfig} className="h-[300px] w-full">
              <BarChart data={modelDistribution} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" className="stroke-border/30" />
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis dataKey="model" type="category" tick={{ fontSize: 10 }} width={120} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                  {modelDistribution.map((_, i) => <Cell key={i} fill={MODEL_COLORS[i % MODEL_COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>
      </div>

      {/* Top clients leaderboard */}
      <Card>
        <CardHeader><CardTitle className="text-base">Top Clients by AI Usage</CardTitle></CardHeader>
        <CardContent>
          <Table containerClassName={stickyHeaderTableClass}>
            <TableHeader>
              <TableRow>
                <TableHead>#</TableHead>
                <TableHead>Client</TableHead>
                <TableHead className="text-right">Requests</TableHead>
                <TableHead className="text-right">Est. Cost</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {topClientsByRequests.map((c, i) => (
                <TableRow key={c.clientId}>
                  <TableCell className="font-medium">{i + 1}</TableCell>
                  <TableCell>{c.name}</TableCell>
                  <TableCell className="text-right">{c.requests.toLocaleString()}</TableCell>
                  <TableCell className="text-right">${c.cost.toFixed(2)}</TableCell>
                </TableRow>
              ))}
              {topClientsByRequests.length === 0 && (
                <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-6">No data</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Monthly historical trend */}
      {monthlyChart.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Monthly Historical Trend</CardTitle>
            <CardDescription>From archived monthly summaries</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={{ requests: { label: 'Requests', color: 'hsl(var(--primary))' } }} className="h-[250px] w-full">
              <AreaChart data={monthlyChart}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border/30" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Area type="monotone" dataKey="requests" stroke="hsl(var(--primary))" fill="hsl(var(--primary)/0.15)" strokeWidth={2} />
              </AreaChart>
            </ChartContainer>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Cost Analysis Tab ───────────────────────────────────────────────

function CostAnalysisTab({ data }: { data: IntelligenceData }) {
  const { kpis, costBreakdown, clientCostTable } = data;

  const costBarData = [
    { category: 'Chat', cost: costBreakdown.chat, credits: dollarsToCredits(costBreakdown.chat) },
    { category: 'Image', cost: costBreakdown.image, credits: dollarsToCredits(costBreakdown.image) },
    { category: 'Cost Estimate', cost: costBreakdown.costEstimate, credits: dollarsToCredits(costBreakdown.costEstimate) },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <SummaryCard icon={DollarSign} label="Total Cost (Period)" value={`$${kpis.totalCost.toFixed(2)}`} sub={`${dollarsToCredits(kpis.totalCost).toLocaleString()} credits`} />
        <SummaryCard icon={TrendingUp} label="Projected Monthly" value={`$${kpis.projectedMonthlyCost.toFixed(0)}`} />
        <SummaryCard icon={Users} label="Active Clients" value={kpis.activeClients.toLocaleString()} />
        <SummaryCard icon={DollarSign} label="Avg Cost/Client" value={`$${kpis.avgCostPerClient.toFixed(2)}`} />
      </div>

      {/* Cost by feature */}
      <Card>
        <CardHeader><CardTitle className="text-base">Cost Breakdown by Feature</CardTitle></CardHeader>
        <CardContent>
          <ChartContainer config={{ cost: { label: 'Cost ($)', color: 'hsl(var(--primary))' } }} className="h-[250px] w-full">
            <BarChart data={costBarData}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border/30" />
              <XAxis dataKey="category" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `$${v}`} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar dataKey="cost" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ChartContainer>
        </CardContent>
      </Card>

      {/* Per-client cost table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Cost per Client</CardTitle>
          <CardDescription>Credits consumed vs remaining balance</CardDescription>
        </CardHeader>
        <CardContent>
          <Table containerClassName={stickyHeaderTableClass}>
            <TableHeader>
              <TableRow>
                <TableHead>Client</TableHead>
                <TableHead className="text-right">Requests</TableHead>
                <TableHead className="text-right">Est. Cost</TableHead>
                <TableHead className="text-right">Wallet Balance</TableHead>
                <TableHead className="text-right">Free Credits</TableHead>
                <TableHead className="text-right">Lifetime Debits</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {clientCostTable.slice(0, 20).map(c => (
                <TableRow key={c.clientId}>
                  <TableCell className="font-medium">{c.name}</TableCell>
                  <TableCell className="text-right">{c.requests.toLocaleString()}</TableCell>
                  <TableCell className="text-right">${c.estimatedCost.toFixed(2)}</TableCell>
                  <TableCell className="text-right">${c.walletBalance.toFixed(2)}</TableCell>
                  <TableCell className="text-right">${c.freeCreditsRemaining.toFixed(2)}</TableCell>
                  <TableCell className="text-right">${c.lifetimeDebits.toFixed(2)}</TableCell>
                </TableRow>
              ))}
              {clientCostTable.length === 0 && (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">No data</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Chat Sessions Tab ───────────────────────────────────────────────

function ChatSessionsTab({ sessions, clientMap, sessionStats }: { sessions: ChatSession[]; clientMap: Record<string, string>; sessionStats: IntelligenceData['sessionStats'] }) {
  const [search, setSearch] = useState('');
  const [filterConversion, setFilterConversion] = useState<string>('all');
  const [filterClient, setFilterClient] = useState<string>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const clientOptions = useMemo(() => {
    const ids = [...new Set(sessions.map(s => s.client_id).filter(Boolean))];
    return ids.map(id => ({ id: id!, name: clientMap[id!] || 'Unknown' })).sort((a, b) => a.name.localeCompare(b.name));
  }, [sessions, clientMap]);

  const filtered = useMemo(() => {
    let list = sessions;
    if (filterClient !== 'all') list = list.filter(s => s.client_id === filterClient);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(s => s.session_id.toLowerCase().includes(q) || (s.client_id && clientMap[s.client_id]?.toLowerCase().includes(q)));
    }
    if (filterConversion === 'converted') list = list.filter(s => s.configuration_applied || s.design_saved);
    if (filterConversion === 'not_converted') list = list.filter(s => !s.configuration_applied && !s.design_saved);
    return list;
  }, [sessions, search, filterConversion, filterClient, clientMap]);

  // Funnel data
  const funnelData = [
    { step: 'Sessions', count: sessionStats.totalSessions, pct: 100 },
    { step: 'Config Applied', count: sessionStats.configApplied, pct: sessionStats.totalSessions > 0 ? Math.round((sessionStats.configApplied / sessionStats.totalSessions) * 100) : 0 },
    { step: 'Design Saved', count: sessionStats.designSaved, pct: sessionStats.totalSessions > 0 ? Math.round((sessionStats.designSaved / sessionStats.totalSessions) * 100) : 0 },
  ];

  return (
    <div className="space-y-6">
      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <SummaryCard icon={MessageSquare} label="Total Sessions" value={sessionStats.totalSessions.toLocaleString()} />
        <SummaryCard icon={TrendingUp} label="Conversion Rate" value={`${sessionStats.conversionRate}%`} />
        <SummaryCard icon={Clock} label="Avg Duration" value={sessionStats.avgDurationMin > 0 ? `${sessionStats.avgDurationMin} min` : '—'} />
        <SummaryCard icon={Zap} label="Converted" value={sessionStats.converted.toLocaleString()} />
      </div>

      {/* Conversion funnel */}
      <Card>
        <CardHeader><CardTitle className="text-base">Conversion Funnel</CardTitle></CardHeader>
        <CardContent>
          <div className="flex items-end gap-4 h-32">
            {funnelData.map((f, i) => (
              <div key={f.step} className="flex-1 flex flex-col items-center gap-1">
                <span className="text-lg font-bold">{f.count.toLocaleString()}</span>
                <div
                  className="w-full rounded-t-md transition-all"
                  style={{
                    height: `${Math.max(f.pct, 8)}%`,
                    backgroundColor: FEATURE_COLORS[i],
                    opacity: 0.8,
                  }}
                />
                <span className="text-xs text-muted-foreground text-center">{f.step}</span>
                <span className="text-[10px] text-muted-foreground">{f.pct}%</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search by session ID or client..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={filterClient} onValueChange={setFilterClient}>
          <SelectTrigger className="w-[200px]"><SelectValue placeholder="All Clients" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Clients</SelectItem>
            {clientOptions.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterConversion} onValueChange={setFilterConversion}>
          <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Sessions</SelectItem>
            <SelectItem value="converted">Converted</SelectItem>
            <SelectItem value="not_converted">Not Converted</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Table containerClassName={stickyHeaderTableClass}>
        <TableHeader>
          <TableRow>
            <TableHead className="w-8"></TableHead>
            <TableHead>Client</TableHead>
            <TableHead>Session ID</TableHead>
            <TableHead>Messages</TableHead>
            <TableHead>Config Applied</TableHead>
            <TableHead>Design Saved</TableHead>
            <TableHead>Started</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtered.slice(0, 50).map(s => (
            <SessionRow key={s.id} session={s} clientMap={clientMap} expanded={expandedId === s.id} onToggle={() => setExpandedId(expandedId === s.id ? null : s.id)} />
          ))}
          {filtered.length === 0 && (
            <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">No sessions found</TableCell></TableRow>
          )}
        </TableBody>
      </Table>
      {filtered.length > 50 && <p className="text-sm text-muted-foreground text-center">Showing 50 of {filtered.length} sessions</p>}
    </div>
  );
}

function SessionRow({ session, clientMap, expanded, onToggle }: { session: ChatSession; clientMap: Record<string, string>; expanded: boolean; onToggle: () => void }) {
  const { data: messages, isLoading } = useQuery({
    queryKey: ['ai-dc-session-messages', session.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('ai_chat_messages')
        .select('id, role, content, created_at')
        .eq('session_id', session.id)
        .order('created_at', { ascending: true });
      return (data ?? []) as ChatMessage[];
    },
    enabled: expanded,
  });

  return (
    <>
      <TableRow className="cursor-pointer" onClick={onToggle}>
        <TableCell>{expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</TableCell>
        <TableCell className="font-medium">{session.client_id ? clientMap[session.client_id] || 'Unknown' : '—'}</TableCell>
        <TableCell className="font-mono text-xs">{session.session_id.slice(0, 12)}…</TableCell>
        <TableCell>{session.message_count ?? 0}</TableCell>
        <TableCell><Badge variant={session.configuration_applied ? 'default' : 'secondary'}>{session.configuration_applied ? 'Yes' : 'No'}</Badge></TableCell>
        <TableCell><Badge variant={session.design_saved ? 'default' : 'secondary'}>{session.design_saved ? 'Yes' : 'No'}</Badge></TableCell>
        <TableCell className="text-sm">{session.started_at ? format(new Date(session.started_at), 'MMM d, h:mm a') : '—'}</TableCell>
      </TableRow>
      {expanded && (
        <TableRow>
          <TableCell colSpan={7} className="bg-muted/30 p-4">
            {isLoading ? (
              <p className="text-sm text-muted-foreground">Loading transcript...</p>
            ) : messages && messages.length > 0 ? (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {messages.map(m => (
                  <div key={m.id} className={`text-sm rounded-lg p-2 ${m.role === 'assistant' ? 'bg-primary/5 border border-primary/10' : 'bg-card border border-border'}`}>
                    <span className="font-semibold text-xs uppercase text-muted-foreground">{m.role}</span>
                    <p className="mt-0.5 whitespace-pre-wrap">{m.content.slice(0, 500)}{m.content.length > 500 ? '…' : ''}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No messages found for this session</p>
            )}
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

// ─── Usage Logs Tab ──────────────────────────────────────────────────

function UsageLogsTab({ logs, clientMap }: { logs: UsageLog[]; clientMap: Record<string, string> }) {
  const [featureFilter, setFeatureFilter] = useState<string>('all');
  const [modelFilter, setModelFilter] = useState<string>('all');
  const [clientFilter, setClientFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const perPage = 50;

  const features = useMemo(() => [...new Set(logs.map(l => l.feature))].sort(), [logs]);
  const models = useMemo(() => [...new Set(logs.map(l => l.model))].sort(), [logs]);
  const clientOptions = useMemo(() => {
    const ids = [...new Set(logs.map(l => l.client_id))];
    return ids.map(id => ({ id, name: clientMap[id] || 'Unknown' })).sort((a, b) => a.name.localeCompare(b.name));
  }, [logs, clientMap]);

  const filtered = useMemo(() => {
    let list = logs;
    if (featureFilter !== 'all') list = list.filter(l => l.feature === featureFilter);
    if (modelFilter !== 'all') list = list.filter(l => l.model === modelFilter);
    if (clientFilter !== 'all') list = list.filter(l => l.client_id === clientFilter);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(l => l.model.toLowerCase().includes(q) || (l.client_id && clientMap[l.client_id]?.toLowerCase().includes(q)));
    }
    return list;
  }, [logs, featureFilter, modelFilter, clientFilter, search, clientMap]);

  const paged = filtered.slice(page * perPage, (page + 1) * perPage);
  const totalPages = Math.ceil(filtered.length / perPage);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search by model or client..." value={search} onChange={e => { setSearch(e.target.value); setPage(0); }} className="pl-9" />
        </div>
        <Select value={clientFilter} onValueChange={v => { setClientFilter(v); setPage(0); }}>
          <SelectTrigger className="w-[180px]"><SelectValue placeholder="All Clients" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Clients</SelectItem>
            {clientOptions.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={featureFilter} onValueChange={v => { setFeatureFilter(v); setPage(0); }}>
          <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Features</SelectItem>
            {features.map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={modelFilter} onValueChange={v => { setModelFilter(v); setPage(0); }}>
          <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Models</SelectItem>
            {models.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <Table containerClassName={stickyHeaderTableClass}>
        <TableHeader>
          <TableRow>
            <TableHead>Client</TableHead>
            <TableHead>Feature</TableHead>
            <TableHead>Model</TableHead>
            <TableHead>Tokens (In/Out)</TableHead>
            <TableHead>Cached</TableHead>
            <TableHead>Timestamp</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {paged.map(l => (
            <TableRow key={l.id}>
              <TableCell className="font-medium">{clientMap[l.client_id] || 'Unknown'}</TableCell>
              <TableCell><Badge variant="outline">{l.feature}</Badge></TableCell>
              <TableCell className="font-mono text-xs">{l.model}</TableCell>
              <TableCell className="text-sm">{l.input_tokens ?? 0} / {l.output_tokens ?? 0}</TableCell>
              <TableCell>{l.cached ? <Badge variant="default" className="bg-green-500/20 text-green-700">Yes</Badge> : <span className="text-muted-foreground">No</span>}</TableCell>
              <TableCell className="text-sm">{format(new Date(l.created_at), 'MMM d, h:mm a')}</TableCell>
            </TableRow>
          ))}
          {paged.length === 0 && (
            <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No logs found</TableCell></TableRow>
          )}
        </TableBody>
      </Table>

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">{filtered.length} results</p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>Previous</Button>
            <span className="text-sm flex items-center px-2">{page + 1} / {totalPages}</span>
            <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>Next</Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Export Tab ───────────────────────────────────────────────────────

function ExportTab({ logs, sessions, clientMap, monthlyChart }: { logs: UsageLog[]; sessions: ChatSession[]; clientMap: Record<string, string>; monthlyChart: IntelligenceData['monthlyChart'] }) {
  const exportUsageLogs = () => {
    const rows = logs.map(l => ({
      client: clientMap[l.client_id] || l.client_id,
      feature: l.feature,
      model: l.model,
      input_tokens: l.input_tokens ?? 0,
      output_tokens: l.output_tokens ?? 0,
      cached: l.cached ? 'yes' : 'no',
      timestamp: l.created_at,
    }));
    downloadCSV(rows, 'ai_usage_logs');
    toast.success('Usage logs exported');
  };

  const exportSessions = () => {
    const rows = sessions.map(s => ({
      client: s.client_id ? clientMap[s.client_id] || s.client_id : '',
      session_id: s.session_id,
      message_count: s.message_count ?? 0,
      configuration_applied: s.configuration_applied ? 'yes' : 'no',
      design_saved: s.design_saved ? 'yes' : 'no',
      started_at: s.started_at || '',
      ended_at: s.ended_at || '',
    }));
    downloadCSV(rows, 'ai_chat_sessions');
    toast.success('Chat sessions exported');
  };

  const exportMonthlySummary = () => {
    if (monthlyChart.length === 0) {
      toast.error('No monthly summary data available');
      return;
    }
    downloadCSV(monthlyChart, 'ai_monthly_summary');
    toast.success('Monthly summary exported');
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader><CardTitle className="text-base">Export AI Data</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">Download filtered data as CSV for analysis and training.</p>
          <div className="flex flex-col sm:flex-row gap-3 flex-wrap">
            <Button onClick={exportUsageLogs} variant="outline" className="gap-2">
              <Download className="h-4 w-4" /> Usage Logs ({logs.length} rows)
            </Button>
            <Button onClick={exportSessions} variant="outline" className="gap-2">
              <Download className="h-4 w-4" /> Chat Sessions ({sessions.length} rows)
            </Button>
            <Button onClick={exportMonthlySummary} variant="outline" className="gap-2">
              <Download className="h-4 w-4" /> Monthly Summary ({monthlyChart.length} months)
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function downloadCSV(rows: Record<string, any>[], filename: string) {
  if (rows.length === 0) return;
  const headers = Object.keys(rows[0]);
  const csv = [headers.join(','), ...rows.map(r => headers.map(h => `"${String(r[h]).replace(/"/g, '""')}"`).join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filename}_${format(new Date(), 'yyyy-MM-dd')}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Main Page ───────────────────────────────────────────────────────

export default function AIDataCenter() {
  const [days, setDays] = useState(30);
  const [clientFilter, setClientFilter] = useState<string | undefined>(undefined);

  const { data: statsData, isLoading: statsLoading, refetch } = useIntelligenceStats(days, clientFilter);
  const { data: logs = [], isLoading: logsLoading } = useUsageLogs(days, clientFilter);
  const { data: sessions = [], isLoading: sessionsLoading } = useChatSessions(days, clientFilter);

  const clientMap = statsData?.clientMap ?? {};
  const isLoading = statsLoading;

  const clientOptions = useMemo(() => {
    return Object.entries(clientMap)
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [clientMap]);

  const handleRefresh = () => {
    refetch();
    toast.success('Refreshing data...');
  };

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-[1400px] mx-auto">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Brain className="h-6 w-6 text-primary" />
            AI Intelligence Center
          </h1>
          <p className="text-sm text-muted-foreground">Deep analytics, cost tracking, and performance insights across all AI activity</p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={clientFilter || 'all'} onValueChange={v => setClientFilter(v === 'all' ? undefined : v)}>
            <SelectTrigger className="w-[180px]"><SelectValue placeholder="All Clients" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Clients</SelectItem>
              {clientOptions.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={String(days)} onValueChange={v => setDays(Number(v))}>
            <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Last 7 days</SelectItem>
              <SelectItem value="14">Last 14 days</SelectItem>
              <SelectItem value="30">Last 30 days</SelectItem>
              <SelectItem value="90">Last 90 days</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon" onClick={handleRefresh}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      ) : statsData ? (
        <Tabs defaultValue="overview" className="space-y-4">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="costs">Cost Analysis</TabsTrigger>
            <TabsTrigger value="sessions">Chat Sessions</TabsTrigger>
            <TabsTrigger value="logs">Usage Logs</TabsTrigger>
            <TabsTrigger value="export">Export</TabsTrigger>
          </TabsList>
          <TabsContent value="overview"><OverviewTab data={statsData} /></TabsContent>
          <TabsContent value="costs"><CostAnalysisTab data={statsData} /></TabsContent>
          <TabsContent value="sessions">
            <ChatSessionsTab sessions={sessions} clientMap={clientMap} sessionStats={statsData.sessionStats} />
          </TabsContent>
          <TabsContent value="logs">
            <UsageLogsTab logs={logs} clientMap={clientMap} />
          </TabsContent>
          <TabsContent value="export">
            <ExportTab logs={logs} sessions={sessions} clientMap={clientMap} monthlyChart={statsData.monthlyChart} />
          </TabsContent>
        </Tabs>
      ) : (
        <div className="text-center py-20 text-muted-foreground">Failed to load data. Try refreshing.</div>
      )}
    </div>
  );
}
