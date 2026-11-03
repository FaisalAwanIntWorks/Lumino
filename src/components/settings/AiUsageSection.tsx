import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useAdminImpersonation } from '@/contexts/AdminImpersonationContext';
import { Plus, ArrowDownRight, ArrowUpRight, Sparkles, ChevronRight } from 'lucide-react';
import { InfoTooltip } from '@/components/ui/info-tooltip';
import { toast } from 'sonner';
import { formatDistanceToNow, differenceInDays } from 'date-fns';
import { AutoRechargeSettings } from './AutoRechargeSettings';
import { dollarsToCredits, formatCredits, formatTxCredits, CREDIT_COSTS, FREE_MONTHLY_CREDITS } from '@/lib/credit-utils';
import { useCreditPacks } from '@/hooks/useCreditPacks';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';


interface Transaction {
  id: string;
  type: string;
  amount: number;
  balance_after: number;
  description: string;
  created_at: string;
}

interface UsageLog {
  feature: string;
  input_tokens: number | null;
  output_tokens: number | null;
  cached: boolean | null;
}

interface FreeCredits {
  dollars_remaining: number;
  dollars_granted: number;
  expires_at: string;
}

function cleanDescription(desc: string): string {
  if (!desc) return 'Usage';
  const lower = desc.toLowerCase();
  if (lower.includes('chat') || lower.includes('help_chat') || lower.includes('ring_chat')) return 'AI Chat';
  if (lower.includes('preview') || lower.includes('render') || lower.includes('image')) return 'Image Render';
  if (lower.includes('cost_estimate') || lower.includes('estimate')) return 'Cost Estimate';
  if (lower.includes('credit') || lower.includes('purchase') || lower.includes('top-up') || lower.includes('topup')) return 'Credit Purchase';
  if (lower.includes('auto-recharge') || lower.includes('auto_recharge')) return 'Auto-Recharge';
  return desc
    .replace(/gemini[-\s]?\S*/gi, '')
    .replace(/gpt[-\s]?\S*/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim() || 'Usage';
}

export function AiUsageSection() {
  const [loading, setLoading] = useState(true);
  const [wallet, setWallet] = useState<{ balance: number; lifetime_credits: number; lifetime_debits: number } | null>(null);
  const [resolvedClientId, setResolvedClientId] = useState<string | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [usageLogs, setUsageLogs] = useState<UsageLog[]>([]);
  const [purchasing, setPurchasing] = useState<number | null>(null);
  const [freeCreditsData, setFreeCreditsData] = useState<FreeCredits | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const { user } = useAuth();
  const { isImpersonating, impersonatedClientId } = useAdminImpersonation();
  const { packs: creditPacks } = useCreditPacks();

  useEffect(() => {
    if (user) loadData();
  }, [user, isImpersonating, impersonatedClientId]);

  const getClientId = async (): Promise<string | null> => {
    if (isImpersonating && impersonatedClientId) return impersonatedClientId;
    const { data } = await supabase.from('clients').select('id').eq('user_id', user?.id).maybeSingle();
    return data?.id || null;
  };

  const loadData = async () => {
    try {
      setLoading(true);
      const clientId = await getClientId();
      if (!clientId) { setLoading(false); return; }
      setResolvedClientId(clientId);

      // Ensure free credits exist
      await supabase.rpc('ensure_free_credits', { p_client_id: clientId });

      const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
      const [walletRes, txRes, usageRes, freeRes] = await Promise.all([
        supabase.from('client_wallets').select('balance, lifetime_credits, lifetime_debits').eq('client_id', clientId).maybeSingle(),
        supabase.from('wallet_transactions').select('id, type, amount, balance_after, description, created_at').eq('client_id', clientId).order('created_at', { ascending: false }).limit(3),
        supabase.from('ai_usage_logs').select('feature, input_tokens, output_tokens, cached').eq('client_id', clientId).gte('created_at', monthStart).limit(10000),
        supabase.from('client_free_credits').select('dollars_remaining, dollars_granted, expires_at').eq('client_id', clientId).gt('expires_at', new Date().toISOString()).order('expires_at', { ascending: false }).limit(1).maybeSingle(),
      ]);

      setWallet(walletRes.data || { balance: 0, lifetime_credits: 0, lifetime_debits: 0 });
      setTransactions((txRes.data as Transaction[]) || []);
      setUsageLogs((usageRes.data as UsageLog[]) || []);
      setFreeCreditsData(freeRes.data as FreeCredits | null);
    } catch {
      toast.error('Failed to load AI usage data');
    } finally {
      setLoading(false);
    }
  };

  const purchaseCredits = async (pack: number) => {
    setPurchasing(pack);
    try {
      const { data, error } = await supabase.functions.invoke('purchase-credits', { body: { pack } });
      if (error) throw error;
      if (data?.url) {
        window.open(data.url, '_blank');
        setDialogOpen(false);
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to create checkout');
    } finally {
      setPurchasing(null);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4 mt-6">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-20" />
        <Skeleton className="h-32" />
      </div>
    );
  }

  const imageFeatures = ['ring_preview', 'grillz_preview', 'enquiry_preview'];
  const chatFeatures = ['ring_chat', 'help_chat'];
  const quoteFeatures = ['cost_estimate'];

  const totalImages = usageLogs.filter(l => imageFeatures.includes(l.feature)).length;
  const totalChats = usageLogs.filter(l => chatFeatures.includes(l.feature)).length;
  const totalQuotes = usageLogs.filter(l => quoteFeatures.includes(l.feature)).length;

  return (
    <div className="px-1 space-y-6">
      <Separator />

      {/* Section Header + Balance */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium text-foreground flex items-center gap-1.5">
            AI Credits & Usage
            <InfoTooltip text="Credits are consumed when you use AI features. 1 credit = $0.0005 (2,000 credits = $1)" />
          </h3>
          <p className="text-sm text-muted-foreground mt-0.5">
            Balance, usage breakdown, and credit purchases
          </p>
        </div>
        {!isImpersonating && (
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="h-4 w-4 mr-1" />
                Buy Credits
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Purchase AI Credits</DialogTitle>
                <DialogDescription>Credits are used for AI chat, image generation, and cost estimates.</DialogDescription>
              </DialogHeader>
              <div className="grid grid-cols-3 gap-3 py-4">
                {creditPacks.map((pack) => (
                  <button
                    key={pack.amount}
                    onClick={() => purchaseCredits(pack.amount)}
                    disabled={purchasing !== null}
                    className={`relative rounded-lg border-2 p-4 text-center transition-all hover:border-primary hover:bg-primary/5 ${
                      pack.popular ? 'border-primary' : 'border-border'
                    } ${purchasing === pack.amount ? 'opacity-50' : ''}`}
                  >
                    {pack.popular && (
                      <Badge className="absolute -top-2.5 left-1/2 -translate-x-1/2 text-[10px]">Popular</Badge>
                    )}
                    <p className="text-lg font-bold text-muted-foreground">${pack.amount}</p>
                    <p className="text-2xl font-bold mt-1">{pack.label}</p>
                    <p className="text-xs text-muted-foreground">credits</p>
                    {pack.bonus > 0 && (
                      <div className="flex items-center justify-center gap-1 mt-1">
                        <Sparkles className="h-3 w-3 text-primary" />
                        <span className="text-[10px] font-medium text-primary">+{pack.bonus.toLocaleString()} bonus</span>
                      </div>
                    )}
                    <div className="mt-2 pt-2 border-t border-border/50 space-y-0.5">
                      <p className="text-[10px] text-muted-foreground">~{(pack.credits / CREDIT_COSTS.chat).toLocaleString()} chats</p>
                      <p className="text-[10px] text-muted-foreground">~{Math.floor(pack.credits / CREDIT_COSTS.imageRender).toLocaleString()} renders</p>
                    </div>
                  </button>
                ))}
              </div>
              <Separator />
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                  Credit Costs
                  <InfoTooltip text="How many credits each AI action uses. 1 credit = $0.0005 (2,000 credits = $1)" />
                </p>
                {[
                  { action: 'Chat message', cost: CREDIT_COSTS.chat },
                  { action: 'AI image render', cost: CREDIT_COSTS.imageRender },
                  { action: 'Cost estimate', cost: CREDIT_COSTS.costEstimate },
                ].map((item) => (
                  <div key={item.action} className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">{item.action}</span>
                    <span className="font-medium">{item.cost} {(item.cost as number) === 1 ? 'credit' : 'credits'}</span>
                  </div>
                ))}
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* Credit Bar */}
      {(() => {
        const freeRemaining = freeCreditsData ? dollarsToCredits(freeCreditsData.dollars_remaining) : 0;
        const purchasedCredits = dollarsToCredits(wallet?.balance ?? 0);
        const totalCredits = freeRemaining + purchasedCredits;
        const daysUntilExpiry = freeCreditsData ? differenceInDays(new Date(freeCreditsData.expires_at), new Date()) : 0;
        const maxBar = Math.max(totalCredits, 1);
        const freePercent = (freeRemaining / maxBar) * 100;
        const purchasedPercent = (purchasedCredits / maxBar) * 100;

        return (
          <div className="bg-muted/50 rounded-lg p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-foreground">Credits</span>
              <Popover>
                <PopoverTrigger asChild>
                  <button className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
                    <span className="font-mono font-bold text-foreground text-sm">{totalCredits.toLocaleString()}</span>
                    <span className="text-xs">left</span>
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-64" side="bottom" align="end">
                  <div className="space-y-3">
                    <p className="text-sm font-semibold text-foreground">Credit Breakdown</p>
                    <div className="space-y-2.5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="h-2.5 w-2.5 rounded-full bg-blue-500" />
                          <span className="text-xs text-muted-foreground">Free monthly</span>
                        </div>
                        <span className="text-xs font-mono font-medium">{freeRemaining.toLocaleString()}</span>
                      </div>
                      {freeCreditsData && daysUntilExpiry > 0 && (
                        <p className="text-[10px] text-muted-foreground pl-[18px]">
                          Expires in {daysUntilExpiry} day{daysUntilExpiry !== 1 ? 's' : ''} · does not roll over
                        </p>
                      )}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="h-2.5 w-2.5 rounded-full bg-blue-300" />
                          <span className="text-xs text-muted-foreground">Purchased</span>
                        </div>
                        <span className="text-xs font-mono font-medium">{purchasedCredits.toLocaleString()}</span>
                      </div>
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
            </div>

            <div className="w-full h-2 rounded-full bg-secondary overflow-hidden flex">
              {freePercent > 0 && (
                <div
                  className="h-full bg-blue-500 transition-all duration-500"
                  style={{ width: `${freePercent}%`, borderRadius: purchasedPercent === 0 ? '9999px' : '9999px 0 0 9999px' }}
                />
              )}
              {purchasedPercent > 0 && (
                <div
                  className="h-full bg-blue-300 transition-all duration-500"
                  style={{ width: `${purchasedPercent}%`, borderRadius: freePercent === 0 ? '9999px 0 0 9999px' : '0 9999px 9999px 0' }}
                />
              )}
            </div>
          </div>
        );
      })()}

      <p className="text-xs text-muted-foreground px-1">
        Chat: {CREDIT_COSTS.chat} credit · Image: {CREDIT_COSTS.imageRender} credits · Quote: {CREDIT_COSTS.costEstimate} credit
      </p>

      {/* Recent Activity */}
      {transactions.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">Recent Activity</p>
          {transactions.map((tx) => (
            <div key={tx.id} className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-1.5">
                {Number(tx.amount) >= 0 ? (
                  <ArrowUpRight className="h-3 w-3 text-green-500" />
                ) : (
                  <ArrowDownRight className="h-3 w-3 text-red-500" />
                )}
                <span className="text-muted-foreground">
                  {cleanDescription(tx.description)} · {formatDistanceToNow(new Date(tx.created_at), { addSuffix: true })}
                </span>
              </div>
              <span className={`font-mono text-xs ${Number(tx.amount) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {formatTxCredits(Number(tx.amount))}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* This Month Stats */}
      <Separator />
      <div>
        <p className="text-xs font-medium text-muted-foreground mb-3">
          This Month — {new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
        </p>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <p className="text-2xl font-bold">{totalImages.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              Images Rendered
              <InfoTooltip text="AI-generated ring and jewelry preview images" />
            </p>
          </div>
          <div>
            <p className="text-2xl font-bold">{totalChats.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              AI Chats
              <InfoTooltip text="Conversations with the AI assistant" />
            </p>
          </div>
          <div>
            <p className="text-2xl font-bold">{totalQuotes.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              AI Quotes
              <InfoTooltip text="AI-powered cost estimates for customers" />
            </p>
          </div>
        </div>
      </div>


      {/* Auto-Recharge Settings */}
      {resolvedClientId && (
        <AutoRechargeSettings
          clientId={resolvedClientId}
          isImpersonating={isImpersonating}
          availableDollars={(wallet?.balance ?? 0) + (freeCreditsData?.dollars_remaining ?? 0)}
        />
      )}
    </div>
  );
}
