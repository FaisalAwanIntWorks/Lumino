import { stickyHeaderTableClass } from "@/components/ui/table";
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { Eye, Bot, Users, TrendingUp, MessageSquare, Clock, Settings2 } from 'lucide-react';
import { format, subDays } from 'date-fns';

type TabKey = 'ring_builder' | 'custom_x' | 'grillz' | 'metal_iq';

const TAB_CONFIG: Record<TabKey, {
  label: string;
  viewSources: string[];
  aiFeatures: string[];
  leadTable: string;
}> = {
  ring_builder: {
    label: 'Ring Builder',
    viewSources: ['ring_builder', 'jewlx_widget'],
    aiFeatures: ['ring_chat', 'ring_preview', 'cost_estimate'],
    leadTable: 'diamond_form_leads',
  },
  custom_x: {
    label: 'Custom X',
    viewSources: ['custom_enquiry'],
    aiFeatures: ['enquiry_preview'],
    leadTable: 'custom_enquiry_leads',
  },
  grillz: {
    label: 'Grillz Builder',
    viewSources: ['grillz_builder'],
    aiFeatures: ['grillz_preview'],
    leadTable: 'grill_form_leads',
  },
  metal_iq: {
    label: 'Metal IQ',
    viewSources: [],
    aiFeatures: [],
    leadTable: 'metal_buying_leads',
  },
};

const PIE_COLORS = ['#22c55e', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#14b8a6'];

function useTabAnalytics(tab: TabKey) {
  const config = TAB_CONFIG[tab];
  const thirtyDaysAgo = subDays(new Date(), 30).toISOString();

  return useQuery({
    queryKey: ['product-analytics', tab],
    queryFn: async () => {
      // Widget views (30d)
      let viewCount = 0;
      let dailyViews: Record<string, number> = {};
      if (config.viewSources.length > 0) {
        const { data: views } = await supabase
          .from('analytics_events')
          .select('created_at, client_id, metadata')
          .eq('event_type', 'widget_view')
          .gte('created_at', thirtyDaysAgo);

        const filtered = (views || []).filter((v: any) => {
          const source = (v.metadata as any)?.source;
          return config.viewSources.includes(source);
        });
        viewCount = filtered.length;

        for (const v of filtered) {
          const day = format(new Date(v.created_at!), 'MMM dd');
          dailyViews[day] = (dailyViews[day] || 0) + 1;
        }
      }

      // AI generations (30d)
      let aiCount = 0;
      let clientAiMap: Record<string, number> = {};
      if (config.aiFeatures.length > 0) {
        const { data: aiLogs } = await supabase
          .from('ai_usage_logs')
          .select('client_id, feature')
          .in('feature', config.aiFeatures)
          .gte('created_at', thirtyDaysAgo);

        aiCount = (aiLogs || []).length;
        for (const log of aiLogs || []) {
          clientAiMap[log.client_id] = (clientAiMap[log.client_id] || 0) + 1;
        }
      }

      // Leads (30d)
      let leadCount = 0;
      const { count } = await supabase
        .from(config.leadTable as any)
        .select('id', { count: 'exact', head: true })
        .gte('created_at', thirtyDaysAgo);
      leadCount = count || 0;

      const conversionRate = viewCount > 0 ? ((leadCount / viewCount) * 100).toFixed(1) : '0.0';

      const chartData = [];
      for (let i = 29; i >= 0; i--) {
        const day = format(subDays(new Date(), i), 'MMM dd');
        chartData.push({ day, views: dailyViews[day] || 0 });
      }

      // Top 10 clients by AI usage
      const clientIds = Object.keys(clientAiMap);
      let topClients: { name: string; count: number }[] = [];
      if (clientIds.length > 0) {
        const { data: clientsData } = await supabase
          .from('clients')
          .select('id, company_name')
          .in('id', clientIds);

        const nameMap: Record<string, string> = {};
        for (const c of clientsData || []) nameMap[c.id] = c.company_name;

        topClients = Object.entries(clientAiMap)
          .sort(([, a], [, b]) => b - a)
          .slice(0, 10)
          .map(([cid, cnt]) => ({ name: nameMap[cid] || cid.slice(0, 8), count: cnt }));
      }

      // Ring Builder: chat sessions
      let chatSessions: { total: number; avgDuration: string; totalMessages: number; configApplied: number } | null = null;
      if (tab === 'ring_builder') {
        const { data: sessions } = await supabase
          .from('ai_chat_sessions')
          .select('started_at, ended_at, message_count, configuration_applied')
          .gte('started_at', thirtyDaysAgo);

        const s = sessions || [];
        const total = s.length;
        let totalDurationMin = 0;
        let sessionsWithEnd = 0;
        let totalMessages = 0;
        let configApplied = 0;

        for (const sess of s) {
          totalMessages += (sess.message_count || 0);
          if (sess.configuration_applied) configApplied++;
          if (sess.started_at && sess.ended_at) {
            totalDurationMin += (new Date(sess.ended_at).getTime() - new Date(sess.started_at).getTime()) / 60000;
            sessionsWithEnd++;
          }
        }

        const avgMin = sessionsWithEnd > 0 ? Math.round(totalDurationMin / sessionsWithEnd) : 0;
        chatSessions = {
          total,
          avgDuration: avgMin > 0 ? `${avgMin} min` : '—',
          totalMessages,
          configApplied,
        };
      }

      // MetalIQ: market insights
      let metalInsights: { byType: { name: string; count: number }[]; avgOffer: number; topClients: { name: string; count: number }[] } | null = null;
      if (tab === 'metal_iq') {
        const { data: leads } = await supabase
          .from('metal_buying_leads')
          .select('metal_type, estimated_offer, client_id')
          .gte('created_at', thirtyDaysAgo);

        const l = leads || [];
        const typeMap: Record<string, number> = {};
        const clientLeadMap: Record<string, number> = {};
        let totalOffer = 0;
        let offerCount = 0;

        for (const lead of l) {
          const mt = (lead as any).metal_type || 'Unknown';
          typeMap[mt] = (typeMap[mt] || 0) + 1;
          if ((lead as any).estimated_offer) {
            totalOffer += Number((lead as any).estimated_offer);
            offerCount++;
          }
          clientLeadMap[(lead as any).client_id] = (clientLeadMap[(lead as any).client_id] || 0) + 1;
        }

        const byType = Object.entries(typeMap).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
        const avgOffer = offerCount > 0 ? Math.round(totalOffer / offerCount) : 0;

        // Resolve client names for top clients
        const cIds = Object.keys(clientLeadMap);
        let metalTopClients: { name: string; count: number }[] = [];
        if (cIds.length > 0) {
          const { data: cData } = await supabase.from('clients').select('id, company_name').in('id', cIds);
          const nm: Record<string, string> = {};
          for (const c of cData || []) nm[c.id] = c.company_name;
          metalTopClients = Object.entries(clientLeadMap)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 10)
            .map(([cid, cnt]) => ({ name: nm[cid] || cid.slice(0, 8), count: cnt }));
        }

        metalInsights = { byType, avgOffer, topClients: metalTopClients };
      }

      return { viewCount, aiCount, leadCount, conversionRate, chartData, topClients, chatSessions, metalInsights };
    },
    staleTime: 60_000,
  });
}

function TabPanel({ tab }: { tab: TabKey }) {
  const { data, isLoading } = useTabAnalytics(tab);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map(i => (
            <Card key={i} className="p-4"><div className="h-12 bg-muted animate-pulse rounded" /></Card>
          ))}
        </div>
        <Card className="p-4"><div className="h-48 bg-muted animate-pulse rounded" /></Card>
      </div>
    );
  }

  const kpis = [
    { label: 'Widget Views', value: data?.viewCount?.toLocaleString() || '0', icon: Eye },
    { label: 'AI Generations', value: data?.aiCount?.toLocaleString() || '0', icon: Bot },
    { label: 'Leads', value: data?.leadCount?.toLocaleString() || '0', icon: Users },
    { label: 'Conversion Rate', value: `${data?.conversionRate || '0.0'}%`, icon: TrendingUp },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {kpis.map(kpi => (
          <Card key={kpi.label} className="p-4">
            <div className="flex items-center gap-3">
              <kpi.icon className="w-5 h-5 text-primary shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground">{kpi.label}</p>
                <p className="text-lg font-bold">{kpi.value}</p>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* 30-day trend chart */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Widget Views — Last 30 Days</CardTitle>
        </CardHeader>
        <CardContent>
          {(data?.chartData?.length ?? 0) > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={data!.chartData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="day" tick={{ fontSize: 10 }} interval={4} className="text-muted-foreground" />
                <YAxis tick={{ fontSize: 10 }} className="text-muted-foreground" />
                <Tooltip />
                <Bar dataKey="views" fill="hsl(var(--primary))" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8">No view data for this period</p>
          )}
        </CardContent>
      </Card>

      {/* Ring Builder: Chat Sessions */}
      {tab === 'ring_builder' && data?.chatSessions && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Chat Sessions — Last 30 Days</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="flex items-center gap-3">
                <MessageSquare className="w-5 h-5 text-primary shrink-0" />
                <div>
                  <p className="text-xs text-muted-foreground">Total Sessions</p>
                  <p className="text-lg font-bold">{data.chatSessions.total.toLocaleString()}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Clock className="w-5 h-5 text-primary shrink-0" />
                <div>
                  <p className="text-xs text-muted-foreground">Avg Duration</p>
                  <p className="text-lg font-bold">{data.chatSessions.avgDuration}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Bot className="w-5 h-5 text-primary shrink-0" />
                <div>
                  <p className="text-xs text-muted-foreground">Total Messages</p>
                  <p className="text-lg font-bold">{data.chatSessions.totalMessages.toLocaleString()}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Settings2 className="w-5 h-5 text-primary shrink-0" />
                <div>
                  <p className="text-xs text-muted-foreground">Config Applied</p>
                  <p className="text-lg font-bold">{data.chatSessions.configApplied.toLocaleString()}</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* MetalIQ: Market Insights */}
      {tab === 'metal_iq' && data?.metalInsights && (
        <>
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Leads by Metal Type</CardTitle>
              </CardHeader>
              <CardContent>
                {data.metalInsights.byType.length > 0 ? (
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                      <Pie data={data.metalInsights.byType} dataKey="count" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, count }) => `${name} (${count})`}>
                        {data.metalInsights.byType.map((_, i) => (
                          <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-8">No lead data</p>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Market Summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 pt-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Total Leads (30d)</span>
                  <span className="font-bold">{data.leadCount}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Avg Estimated Offer</span>
                  <span className="font-bold">${data.metalInsights.avgOffer.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Metal Types Seen</span>
                  <span className="font-bold">{data.metalInsights.byType.length}</span>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Top clients by lead volume */}
          {data.metalInsights.topClients.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Top Clients by Lead Volume</CardTitle>
              </CardHeader>
              <CardContent>
                <Table containerClassName={stickyHeaderTableClass}>
                  <TableHeader>
                    <TableRow>
                      <TableHead>#</TableHead>
                      <TableHead>Client</TableHead>
                      <TableHead className="text-right">Leads</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.metalInsights.topClients.map((c, i) => (
                      <TableRow key={c.name}>
                        <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                        <TableCell className="font-medium">{c.name}</TableCell>
                        <TableCell className="text-right">{c.count.toLocaleString()}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* Top clients table (AI usage) */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Top Clients by AI Usage</CardTitle>
        </CardHeader>
        <CardContent>
          {(data?.topClients?.length ?? 0) > 0 ? (
            <Table containerClassName={stickyHeaderTableClass}>
              <TableHeader>
                <TableRow>
                  <TableHead>#</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead className="text-right">AI Requests</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data!.topClients.map((c, i) => (
                  <TableRow key={c.name}>
                    <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell className="text-right">{c.count.toLocaleString()}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-6">No AI usage data for this period</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function ProductAnalytics() {
  const [activeTab, setActiveTab] = useState<TabKey>('ring_builder');

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold">Product Analytics</h1>
        <p className="text-muted-foreground">30-day performance metrics across all product areas</p>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabKey)}>
        <TabsList>
          {(Object.entries(TAB_CONFIG) as [TabKey, typeof TAB_CONFIG[TabKey]][]).map(([key, cfg]) => (
            <TabsTrigger key={key} value={key}>{cfg.label}</TabsTrigger>
          ))}
        </TabsList>

        {(Object.keys(TAB_CONFIG) as TabKey[]).map(key => (
          <TabsContent key={key} value={key}>
            <TabPanel tab={key} />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}