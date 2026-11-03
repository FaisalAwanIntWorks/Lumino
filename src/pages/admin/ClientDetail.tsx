import { stickyHeaderTableClass } from "@/components/ui/table";
import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import {
  ArrowLeft, Building, Users, Wallet, Shield, Calendar, Activity, Eye, DollarSign, Bot, ChevronDown, Tag, X, Trash2, PauseCircle, CreditCard, RefreshCw, Loader2, Check, AlertCircle, Circle
} from 'lucide-react';
import { toast } from 'sonner';
import { format, subDays } from 'date-fns';
import { useAdminImpersonation } from '@/contexts/AdminImpersonationContext';
import { LicenseFeePaymentsEditor } from '@/components/admin/LicenseFeePaymentsEditor';
import { BillingOverrideCard } from '@/components/admin/BillingOverrideCard';
import { DeleteClientDialog } from '@/components/admin/DeleteClientDialog';

interface StaffMember {
  id: string;
  name: string;
  email: string;
  status: string;
}

interface PlanOption {
  id: string;
  name: string;
  price_monthly: number;
}

// Simplified to 3 product groups
const FEATURE_GROUPS: { label: string; keys: string[] }[] = [
  { label: 'RingOS', keys: ['product_catalogue', 'diamond_form', 'orders'] },
  { label: 'CustomX', keys: ['custom_enquiry', 'grillz_builder'] },
  { label: 'Metal IQ', keys: ['metal_buying'] },
];

const STATUS_OPTIONS = ['active', 'trial', 'paused', 'cancelled', 'archived', 'CRM - Active', 'CRM - Trial', 'CRM - Paused'];
const ACCOUNT_TAG_OPTIONS = ['CustomX', 'JewlX Suite', 'RingOS', 'Metal IQ'];

function isGroupEnabled(features: Record<string, boolean>, keys: string[]): boolean {
  return keys.every(k => features[k] !== false);
}

export default function ClientDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { startImpersonation } = useAdminImpersonation();
  const [client, setClient] = useState<any>(null);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  const [recentActivity, setRecentActivity] = useState<any[]>([]);
  const [totalRevenue, setTotalRevenue] = useState<number>(0);
  const [walletTransactions, setWalletTransactions] = useState<any[]>([]);
  const [plans, setPlans] = useState<PlanOption[]>([]);
  const [accountTags, setAccountTags] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [savingFeatures, setSavingFeatures] = useState(false);
  const [localFeatures, setLocalFeatures] = useState<Record<string, boolean>>({});
  const [freeCredits, setFreeCredits] = useState<number>(0);
  const [lifetimeDebits, setLifetimeDebits] = useState<number>(0);
  const [lifetimeCredits, setLifetimeCredits] = useState<number>(0);
  const [stripeCustomerInput, setStripeCustomerInput] = useState<string>('');
  const [syncingStripe, setSyncingStripe] = useState(false);
  const [autoSyncStripe, setAutoSyncStripe] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    return localStorage.getItem('admin.autoSyncStripeAfterSave') !== '0';
  });
  type SyncStepStatus = 'pending' | 'active' | 'done' | 'error';
  type SyncStep = { key: string; label: string; status: SyncStepStatus; detail?: string };
  const [syncSteps, setSyncSteps] = useState<SyncStep[]>([]);
  const [syncResult, setSyncResult] = useState<{ kind: 'success' | 'error'; message: string } | null>(null);
  const [lastSyncCustomerId, setLastSyncCustomerId] = useState<string | null>(null);
  useEffect(() => {
    if (id) fetchAll();
  }, [id]);

  const fetchAll = async () => {
    try {
      const thirtyDaysAgo = subDays(new Date(), 30).toISOString();

      const [clientRes, staffRes, activityRes, revenueRes, walletTxRes, plansRes] = await Promise.all([
        supabase
          .from('clients')
          .select('id, company_name, email, status, created_at, enabled_features, plan_id, account_tags, stripe_customer_id, billing_override_until, billing_override_reason, subscription_plans(name, price_monthly)')
          .eq('id', id!)
          .maybeSingle(),
        supabase
          .from('staff_members')
          .select('id, name, email, status')
          .eq('client_id', id!),
        supabase
          .from('client_activity_logs')
          .select('id, action_type, action_category, description, created_at, user_email')
          .eq('client_id', id!)
          .order('created_at', { ascending: false })
          .limit(50),
        supabase
          .from('orders')
          .select('total_price')
          .eq('client_id', id!),
        supabase
          .from('wallet_transactions')
          .select('*')
          .eq('client_id', id!)
          .order('created_at', { ascending: false })
          .limit(20),
        supabase
          .from('subscription_plans')
          .select('id, name, price_monthly')
          .order('price_monthly', { ascending: true }),
      ]);

      if (clientRes.error) throw clientRes.error;
      setClient(clientRes.data);
      const features = (clientRes.data?.enabled_features as Record<string, boolean>) || {};
      setLocalFeatures(features);
      setAccountTags((clientRes.data?.account_tags as string[]) || []);
      setStripeCustomerInput((clientRes.data as any)?.stripe_customer_id || '');
      setStaff((staffRes.data as unknown as StaffMember[]) || []);
      setRecentActivity(activityRes.data || []);
      setPlans((plansRes.data as unknown as PlanOption[]) || []);

      const rev = (revenueRes.data || []).reduce((sum: number, o: any) => sum + (Number(o.total_price) || 0), 0);
      setTotalRevenue(rev);
      setWalletTransactions(walletTxRes.data || []);

      // Fetch wallet info
      const { data: walletRow } = await supabase
        .from('client_wallets')
        .select('balance, lifetime_debits, lifetime_credits')
        .eq('client_id', id!)
        .maybeSingle();
      setWalletBalance(walletRow?.balance ?? null);
      setLifetimeDebits(Number(walletRow?.lifetime_debits) || 0);
      setLifetimeCredits(Number(walletRow?.lifetime_credits) || 0);

      // Fetch free credits
      const { data: freeRows } = await supabase
        .from('client_free_credits')
        .select('dollars_remaining')
        .eq('client_id', id!)
        .gt('expires_at', new Date().toISOString());
      const totalFree = (freeRows || []).reduce((sum: number, r: any) => sum + Number(r.dollars_remaining || 0), 0);
      setFreeCredits(totalFree);
    } catch (error) {
      console.error('Error fetching client data:', error);
      toast.error('Failed to load client details');
    } finally {
      setLoading(false);
    }
  };

  const updateStatus = async (newStatus: string) => {
    if (!client) return;
    try {
      const { error } = await supabase.from('clients').update({ status: newStatus }).eq('id', id!);
      if (error) throw error;
      const staffStatus = newStatus === 'inactive' || newStatus === 'archived' ? 'inactive' : 'active';
      await supabase.from('staff_members').update({ status: staffStatus }).eq('client_id', id!);
      toast.success(`Account status updated to ${newStatus}`);
      fetchAll();
    } catch (error) {
      toast.error('Failed to update status');
    }
  };

  const updatePlan = async (planId: string) => {
    if (!client) return;
    try {
      const val = planId === 'none' ? null : planId;
      const { error } = await supabase.from('clients').update({ plan_id: val }).eq('id', id!);
      if (error) throw error;
      toast.success('Plan updated');
      fetchAll();
    } catch (error) {
      toast.error('Failed to update plan');
    }
  };

  const saveStripeCustomerId = async () => {
    if (!client) return;
    const value = stripeCustomerInput.trim();
    if (value && !/^cus_[A-Za-z0-9]+$/.test(value)) {
      toast.error('Invalid Stripe customer ID (expected cus_…)');
      return;
    }
    try {
      const { error } = await supabase
        .from('clients')
        .update({ stripe_customer_id: value || null } as any)
        .eq('id', id!);
      if (error) throw error;
      toast.success(value ? 'Stripe customer linked' : 'Stripe customer cleared');
      setClient({ ...client, stripe_customer_id: value || null });
      if (value && autoSyncStripe) {
        await syncFromStripe(value);
      }
    } catch (e) {
      toast.error('Failed to save Stripe customer ID');
    }
  };

  const syncFromStripe = async (overrideCustomerId?: string) => {
    if (!client) return;
    setSyncingStripe(true);
    setSyncResult(null);

    const initialSteps: SyncStep[] = [
      { key: 'validate', label: 'Validating customer ID', status: 'pending' },
      { key: 'fetch', label: 'Fetching subscription from Stripe', status: 'pending' },
      { key: 'plan', label: 'Resolving plan & status', status: 'pending' },
      { key: 'save', label: 'Updating client record', status: 'pending' },
    ];
    setSyncSteps(initialSteps);

    const setStep = (key: string, status: SyncStepStatus, detail?: string) => {
      setSyncSteps((prev) => prev.map((s) => (s.key === key ? { ...s, status, detail } : s)));
    };
    const failFrom = (key: string, message: string) => {
      setSyncSteps((prev) => {
        let hitError = false;
        return prev.map((s) => {
          if (s.key === key) { hitError = true; return { ...s, status: 'error', detail: message }; }
          if (hitError) return { ...s, status: 'pending' };
          return s;
        });
      });
    };

    try {
      setStep('validate', 'active');
      const value = overrideCustomerId || stripeCustomerInput.trim() || client.stripe_customer_id || undefined;
      if (!value) {
        failFrom('validate', 'No Stripe customer ID provided');
        const msg = 'No Stripe customer ID provided';
        setSyncResult({ kind: 'error', message: msg });
        toast.error(msg);
        return;
      }
      if (!/^cus_[A-Za-z0-9]+$/.test(value)) {
        failFrom('validate', 'Invalid format (expected cus_…)');
        const msg = 'Invalid Stripe customer ID format';
        setSyncResult({ kind: 'error', message: msg });
        toast.error(msg);
        return;
      }
      setLastSyncCustomerId(value);
      setStep('validate', 'done', value);

      setStep('fetch', 'active');
      const { data, error } = await supabase.functions.invoke('reconcile-client-stripe', {
        body: { client_id: id, stripe_customer_id: value },
      });
      if (error) {
        // supabase-js puts non-2xx response details in error.context (a Response object).
        let detail = error.message || 'Edge function error';
        try {
          const ctx: any = (error as any).context;
          if (ctx && typeof ctx.json === 'function') {
            const body = await ctx.clone().json();
            detail = body?.error || body?.message || body?.reason || detail;
          }
        } catch { /* ignore parse failures */ }
        failFrom('fetch', detail);
        setSyncResult({ kind: 'error', message: detail });
        toast.error(detail);
        return;
      }
      if (data?.ok === false) {
        const reason = data?.message || `Could not sync (${data?.reason || 'unknown'})`;
        failFrom('fetch', reason);
        setSyncResult({ kind: 'error', message: reason });
        toast.error(reason);
        return;
      }
      const isScheduled = data?.status === 'scheduled';
      const startsLabel = data?.scheduled_start_at
        ? new Date(data.scheduled_start_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
        : null;
      setStep('fetch', 'done', data?.subscription_id
        ? `sub ${String(data.subscription_id).slice(0, 18)}…`
        : isScheduled ? `scheduled plan starts ${startsLabel}` : 'subscription found');

      setStep('plan', 'active');
      const plan = data?.plan_name || (isScheduled ? 'Scheduled plan' : 'Custom Plan');
      const status = isScheduled ? `scheduled · starts ${startsLabel}` : (data?.status || 'unknown');
      setStep('plan', 'done', `${plan} · ${status}`);
      if (data?.email_mismatch) {
        toast.info(`Stripe email (${data.stripe_email}) differs from the login email. Billing still uses the linked Stripe customer.`);
      }

      setStep('save', 'active');
      await fetchAll();
      setStep('save', 'done');

      const successMsg = `Synced from Stripe — ${plan} (${status})`;
      setSyncResult({ kind: 'success', message: successMsg });
      toast.success(successMsg);
    } catch (e: any) {
      const msg = e?.message || 'Sync failed';
      setSyncResult({ kind: 'error', message: msg });
      toast.error(msg);
    } finally {
      setSyncingStripe(false);
    }
  };

  const toggleAccountTag = async (tag: string) => {
    const next = accountTags.includes(tag)
      ? accountTags.filter(t => t !== tag)
      : [...accountTags, tag];
    setAccountTags(next);
    try {
      const { error } = await supabase.from('clients').update({ account_tags: next } as any).eq('id', id!);
      if (error) throw error;
    } catch (error) {
      toast.error('Failed to update tags');
    }
  };

  const resetCredits = async () => {
    if (!client || !confirm('Reset this client\'s wallet balance to 0?')) return;
    try {
      const { error } = await supabase.from('client_wallets').update({ balance: 0 }).eq('client_id', id!);
      if (error) throw error;
      await supabase.from('wallet_transactions').insert({
        client_id: id!,
        type: 'debit',
        amount: -(walletBalance || 0),
        balance_after: 0,
        description: 'Admin: credits reset to zero',
      });
      toast.success('Credits reset to zero');
      fetchAll();
    } catch (error) {
      toast.error('Failed to reset credits');
    }
  };

  const stopRebilling = async () => {
    if (!client || !confirm('Stop rebilling for this client? This will cancel their auto-recharge.')) return;
    try {
      const { error } = await supabase
        .from('client_auto_recharge_settings')
        .update({ enabled: false })
        .eq('client_id', id!);
      if (error) throw error;
      toast.success('Rebilling stopped');
    } catch (error) {
      toast.error('Failed to stop rebilling');
    }
  };

  const pauseAIWallet = async () => {
    if (!client || !confirm('Pause AI wallet for this client? They will not be able to use AI features.')) return;
    try {
      // Set wallet balance to 0 to effectively pause AI usage
      const { error } = await supabase.from('client_wallets').update({ balance: 0 }).eq('client_id', id!);
      if (error) throw error;
      await supabase.from('wallet_transactions').insert({
        client_id: id!,
        type: 'debit',
        amount: -(walletBalance || 0),
        balance_after: 0,
        description: 'Admin: AI wallet paused',
      });
      toast.success('AI wallet paused');
      fetchAll();
    } catch (error) {
      toast.error('Failed to pause AI wallet');
    }
  };

  const toggleFeatureGroup = (keys: string[], enabled: boolean) => {
    setLocalFeatures(prev => {
      const updated = { ...prev };
      keys.forEach(k => { updated[k] = enabled; });
      return updated;
    });
  };

  const saveFeatures = async () => {
    if (!client) return;
    setSavingFeatures(true);
    try {
      const { error } = await supabase
        .from('clients')
        .update({ enabled_features: localFeatures })
        .eq('id', id!);
      if (error) throw error;
      toast.success('Feature access updated');
      fetchAll();
    } catch (error) {
      toast.error('Failed to save features');
    } finally {
      setSavingFeatures(false);
    }
  };

  const handleViewAsClient = () => {
    if (!client) return;
    startImpersonation(client.id, client.company_name);
    navigate('/admin/view-as/dashboard');
  };

  const getStatusColor = (status: string) => {
    if (status.includes('Active') || status === 'active') return 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20';
    if (status.includes('Trial') || status === 'trial') return 'bg-blue-500/10 text-blue-600 border-blue-500/20';
    if (status.includes('Paused') || status === 'paused') return 'bg-amber-500/10 text-amber-600 border-amber-500/20';
    if (status.includes('Cancelled') || status === 'cancelled' || status === 'archived') return 'bg-red-500/10 text-red-600 border-red-500/20';
    return 'bg-muted text-muted-foreground border-border';
  };

  if (loading) {
    return (
      <div className="p-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-muted rounded w-1/4"></div>
          <div className="h-64 bg-muted rounded"></div>
        </div>
      </div>
    );
  }

  if (!client) {
    return (
      <div className="p-8">
        <Card className="p-12 text-center">
          <h3 className="text-lg font-semibold mb-2">Client Not Found</h3>
          <Button onClick={() => navigate('/admin/clients')}>Back to Clients</Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <Button variant="ghost" onClick={() => navigate('/admin/clients')} className="mb-3">
          <ArrowLeft className="w-4 h-4 mr-2" />Back to Clients
        </Button>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold">{client.company_name}</h1>
            <p className="text-sm text-muted-foreground">{client.email}</p>
          </div>
          <div className="flex items-center gap-2">
            <Badge className={getStatusColor(client.status)}>{client.status}</Badge>
            <Button variant="outline" size="sm" onClick={handleViewAsClient}>
              <Eye className="w-4 h-4 mr-1" />View as Client
            </Button>
          </div>
        </div>
      </div>

      {/* Summary Cards — Plan, Wallet, Revenue, Member Since */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <Building className="w-6 h-6 text-primary shrink-0" />
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">Plan</p>
              <p className="text-sm font-semibold truncate">{client.subscription_plans?.name || 'No plan'}</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <Wallet className="w-6 h-6 text-primary shrink-0" />
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">Wallet</p>
              <p className="text-sm font-semibold">{walletBalance !== null ? `$${(walletBalance / 2000).toFixed(2)}` : '—'}</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <DollarSign className="w-6 h-6 text-emerald-500 shrink-0" />
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">Revenue</p>
              <p className="text-sm font-semibold">${totalRevenue.toLocaleString()}</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <Calendar className="w-6 h-6 text-muted-foreground shrink-0" />
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">Member Since</p>
              <p className="text-sm font-semibold">{format(new Date(client.created_at), 'MMM yyyy')}</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="features">Features</TabsTrigger>
          <TabsTrigger value="staff">Staff ({staff.length})</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
          <TabsTrigger value="billing">Billing</TabsTrigger>
        </TabsList>

        {/* Overview */}
        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            {/* Plan Assignment */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2"><Building className="w-4 h-4" />Plan Assignment</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <Select value={client.plan_id || 'none'} onValueChange={updatePlan}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a plan" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No Plan</SelectItem>
                    {plans.map(p => (
                      <SelectItem key={p.id} value={p.id}>{p.name} — ${p.price_monthly}/mo</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <div className="space-y-2 pt-3 border-t border-border">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Stripe Customer</p>
                    {client.stripe_customer_id && (
                      <Badge variant="outline" className="text-[10px]">Linked</Badge>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-snug">
                    For clients on custom products / payment links. Paste their Stripe customer ID (cus_…) to fetch their subscription, invoices, and billing portal.
                  </p>
                  <div className="flex gap-2">
                    <Input
                      placeholder="cus_..."
                      value={stripeCustomerInput}
                      onChange={(e) => {
                        setStripeCustomerInput(e.target.value);
                        if (syncResult || syncSteps.length > 0) {
                          setSyncResult(null);
                          setSyncSteps([]);
                        }
                      }}
                      className="font-mono text-xs"
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={saveStripeCustomerId}
                      disabled={stripeCustomerInput.trim() === (client.stripe_customer_id || '')}
                    >
                      Save
                    </Button>
                  </div>
                  <label className="flex items-center gap-2 text-[11px] text-muted-foreground cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={autoSyncStripe}
                      onChange={(e) => {
                        setAutoSyncStripe(e.target.checked);
                        localStorage.setItem('admin.autoSyncStripeAfterSave', e.target.checked ? '1' : '0');
                      }}
                      className="h-3.5 w-3.5 rounded border-border"
                    />
                    Auto-sync from Stripe right after saving the customer ID
                  </label>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => syncFromStripe()}
                    disabled={syncingStripe || (!stripeCustomerInput.trim() && !client.stripe_customer_id)}
                    className="w-full"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 mr-2 ${syncingStripe ? 'animate-spin' : ''}`} />
                    {syncingStripe ? 'Syncing…' : 'Sync from Stripe'}
                  </Button>

                  {(syncingStripe || syncSteps.length > 0) && (
                    <div className="mt-2 rounded-md border border-border bg-muted/30 p-2.5 space-y-1.5">
                      {syncSteps.map((s) => (
                        <div key={s.key} className="flex items-start gap-2 text-[11px]">
                          <span className="mt-0.5 shrink-0">
                            {s.status === 'active' && <Loader2 className="w-3 h-3 animate-spin text-primary" />}
                            {s.status === 'done' && <Check className="w-3 h-3 text-emerald-500" />}
                            {s.status === 'error' && <AlertCircle className="w-3 h-3 text-destructive" />}
                            {s.status === 'pending' && <Circle className="w-3 h-3 text-muted-foreground/50" />}
                          </span>
                          <span className="flex-1 leading-snug">
                            <span className={
                              s.status === 'done' ? 'text-foreground' :
                              s.status === 'active' ? 'text-foreground font-medium' :
                              s.status === 'error' ? 'text-destructive' :
                              'text-muted-foreground'
                            }>
                              {s.label}
                            </span>
                            {s.detail && (
                              <span className="block text-[10px] text-muted-foreground font-mono mt-0.5 break-all">
                                {s.detail}
                              </span>
                            )}
                          </span>
                        </div>
                      ))}
                      {syncResult && !syncingStripe && (
                        <div className="mt-2 pt-2 border-t border-border space-y-2">
                          <div className={`flex items-start gap-2 text-[11px] ${
                            syncResult.kind === 'success' ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive'
                          }`}>
                            {syncResult.kind === 'success'
                              ? <Check className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                              : <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />}
                            <span className="leading-snug font-medium break-words">{syncResult.message}</span>
                          </div>
                          {syncResult.kind === 'error' && (
                            <div className="space-y-1.5">
                              {lastSyncCustomerId && (
                                <div className="text-[10px] text-muted-foreground">
                                  Last attempted: <span className="font-mono text-foreground">{lastSyncCustomerId}</span>
                                </div>
                              )}
                              <Button
                                size="sm"
                                variant="outline"
                                className="w-full h-7 text-[11px]"
                                disabled={syncingStripe || (!lastSyncCustomerId && !stripeCustomerInput.trim() && !client.stripe_customer_id)}
                                onClick={() => syncFromStripe(lastSyncCustomerId || undefined)}
                              >
                                <RefreshCw className={`w-3 h-3 mr-1.5 ${syncingStripe ? 'animate-spin' : ''}`} />
                                Retry sync
                              </Button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <LicenseFeePaymentsEditor
                  clientId={id!}
                  hasStripeCustomer={!!client.stripe_customer_id}
                  onChange={() => fetchAll()}
                />
              </CardContent>
            </Card>

            {/* Account Tags */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2"><Tag className="w-4 h-4" />Account Tags</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {ACCOUNT_TAG_OPTIONS.map(tag => {
                    const active = accountTags.includes(tag);
                    return (
                      <button
                        key={tag}
                        onClick={() => toggleAccountTag(tag)}
                        className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                          active
                            ? 'bg-primary text-primary-foreground border-primary'
                            : 'bg-muted/50 text-muted-foreground border-border hover:bg-muted'
                        }`}
                      >
                        {tag}
                        {active && <X className="w-3 h-3 ml-1 inline" />}
                      </button>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            {/* AI Wallet */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2"><Wallet className="w-4 h-4" />AI Wallet</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Credits Balance</span>
                  <span className="font-medium">{walletBalance !== null ? walletBalance.toLocaleString() : '—'}</span>
                </div>
                <div className="flex justify-between text-sm border-t pt-2">
                  <span className="font-medium">Value</span>
                  <span className="font-bold">${walletBalance !== null ? (walletBalance / 2000).toFixed(2) : '0.00'}</span>
                </div>
              </CardContent>
            </Card>

            {/* Account Actions */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2"><Shield className="w-4 h-4" />Account Actions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" className="w-full justify-between">
                      <span>Change Status: <strong>{client.status}</strong></span>
                      <ChevronDown className="w-4 h-4 ml-2" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-56">
                    {STATUS_OPTIONS.map((s) => (
                      <DropdownMenuItem
                        key={s}
                        onClick={() => updateStatus(s)}
                        className={client.status === s ? 'bg-accent' : ''}
                      >
                        {s}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
                <div className="grid grid-cols-2 gap-2">
                  <Button variant="outline" size="sm" className="text-amber-600 hover:text-amber-700" onClick={resetCredits}>
                    Reset Credits
                  </Button>
                  <Button variant="outline" size="sm" className="text-amber-600 hover:text-amber-700" onClick={() => updateStatus('archived')}>
                    Archive Account
                  </Button>
                  <Button variant="outline" size="sm" className="text-orange-600 hover:text-orange-700" onClick={stopRebilling}>
                    <CreditCard className="w-3 h-3 mr-1" />Stop Rebilling
                  </Button>
                  <Button variant="outline" size="sm" className="text-orange-600 hover:text-orange-700" onClick={pauseAIWallet}>
                    <PauseCircle className="w-3 h-3 mr-1" />Pause AI Wallet
                  </Button>
                </div>
                <Button variant="destructive" size="sm" className="w-full" onClick={() => setDeleteDialogOpen(true)}>
                  <Trash2 className="w-3 h-3 mr-1" />Delete Account
                </Button>
                <DeleteClientDialog
                  open={deleteDialogOpen}
                  onOpenChange={setDeleteDialogOpen}
                  client={{ id: client.id, company_name: client.company_name, email: client.email }}
                  onDeleted={() => navigate('/admin/clients')}
                />
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Features — 3 toggles only */}
        <TabsContent value="features" className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Feature Access</CardTitle>
                <Button size="sm" onClick={saveFeatures} disabled={savingFeatures}>
                  {savingFeatures ? 'Saving...' : 'Save Changes'}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {FEATURE_GROUPS.map((group) => (
                  <div key={group.label} className="flex items-center justify-between py-2 border-b border-border/30 last:border-0">
                    <div>
                      <p className="text-sm font-semibold">{group.label}</p>
                      <p className="text-xs text-muted-foreground">
                        {group.keys.join(', ').replace(/_/g, ' ')}
                      </p>
                    </div>
                    <Switch
                      checked={isGroupEnabled(localFeatures, group.keys)}
                      onCheckedChange={(v) => toggleFeatureGroup(group.keys, v)}
                    />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Staff */}
        <TabsContent value="staff" className="space-y-4">
          {staff.length === 0 ? (
            <Card className="p-8 text-center">
              <Users className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
              <p className="text-muted-foreground">No staff members in this account</p>
            </Card>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {staff.map((s) => (
                <Card key={s.id} className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-sm">{s.name}</p>
                      <p className="text-xs text-muted-foreground">{s.email}</p>
                    </div>
                    <Badge variant={s.status === 'active' ? 'default' : 'secondary'} className="text-xs">{s.status}</Badge>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Activity — expanded with more entries */}
        <TabsContent value="activity" className="space-y-4">
          {recentActivity.length === 0 ? (
            <Card className="p-8 text-center">
              <Activity className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
              <p className="text-muted-foreground">No recent activity</p>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-0">
                <div className="divide-y">
                  {recentActivity.map((act) => (
                    <div key={act.id} className="p-4 flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">{act.description}</p>
                        <p className="text-xs text-muted-foreground">
                          {act.user_email} · {act.action_type}
                          {act.action_category && <span className="ml-1 text-muted-foreground/60">({act.action_category})</span>}
                        </p>
                      </div>
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {format(new Date(act.created_at), 'MMM d, HH:mm')}
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Billing — Enhanced credit wallet info */}
        <TabsContent value="billing" className="space-y-4">
          <div className="flex justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                const t = toast.loading('Reconciling with Stripe…');
                try {
                  const { data, error } = await supabase.functions.invoke('reconcile-client-stripe', {
                    body: { client_id: id },
                  });
                  if (error) throw error;
                  if (data?.ok) {
                    toast.success(`Reconciled: ${data.plan_name || 'plan'} (${data.status})`, { id: t });
                    fetchAll();
                  } else {
                    toast.error(data?.message || 'No Stripe subscription found', { id: t });
                  }
                } catch (e: any) {
                  toast.error(e?.message || 'Reconcile failed', { id: t });
                }
              }}
            >
              <CreditCard className="mr-2 h-4 w-4" />
              Reconcile Stripe
            </Button>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Subscription</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Plan</span>
                  <span className="font-medium">{client.subscription_plans?.name || '—'}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Monthly Price</span>
                  <span className="font-medium">${client.subscription_plans?.price_monthly ?? '—'}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Status</span>
                  <Badge className={getStatusColor(client.status)}>{client.status}</Badge>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Credit Wallet</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Purchased Balance</span>
                  <span className="font-medium">{walletBalance !== null ? `$${(walletBalance / 2000).toFixed(2)}` : '$0.00'}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Free Credits</span>
                  <span className="font-medium text-emerald-600">${(freeCredits / 2000).toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm border-t pt-2">
                  <span className="text-muted-foreground">Total Top-ups</span>
                  <span className="font-medium">${(lifetimeCredits / 2000).toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Total Spent</span>
                  <span className="font-medium text-red-500">${(lifetimeDebits / 2000).toFixed(2)}</span>
                </div>
              </CardContent>
            </Card>
          </div>

          <BillingOverrideCard
            clientId={client.id}
            clientName={client.company_name}
            overrideUntil={(client as any).billing_override_until ?? null}
            overrideReason={(client as any).billing_override_reason ?? null}
            onChanged={fetchAll}
          />

          {/* Recent transactions */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Recent Transactions</CardTitle>
            </CardHeader>
            <CardContent>
              {walletTransactions.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">No transactions yet</p>
              ) : (
                <Table containerClassName={stickyHeaderTableClass}>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead className="text-right">Balance After</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {walletTransactions.map((tx: any) => (
                      <TableRow key={tx.id}>
                        <TableCell className="text-xs">{format(new Date(tx.created_at), 'MMM d, HH:mm')}</TableCell>
                        <TableCell>
                          <Badge variant={tx.type === 'credit' ? 'default' : 'secondary'} className="text-xs">{tx.type}</Badge>
                        </TableCell>
                        <TableCell className="text-sm max-w-[200px] truncate">{tx.description || '—'}</TableCell>
                        <TableCell className={`text-right text-sm font-medium ${tx.amount >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                          {tx.amount >= 0 ? '+' : ''}{Number(tx.amount).toFixed(2)}
                        </TableCell>
                        <TableCell className="text-right text-sm">{Number(tx.balance_after).toFixed(2)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
