import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { WalletCard } from '@/components/client/usage/WalletCard';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/contexts/AuthContext';
import { useAdminImpersonation } from '@/contexts/AdminImpersonationContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { CREDIT_COSTS } from '@/lib/credit-utils';
import { InfoTooltip } from '@/components/ui/info-tooltip';

interface MonthlySummary {
  feature: string;
  total_requests: number;
  total_input_tokens: number;
  total_output_tokens: number;
  cached_requests: number;
}

export function AiUsageTabContent() {
  const [loading, setLoading] = useState(true);
  const [summaries, setSummaries] = useState<MonthlySummary[]>([]);
  const { user } = useAuth();
  const { isImpersonating, impersonatedClientId } = useAdminImpersonation();

  useEffect(() => {
    loadData();
  }, [user, isImpersonating, impersonatedClientId]);

  const loadData = async () => {
    try {
      let clientId: string | null = null;

      if (isImpersonating && impersonatedClientId) {
        clientId = impersonatedClientId;
      } else {
        const { data } = await supabase
          .from('clients')
          .select('id')
          .eq('user_id', user?.id)
          .maybeSingle();
        clientId = data?.id || null;
      }

      if (!clientId) {
        setLoading(false);
        return;
      }

      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const currentMonth = now.toISOString().slice(0, 7);

      const [{ data: archivedSummary }, { data: realtimeLogs }] = await Promise.all([
        supabase
          .from('ai_usage_monthly_summary')
          .select('feature, total_requests, total_input_tokens, total_output_tokens, cached_requests')
          .eq('client_id', clientId)
          .eq('month', currentMonth),
        supabase
          .from('ai_usage_logs')
          .select('feature, input_tokens, output_tokens, cached')
          .eq('client_id', clientId)
          .gte('created_at', monthStart)
          .limit(10000),
      ]);

      const realtimeMap = new Map<string, MonthlySummary>();
      (realtimeLogs || []).forEach((log) => {
        const existing = realtimeMap.get(log.feature) || {
          feature: log.feature, total_requests: 0, total_input_tokens: 0, total_output_tokens: 0, cached_requests: 0,
        };
        existing.total_requests += 1;
        existing.total_input_tokens += log.input_tokens || 0;
        existing.total_output_tokens += log.output_tokens || 0;
        if (log.cached) existing.cached_requests += 1;
        realtimeMap.set(log.feature, existing);
      });

      const archivedMap = new Map<string, MonthlySummary>();
      (archivedSummary || []).forEach((s) => archivedMap.set(s.feature, s));

      const allFeatures = new Set([...archivedMap.keys(), ...realtimeMap.keys()]);
      const merged: MonthlySummary[] = [];
      allFeatures.forEach((feature) => {
        const a = archivedMap.get(feature);
        const r = realtimeMap.get(feature);
        merged.push({
          feature,
          total_requests: (a?.total_requests || 0) + (r?.total_requests || 0),
          total_input_tokens: (a?.total_input_tokens || 0) + (r?.total_input_tokens || 0),
          total_output_tokens: (a?.total_output_tokens || 0) + (r?.total_output_tokens || 0),
          cached_requests: (a?.cached_requests || 0) + (r?.cached_requests || 0),
        });
      });

      setSummaries(merged);
    } catch (error) {
      console.error('Failed to load AI usage:', error);
      toast.error('Failed to load AI usage data');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-48" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  const imageFeatures = ['ring_preview', 'grillz_preview', 'enquiry_preview'];
  const chatFeatures = ['ring_chat', 'help_chat'];
  const quoteFeatures = ['cost_estimate'];

  const totalImages = summaries.filter(s => imageFeatures.includes(s.feature)).reduce((a, s) => a + s.total_requests, 0);
  const totalChats = summaries.filter(s => chatFeatures.includes(s.feature)).reduce((a, s) => a + s.total_requests, 0);
  const totalQuotes = summaries.filter(s => quoteFeatures.includes(s.feature)).reduce((a, s) => a + s.total_requests, 0);

  return (
    <div className="space-y-6">
      <WalletCard />

      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-1.5">
            This Month
            <InfoTooltip text="Your AI usage for the current billing month" />
          </CardTitle>
          <CardDescription>AI usage for {new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center">
              <p className="text-2xl font-bold">{totalImages.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                Images Rendered
                <InfoTooltip text="AI-generated ring and jewelry preview images. Each image costs 144 credits." />
              </p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold">{totalChats.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                AI Chats
                <InfoTooltip text="Conversations with the AI assistant. Each chat message costs 2 credits." />
              </p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold">{totalQuotes.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                AI Quotes
                <InfoTooltip text="AI-powered cost estimates for customers. Each estimate costs 2 credits." />
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Credit Costs */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-1.5">
            Credit Costs
            <InfoTooltip text="How many credits each AI action uses" />
          </CardTitle>
          <CardDescription>What each action costs</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {[
              { action: 'Chat message', cost: CREDIT_COSTS.chat },
              { action: 'AI image render', cost: CREDIT_COSTS.imageRender },
              { action: 'Cost estimate', cost: CREDIT_COSTS.costEstimate },
            ].map((item) => (
              <div key={item.action} className="flex items-center justify-between py-1.5">
                <span className="text-sm">{item.action}</span>
                <span className="text-sm font-medium text-muted-foreground">
                  {item.cost} {(item.cost as number) === 1 ? 'credit' : 'credits'}
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
