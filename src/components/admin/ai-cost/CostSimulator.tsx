import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Calculator, MessageSquare, Image, DollarSign, TrendingUp, Loader2 } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { dollarsToCredits } from '@/lib/credit-utils';

interface PlanTier {
  name: string;
  price: number;
  defaultChat: number;
  defaultImages: number;
}

interface CostSimulatorProps {
  totalClients?: number;
}

export function CostSimulator({ totalClients = 1 }: CostSimulatorProps) {
  const [chatMessages, setChatMessages] = useState(2000);
  const [imageGenerations, setImageGenerations] = useState(100);
  const [platformMode, setPlatformMode] = useState(false);
  const [loading, setLoading] = useState(true);
  const [planTiers, setPlanTiers] = useState<PlanTier[]>([]);

  // Dynamic costs from config
  const [imageBaseCost, setImageBaseCost] = useState(0.13);
  const [imageMultiplier, setImageMultiplier] = useState(1.0);
  const [chatBaseCost, setChatBaseCost] = useState(0.0005);
  const [chatMultiplier, setChatMultiplier] = useState(1.0);

  useEffect(() => {
    (async () => {
      const [configRes, plansRes, defaultsRes] = await Promise.all([
        supabase
          .from('platform_ai_config' as any)
          .select('image_base_cost, image_multiplier, chat_base_cost, chat_multiplier')
          .limit(1)
          .single(),
        supabase
          .from('subscription_plans')
          .select('id, name, price_monthly')
          .order('price_monthly', { ascending: true }),
        supabase
          .from('plan_ai_defaults' as any)
          .select('plan_id, chat_quota, image_quota'),
      ]);

      if (configRes.data) {
        const d = configRes.data as any;
        setImageBaseCost(d.image_base_cost ?? 0.13);
        setImageMultiplier(d.image_multiplier ?? 1);
        setChatBaseCost(d.chat_base_cost ?? 0.0005);
        setChatMultiplier(d.chat_multiplier ?? 1);
      }

      if (plansRes.data) {
        const defaultsMap = new Map(
          ((defaultsRes.data as any[]) || []).map((d: any) => [d.plan_id, d])
        );
        const tiers: PlanTier[] = (plansRes.data as any[]).map((sp: any) => {
          const pad = defaultsMap.get(sp.id) as any;
          return {
            name: sp.name,
            price: Number(sp.price_monthly),
            defaultChat: pad?.chat_quota ?? 2000,
            defaultImages: pad?.image_quota ?? 100,
          };
        });
        setPlanTiers(tiers);
      }

      setLoading(false);
    })();
  }, []);

  const chatEffective = chatBaseCost * chatMultiplier;
  const imageEffective = imageBaseCost * imageMultiplier;

  const chatOurCost = chatMessages * chatBaseCost;
  const imageOurCost = imageGenerations * imageBaseCost;
  const chatClientCharge = chatMessages * chatEffective;
  const imageClientCharge = imageGenerations * imageEffective;
  const totalOurCost = chatOurCost + imageOurCost;
  const totalClientCharge = chatClientCharge + imageClientCharge;
  const totalPlatformCharge = platformMode ? totalClientCharge * totalClients : totalClientCharge;
  const totalPlatformOurCost = platformMode ? totalOurCost * totalClients : totalOurCost;
  const markup = totalClientCharge - totalOurCost;

  if (loading) {
    return (
      <Card className="border-border">
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Calculator className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">AI Cost Simulator</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            <Label htmlFor="platform-toggle" className="text-xs text-muted-foreground">
              {platformMode ? `Platform (${totalClients} clients)` : 'Per Client'}
            </Label>
            <Switch
              id="platform-toggle"
              checked={platformMode}
              onCheckedChange={setPlatformMode}
            />
          </div>
        </div>
        <CardDescription>
          Adjust quotas to see estimated AI costs and margins per plan tier
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Sliders */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-1.5">
                <MessageSquare className="h-4 w-4 text-blue-500" />
                Chat Messages / mo
              </Label>
              <Input
                type="number"
                value={chatMessages}
                onChange={(e) => setChatMessages(Math.max(0, Number(e.target.value)))}
                className="w-28 h-8 text-right text-sm"
              />
            </div>
            <Slider
              value={[chatMessages]}
              onValueChange={([v]) => setChatMessages(v)}
              min={0}
              max={50000}
              step={500}
            />
            <div className="text-xs text-muted-foreground space-y-0.5">
              <p>
                Our Cost: <span className="font-mono font-semibold text-foreground">${chatOurCost.toFixed(2)}</span>
                <span className="ml-1">@ ${chatBaseCost}/msg</span>
              </p>
              <p>
                Client Charge: <span className="font-mono font-semibold text-primary">${chatClientCharge.toFixed(2)}</span>
                <span className="ml-1">@ ${chatEffective}/msg ({chatMultiplier}×)</span>
              </p>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-1.5">
                <Image className="h-4 w-4 text-purple-500" />
                Image Generations / mo
              </Label>
              <Input
                type="number"
                value={imageGenerations}
                onChange={(e) => setImageGenerations(Math.max(0, Number(e.target.value)))}
                className="w-28 h-8 text-right text-sm"
              />
            </div>
            <Slider
              value={[imageGenerations]}
              onValueChange={([v]) => setImageGenerations(v)}
              min={0}
              max={5000}
              step={50}
            />
            <div className="text-xs text-muted-foreground space-y-0.5">
              <p>
                Our Cost: <span className="font-mono font-semibold text-foreground">${imageOurCost.toFixed(2)}</span>
                <span className="ml-1">@ ${imageBaseCost}/gen</span>
              </p>
              <p>
                Client Charge: <span className="font-mono font-semibold text-primary">${imageClientCharge.toFixed(2)}</span>
                <span className="ml-1">@ ${imageEffective.toFixed(4)}/gen ({imageMultiplier}×)</span>
              </p>
            </div>
          </div>
        </div>

        {/* Total cost banner */}
        <div className="rounded-lg bg-primary/5 border border-primary/20 p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-primary" />
              <p className="text-sm font-medium">
                {platformMode ? 'Total Platform' : 'Per Client'} — Cost vs Charge
              </p>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Our Cost</p>
              <p className="text-lg font-bold font-mono">${totalPlatformOurCost.toFixed(2)}</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Client Charge</p>
              <p className="text-lg font-bold font-mono text-primary">${totalPlatformCharge.toFixed(2)}</p>
              <p className="text-[10px] text-muted-foreground">({dollarsToCredits(totalPlatformCharge).toLocaleString()} cr)</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">AI Markup</p>
              <p className={`text-lg font-bold font-mono ${markup >= 0 ? 'text-green-500' : 'text-destructive'}`}>
                ${(platformMode ? markup * totalClients : markup).toFixed(2)}
              </p>
            </div>
          </div>
        </div>

        {/* Plan margin comparison */}
        <div>
          <h4 className="text-sm font-semibold mb-3 flex items-center gap-1.5">
            <TrendingUp className="h-4 w-4" />
            Margin by Plan Tier
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {planTiers.map((plan) => {
              const margin = plan.price - totalClientCharge;
              const marginPct = ((margin / plan.price) * 100).toFixed(1);
              const isPositive = margin > 0;

              return (
                <div
                  key={plan.name}
                  className="rounded-lg border border-border p-3 space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-sm">{plan.name}</span>
                    <span className="text-sm text-muted-foreground">${plan.price}/mo</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Client Charge</span>
                    <span className="text-xs font-mono">${totalClientCharge.toFixed(2)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Margin</span>
                    <Badge variant={isPositive ? 'default' : 'destructive'} className="text-xs">
                      ${margin.toFixed(2)} ({marginPct}%)
                    </Badge>
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    Defaults: {plan.defaultChat.toLocaleString()} chat / {plan.defaultImages} images
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
