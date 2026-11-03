import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useAdminImpersonation } from '@/contexts/AdminImpersonationContext';
import { Wallet, Plus, ArrowDownRight, ArrowUpRight, Sparkles, Info, ChevronRight, Gift, CreditCard } from 'lucide-react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { toast } from 'sonner';
import { formatDistanceToNow, differenceInDays } from 'date-fns';
import { dollarsToCredits, formatCredits, formatTxCredits, CREDIT_COSTS, FREE_MONTHLY_CREDITS } from '@/lib/credit-utils';
import { useCreditPacks } from '@/hooks/useCreditPacks';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

interface WalletData {
  balance: number;
  lifetime_credits: number;
  lifetime_debits: number;
}

interface FreeCredits {
  dollars_remaining: number;
  dollars_granted: number;
  expires_at: string;
}

interface Transaction {
  id: string;
  type: string;
  amount: number;
  balance_after: number;
  description: string;
  created_at: string;
}

export function WalletCard() {
  const [wallet, setWallet] = useState<WalletData | null>(null);
  const [freeCredits, setFreeCredits] = useState<FreeCredits | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState<number | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const { user } = useAuth();
  const { isImpersonating, impersonatedClientId } = useAdminImpersonation();
  const { packs: creditPacks } = useCreditPacks();

  useEffect(() => {
    if (user) loadWallet();
  }, [user, isImpersonating, impersonatedClientId]);

  const getClientId = async (): Promise<string | null> => {
    if (isImpersonating && impersonatedClientId) return impersonatedClientId;
    const { data } = await supabase
      .from('clients')
      .select('id')
      .eq('user_id', user?.id)
      .maybeSingle();
    return data?.id || null;
  };

  const loadWallet = async () => {
    try {
      setLoading(true);
      const clientId = await getClientId();
      if (!clientId) { setLoading(false); return; }

      // Ensure free credits exist (call RPC)
      await supabase.rpc('ensure_free_credits', { p_client_id: clientId });

      const [walletRes, txRes, freeRes] = await Promise.all([
        supabase.from('client_wallets').select('balance, lifetime_credits, lifetime_debits').eq('client_id', clientId).maybeSingle(),
        supabase.from('wallet_transactions').select('id, type, amount, balance_after, description, created_at').eq('client_id', clientId).order('created_at', { ascending: false }).limit(5),
        supabase.from('client_free_credits').select('dollars_remaining, dollars_granted, expires_at').eq('client_id', clientId).gt('expires_at', new Date().toISOString()).order('expires_at', { ascending: false }).limit(1).maybeSingle(),
      ]);

      setWallet(walletRes.data || { balance: 0, lifetime_credits: 0, lifetime_debits: 0 });
      setTransactions((txRes.data as Transaction[]) || []);
      setFreeCredits(freeRes.data as FreeCredits | null);
    } catch {
      toast.error('Failed to load wallet');
    } finally {
      setLoading(false);
    }
  };

  const purchaseCredits = async (pack: number) => {
    setPurchasing(pack);
    const loadingToast = toast.loading('Redirecting to checkout…');
    try {
      const { data, error } = await supabase.functions.invoke('purchase-credits', {
        body: { pack },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      if (data?.url) {
        setDialogOpen(false);
        // Redirect in current tab — popup blockers reliably block window.open() after async awaits.
        // Try to break out of any iframe; fall back to current window.
        try {
          if (window.top && window.top !== window.self) {
            window.top.location.href = data.url;
          } else {
            window.location.href = data.url;
          }
        } catch {
          window.location.href = data.url;
        }
        return;
      }
      throw new Error('No checkout URL returned');
    } catch (err: any) {
      toast.error(err.message || 'Failed to create checkout');
    } finally {
      toast.dismiss(loadingToast);
      setPurchasing(null);
    }
  };

  if (loading) return <Skeleton className="h-48" />;

  // Calculate credit amounts
  const freeRemaining = freeCredits ? dollarsToCredits(freeCredits.dollars_remaining) : 0;
  const purchasedCredits = dollarsToCredits(wallet?.balance ?? 0);
  const totalCredits = freeRemaining + purchasedCredits;
  const daysUntilExpiry = freeCredits ? differenceInDays(new Date(freeCredits.expires_at), new Date()) : 0;

  // Bar proportions
  const maxBar = Math.max(totalCredits, 1);
  const freePercent = (freeRemaining / maxBar) * 100;
  const purchasedPercent = (purchasedCredits / maxBar) * 100;

  return (
    <Card className="border-primary/20 bg-primary/5">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Wallet className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">AI Credits</CardTitle>
            <Popover>
              <PopoverTrigger asChild>
                <button className="rounded-full p-0.5 hover:bg-primary/10 transition-colors">
                  <Info className="h-4 w-4 text-muted-foreground" />
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-80 text-sm" side="bottom" align="start">
                <div className="space-y-3">
                  <div>
                    <p className="font-semibold text-foreground">How Credits Work</p>
                    <p className="text-muted-foreground text-xs mt-0.5">Credits are the universal currency for all AI-powered features. You receive {FREE_MONTHLY_CREDITS.toLocaleString()} free credits every month — unused free credits reset on the 1st of each month and do not carry over.</p>
                  </div>
                  <div className="border-t border-border pt-2 space-y-1.5">
                    <p className="text-xs font-medium text-foreground">Cost per action</p>
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">AI Chat message</span>
                      <span className="font-mono font-medium">{CREDIT_COSTS.chat} cr</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Cost Estimate</span>
                      <span className="font-mono font-medium">{CREDIT_COSTS.costEstimate} cr</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Image Render</span>
                      <span className="font-mono font-medium">{CREDIT_COSTS.imageRender} cr</span>
                    </div>
                  </div>
                  <div className="border-t border-border pt-2 space-y-1.5">
                    <p className="text-xs font-medium text-foreground">Example monthly usage</p>
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Light (500 chats, 50 renders)</span>
                      <span className="font-mono font-medium">~3,500 cr</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Moderate (2k chats, 200 renders)</span>
                      <span className="font-mono font-medium">~14,000 cr</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Heavy (5k chats, 500 renders)</span>
                      <span className="font-mono font-medium">~35,000 cr</span>
                    </div>
                  </div>
                </div>
              </PopoverContent>
            </Popover>
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
                  <DialogDescription>
                    Credits are used for AI chat, image generation, and cost estimates.
                  </DialogDescription>
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
                          <span className="text-[10px] font-medium text-primary">+{(pack.bonus).toLocaleString()} bonus</span>
                        </div>
                      )}
                      <div className="mt-2 pt-2 border-t border-border/50 space-y-0.5">
                        <p className="text-[10px] text-muted-foreground">~{(pack.credits / CREDIT_COSTS.chat).toLocaleString()} chats</p>
                        <p className="text-[10px] text-muted-foreground">~{Math.floor(pack.credits / CREDIT_COSTS.imageRender).toLocaleString()} renders</p>
                      </div>
                    </button>
                  ))}
                </div>
              </DialogContent>
            </Dialog>
          )}
        </div>
        <CardDescription>Your balance for AI-powered features</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Credits Header with Total */}
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-foreground">Credits</span>
          <Popover>
            <PopoverTrigger asChild>
              <button className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
                <span className="font-mono font-bold text-foreground text-sm">{totalCredits.toLocaleString()}</span>
                <span className="text-xs">left</span>
                <ChevronRight className="h-4 w-4" />
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-64" side="bottom" align="end">
              <div className="space-y-3">
                <p className="text-sm font-semibold text-foreground">Credit Breakdown</p>
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="h-2.5 w-2.5 rounded-full bg-primary" />
                      <span className="text-xs text-muted-foreground">Free monthly</span>
                    </div>
                    <span className="text-xs font-mono font-medium">{freeRemaining.toLocaleString()}</span>
                  </div>
                  {freeCredits && daysUntilExpiry > 0 && (
                    <p className="text-[10px] text-muted-foreground pl-[18px]">
                      Expires in {daysUntilExpiry} day{daysUntilExpiry !== 1 ? 's' : ''} · does not roll over
                    </p>
                  )}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="h-2.5 w-2.5 rounded-full bg-muted-foreground/30" />
                      <span className="text-xs text-muted-foreground">Purchased</span>
                    </div>
                    <span className="text-xs font-mono font-medium">{purchasedCredits.toLocaleString()}</span>
                  </div>
                </div>
              </div>
            </PopoverContent>
          </Popover>
        </div>

        {/* Segmented Credit Bar */}
        <div className="w-full h-3 rounded-full bg-secondary overflow-hidden flex">
          {freePercent > 0 && (
            <div
              className="h-full bg-primary rounded-l-full transition-all duration-500"
              style={{ width: `${freePercent}%` }}
            />
          )}
          {purchasedPercent > 0 && (
            <div
              className="h-full bg-muted-foreground/30 transition-all duration-500"
              style={{ width: `${purchasedPercent}%`, borderRadius: freePercent === 0 ? '9999px 0 0 9999px' : '0' }}
            />
          )}
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <Gift className="h-3 w-3 text-primary" />
            <span>Free: {freeRemaining.toLocaleString()}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <CreditCard className="h-3 w-3 text-muted-foreground" />
            <span>Purchased: {purchasedCredits.toLocaleString()}</span>
          </div>
        </div>

        {/* Lifetime stats */}
        <div className="flex gap-4 text-sm">
          <div className="flex items-center gap-1 text-muted-foreground">
            <ArrowUpRight className="h-3.5 w-3.5 text-green-500" />
            <span>{formatCredits(wallet?.lifetime_credits ?? 0)} earned</span>
          </div>
          <div className="flex items-center gap-1 text-muted-foreground">
            <ArrowDownRight className="h-3.5 w-3.5 text-red-500" />
            <span>{formatCredits(wallet?.lifetime_debits ?? 0)} used</span>
          </div>
        </div>

        {/* Recent transactions */}
        {transactions.length > 0 && (
          <div className="space-y-1.5 pt-2 border-t border-border">
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
      </CardContent>
    </Card>
  );
}

function cleanDescription(desc: string): string {
  if (!desc) return 'Usage';
  const lower = desc.toLowerCase();
  if (lower.includes('chat') || lower.includes('help_chat') || lower.includes('ring_chat')) return 'AI Chat';
  if (lower.includes('preview') || lower.includes('render') || lower.includes('image')) return 'Image Render';
  if (lower.includes('cost_estimate') || lower.includes('estimate')) return 'Cost Estimate';
  if (lower.includes('credit') || lower.includes('purchase') || lower.includes('top-up') || lower.includes('topup')) return 'Credit Purchase';
  if (lower.includes('auto-recharge') || lower.includes('auto_recharge')) return 'Auto-Recharge';
  if (lower.includes('free credits')) return 'Free Credits';
  return desc.replace(/gemini[-\s]?\S*/gi, '').replace(/gpt[-\s]?\S*/gi, '').replace(/\s{2,}/g, ' ').trim() || 'Usage';
}