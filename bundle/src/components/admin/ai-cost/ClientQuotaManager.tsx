import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Save, RotateCcw, Users, Loader2, Plus } from 'lucide-react';
import { dollarsToCredits } from '@/lib/credit-utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface ClientWithQuota {
  id: string;
  company_name: string;
  email: string;
  plan_name: string | null;
  plan_id: string | null;
  plan_price: number | null;
  chat_quota: number;
  image_quota: number;
  chat_rpm: number | null;
  image_rpm: number | null;
  is_custom: boolean;
  quota_id: string | null;
  dirty: boolean;
  wallet_balance: number;
}

interface PlanDefaults {
  chat: number;
  images: number;
  chatRpm: number;
  imageRpm: number;
}

const SYSTEM_FALLBACK: PlanDefaults = { chat: 3000, images: 200, chatRpm: 32, imageRpm: 10 };

export function ClientQuotaManager() {
  const [clients, setClients] = useState<ClientWithQuota[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [toppingUp, setToppingUp] = useState<string | null>(null);
  // planDefaultsMap: plan_id → PlanDefaults (loaded from DB)
  const [planDefaultsMap, setPlanDefaultsMap] = useState<Map<string, PlanDefaults>>(new Map());
  // planNamesMap: plan_id → plan_name (for bulk apply dropdown)
  const [planNamesMap, setPlanNamesMap] = useState<Map<string, string>>(new Map());
  // Dynamic AI cost rates from platform_ai_config (base × multiplier = what clients are charged)
  const [chatEffectiveCost, setChatEffectiveCost] = useState(0.0005);
  const [imageEffectiveCost, setImageEffectiveCost] = useState(0.13);
  const { toast } = useToast();

  const fetchClients = async () => {
    setLoading(true);
    try {
      const [clientsRes, quotasRes, walletsRes, plansRes, defaultsRes, configRes] = await Promise.all([
        supabase
          .from('clients')
          .select('id, company_name, email, plan_id, subscription_plans(name, price_monthly)')
          .order('company_name'),
        supabase.from('client_ai_quotas').select('*'),
        supabase.from('client_wallets').select('client_id, balance'),
        supabase.from('subscription_plans').select('id, name'),
        supabase.from('plan_ai_defaults' as any).select('plan_id, chat_quota, image_quota, chat_rpm, image_rpm'),
        supabase
          .from('platform_ai_config' as any)
          .select('chat_base_cost, chat_multiplier, image_base_cost, image_multiplier')
          .limit(1)
          .single(),
      ]);

      if (clientsRes.error) throw clientsRes.error;
      if (quotasRes.error) throw quotasRes.error;

      // Build plan defaults lookup: plan_id → PlanDefaults
      const newPlanDefaultsMap = new Map<string, PlanDefaults>();
      const newPlanNamesMap = new Map<string, string>();

      ((plansRes.data as any[]) || []).forEach((sp: any) => {
        newPlanNamesMap.set(sp.id, sp.name);
      });
      ((defaultsRes.data as any[]) || []).forEach((pad: any) => {
        newPlanDefaultsMap.set(pad.plan_id, {
          chat: pad.chat_quota ?? SYSTEM_FALLBACK.chat,
          images: pad.image_quota ?? SYSTEM_FALLBACK.images,
          chatRpm: pad.chat_rpm ?? SYSTEM_FALLBACK.chatRpm,
          imageRpm: pad.image_rpm ?? SYSTEM_FALLBACK.imageRpm,
        });
      });

      setPlanDefaultsMap(newPlanDefaultsMap);
      setPlanNamesMap(newPlanNamesMap);

      if (configRes.data) {
        const d = configRes.data as any;
        setChatEffectiveCost((d.chat_base_cost ?? 0.0005) * (d.chat_multiplier ?? 1.0));
        setImageEffectiveCost((d.image_base_cost ?? 0.13) * (d.image_multiplier ?? 1.0));
      }

      const quotasData = quotasRes.data;
      const walletMap = new Map(((walletsRes.data as any[]) || []).map((w: any) => [w.client_id, Number(w.balance)]));
      const quotaMap = new Map(quotasData?.map(q => [q.client_id, q]) || []);

      const merged: ClientWithQuota[] = ((clientsRes.data as any[]) || []).map((c: any) => {
        const quota = quotaMap.get(c.id);
        const planName = c.subscription_plans?.name || null;
        const planId = c.plan_id || null;
        const defaults = (planId && newPlanDefaultsMap.get(planId)) || SYSTEM_FALLBACK;

        return {
          id: c.id,
          company_name: c.company_name,
          email: c.email,
          plan_name: planName,
          plan_id: planId,
          plan_price: c.subscription_plans?.price_monthly || null,
          chat_quota: quota?.chat_quota ?? defaults.chat,
          image_quota: quota?.image_quota ?? defaults.images,
          chat_rpm: (quota as any)?.chat_rpm ?? null,
          image_rpm: (quota as any)?.image_rpm ?? null,
          is_custom: quota?.is_custom ?? false,
          quota_id: quota?.id ?? null,
          dirty: false,
          wallet_balance: walletMap.get(c.id) ?? 0,
        };
      });

      setClients(merged);
    } catch (err: any) {
      toast({ title: 'Error loading clients', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchClients(); }, []);

  const updateClientField = (clientId: string, field: keyof ClientWithQuota, value: number | null) => {
    setClients(prev =>
      prev.map(c =>
        c.id === clientId ? { ...c, [field]: value, is_custom: true, dirty: true } : c
      )
    );
  };

  const saveQuota = async (client: ClientWithQuota) => {
    setSaving(client.id);
    try {
      const { error } = await supabase
        .from('client_ai_quotas')
        .upsert({
          client_id: client.id,
          chat_quota: client.chat_quota,
          image_quota: client.image_quota,
          chat_rpm: client.chat_rpm,
          image_rpm: client.image_rpm,
          is_custom: client.is_custom,
        } as any, { onConflict: 'client_id' });

      if (error) throw error;

      setClients(prev =>
        prev.map(c => c.id === client.id ? { ...c, dirty: false } : c)
      );
      toast({ title: 'Quota saved', description: `Updated quota for ${client.company_name}` });
    } catch (err: any) {
      toast({ title: 'Error saving quota', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(null);
    }
  };

  const resetToDefault = (clientId: string) => {
    setClients(prev =>
      prev.map(c => {
        if (c.id !== clientId) return c;
        const defaults = (c.plan_id && planDefaultsMap.get(c.plan_id)) || SYSTEM_FALLBACK;
        return { ...c, chat_quota: defaults.chat, image_quota: defaults.images, chat_rpm: null, image_rpm: null, is_custom: false, dirty: true };
      })
    );
  };

  const topUpClient = async (clientId: string, amount: number) => {
    setToppingUp(clientId);
    try {
      const { data, error } = await supabase.rpc('credit_wallet', {
        p_client_id: clientId,
        p_amount: amount,
        p_type: 'credit',
        p_description: `Admin top-up ($${amount})`,
        p_reference_id: null,
      });
      if (error) throw error;
      setClients(prev =>
        prev.map(c => c.id === clientId ? { ...c, wallet_balance: (data as any)?.balance ?? c.wallet_balance + amount } : c)
      );
      toast({ title: 'Top-up successful', description: `$${amount} credited to client` });
    } catch (err: any) {
      toast({ title: 'Top-up failed', description: err.message, variant: 'destructive' });
    } finally {
      setToppingUp(null);
    }
  };

  const applyBulkDefaults = (planId: string) => {
    const planName = planNamesMap.get(planId) || planId;
    const defaults = planDefaultsMap.get(planId) || SYSTEM_FALLBACK;
    const updated = clients.map(c => ({
      ...c,
      chat_quota: defaults.chat,
      image_quota: defaults.images,
      chat_rpm: null,
      image_rpm: null,
      is_custom: false,
      dirty: true,
    }));
    setClients(updated);
    toast({ title: `Applied ${planName} defaults`, description: `All clients set to ${defaults.chat.toLocaleString()} chat / ${defaults.images} images` });
  };

  const totalAiCost = clients.reduce((sum, c) => {
    return sum + (c.chat_quota * chatEffectiveCost) + (c.image_quota * imageEffectiveCost);
  }, 0);

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border">
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            <div>
              <CardTitle className="text-lg">Client Quota Manager</CardTitle>
              <CardDescription>
                {clients.length} clients · Est. total AI cost: <span className="font-mono font-semibold text-foreground">${totalAiCost.toFixed(2)}/mo</span>
                {' '}· Total wallet liability: <span className="font-mono font-semibold text-foreground">${clients.reduce((s, c) => s + c.wallet_balance, 0).toFixed(2)}</span>
              </CardDescription>
            </div>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">Bulk Apply Defaults</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              {Array.from(planNamesMap.entries()).map(([planId, planName]) => {
                const d = planDefaultsMap.get(planId) || SYSTEM_FALLBACK;
                return (
                  <DropdownMenuItem key={planId} onClick={() => applyBulkDefaults(planId)}>
                    {planName} ({d.chat.toLocaleString()} / {d.images})
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Client</TableHead>
              <TableHead>Plan</TableHead>
              <TableHead className="text-center">Chat Quota</TableHead>
              <TableHead className="text-center">Image Quota</TableHead>
              <TableHead className="text-center">Chat RPM</TableHead>
              <TableHead className="text-center">Image RPM</TableHead>
              <TableHead className="text-right">Balance</TableHead>
              <TableHead className="text-right">Est. Cost</TableHead>
              <TableHead className="text-center">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {clients.map((client) => {
              const cost = (client.chat_quota * chatEffectiveCost) +
                (client.image_quota * imageEffectiveCost);
              const planDefaults = (client.plan_id && planDefaultsMap.get(client.plan_id)) || SYSTEM_FALLBACK;

              return (
                <TableRow key={client.id}>
                  <TableCell>
                    <div>
                      <p className="font-medium text-sm">{client.company_name}</p>
                      <p className="text-xs text-muted-foreground">{client.email}</p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="text-xs">
                      {client.plan_name || 'No Plan'}
                    </Badge>
                    {client.is_custom && (
                      <Badge variant="outline" className="text-xs ml-1">Custom</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-center">
                    <Input
                      type="number"
                      value={client.chat_quota}
                      onChange={(e) => updateClientField(client.id, 'chat_quota', Math.max(0, Number(e.target.value)))}
                      className="w-24 h-8 text-center text-sm mx-auto"
                    />
                  </TableCell>
                  <TableCell className="text-center">
                    <Input
                      type="number"
                      value={client.image_quota}
                      onChange={(e) => updateClientField(client.id, 'image_quota', Math.max(0, Number(e.target.value)))}
                      className="w-24 h-8 text-center text-sm mx-auto"
                    />
                  </TableCell>
                  <TableCell className="text-center">
                    <Input
                      type="number"
                      value={client.chat_rpm ?? ''}
                      placeholder={String(planDefaults.chatRpm)}
                      onChange={(e) => updateClientField(client.id, 'chat_rpm', e.target.value ? Math.max(1, Number(e.target.value)) : null)}
                      className="w-20 h-8 text-center text-sm mx-auto"
                    />
                  </TableCell>
                  <TableCell className="text-center">
                    <Input
                      type="number"
                      value={client.image_rpm ?? ''}
                      placeholder={String(planDefaults.imageRpm)}
                      onChange={(e) => updateClientField(client.id, 'image_rpm', e.target.value ? Math.max(1, Number(e.target.value)) : null)}
                      className="w-20 h-8 text-center text-sm mx-auto"
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <div>
                      <span className="font-mono text-sm">${client.wallet_balance.toFixed(2)}</span>
                      <p className="text-[10px] text-muted-foreground">{dollarsToCredits(client.wallet_balance).toLocaleString()} cr</p>
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <div>
                      <span className="font-mono text-sm">${cost.toFixed(2)}</span>
                      <p className="text-[10px] text-muted-foreground">{dollarsToCredits(cost).toLocaleString()} cr</p>
                    </div>
                  </TableCell>
                  <TableCell className="text-center">
                    <div className="flex items-center justify-center gap-1">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8" title="Top up wallet" disabled={toppingUp === client.id}>
                            {toppingUp === client.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent>
                          <DropdownMenuItem onClick={() => topUpClient(client.id, 10)}>+$10</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => topUpClient(client.id, 25)}>+$25</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => topUpClient(client.id, 50)}>+$50</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => topUpClient(client.id, 100)}>+$100</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => resetToDefault(client.id)}
                        title="Reset to plan defaults"
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant={client.dirty ? 'default' : 'ghost'}
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => saveQuota(client)}
                        disabled={!client.dirty || saving === client.id}
                        title="Save quota"
                      >
                        {saving === client.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Save className="h-3.5 w-3.5" />
                        )}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
