import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Shield, Save, Loader2, DollarSign, Gift } from 'lucide-react';
import { dollarsToCredits, CREDIT_RATE } from '@/lib/credit-utils';

interface PlatformConfig {
  id: string;
  global_chat_rpm: number;
  global_image_rpm: number;
  global_cost_estimate_rpm: number;
  image_base_cost: number;
  image_multiplier: number;
  chat_base_cost: number;
  chat_multiplier: number;
  monthly_free_credits_dollars: number;
}

export function PlatformAiConfig() {
  const [config, setConfig] = useState<PlatformConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from('platform_ai_config' as any)
        .select('*')
        .limit(1)
        .single();
      if (error) {
        console.error('Failed to load platform config:', error);
      } else {
        setConfig(data as any);
      }
      setLoading(false);
    })();
  }, []);

  const updateField = (field: keyof PlatformConfig, value: number) => {
    if (!config) return;
    setConfig({ ...config, [field]: value });
    setDirty(true);
  };

  const save = async () => {
    if (!config) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('platform_ai_config' as any)
        .update({
          global_chat_rpm: config.global_chat_rpm,
          global_image_rpm: config.global_image_rpm,
          global_cost_estimate_rpm: config.global_cost_estimate_rpm,
          image_base_cost: config.image_base_cost,
          image_multiplier: config.image_multiplier,
          chat_base_cost: config.chat_base_cost,
          chat_multiplier: config.chat_multiplier,
          monthly_free_credits_dollars: config.monthly_free_credits_dollars,
        } as any)
        .eq('id', config.id);
      if (error) throw error;
      setDirty(false);
      toast({ title: 'Platform config saved' });
    } catch (err: any) {
      toast({ title: 'Error saving', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (!config) return null;

  const imageClientCharge = config.image_base_cost * config.image_multiplier;
  const chatClientCharge = config.chat_base_cost * config.chat_multiplier;

  return (
    <Card className="border-border">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            <div>
              <CardTitle className="text-lg">Platform AI Configuration</CardTitle>
              <CardDescription>Global RPM ceilings & AI pricing (base cost × multiplier = client charge)</CardDescription>
            </div>
          </div>
          <Button size="sm" onClick={save} disabled={!dirty || saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Save className="h-4 w-4 mr-1" />}
            Save
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Pricing Section */}
        <div>
          <h4 className="text-sm font-semibold mb-3 flex items-center gap-1.5">
            <DollarSign className="h-4 w-4" />
            AI Pricing (Base × Multiplier)
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Image Pricing */}
            <div className="rounded-lg border border-border p-4 space-y-3">
              <h5 className="text-sm font-semibold text-purple-500">Image Generation</h5>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Base Cost (API)</Label>
                  <div className="relative">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">$</span>
                    <Input
                      type="number"
                      step="0.01"
                      value={config.image_base_cost}
                      onChange={(e) => updateField('image_base_cost', Math.max(0, Number(e.target.value)))}
                      className="h-9 pl-6"
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Multiplier</Label>
                  <div className="relative">
                    <Input
                      type="number"
                      step="0.1"
                      min="1"
                      value={config.image_multiplier}
                      onChange={(e) => updateField('image_multiplier', Math.max(1, Number(e.target.value)))}
                      className="h-9 pr-6"
                    />
                    <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">×</span>
                  </div>
                </div>
              </div>
              <div className="rounded-md bg-primary/5 border border-primary/20 px-3 py-2 flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Client Charge</span>
                <div className="text-right">
                  <span className="font-mono font-bold text-sm">${imageClientCharge.toFixed(4)}</span>
                  <span className="text-[10px] text-muted-foreground ml-1">
                    ({dollarsToCredits(imageClientCharge).toLocaleString()} cr)
                  </span>
                </div>
              </div>
            </div>

            {/* Chat Pricing */}
            <div className="rounded-lg border border-border p-4 space-y-3">
              <h5 className="text-sm font-semibold text-blue-500">Chat / Cost Estimate</h5>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Base Cost (API)</Label>
                  <div className="relative">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">$</span>
                    <Input
                      type="number"
                      step="0.0001"
                      value={config.chat_base_cost}
                      onChange={(e) => updateField('chat_base_cost', Math.max(0, Number(e.target.value)))}
                      className="h-9 pl-6"
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Multiplier</Label>
                  <div className="relative">
                    <Input
                      type="number"
                      step="0.1"
                      min="1"
                      value={config.chat_multiplier}
                      onChange={(e) => updateField('chat_multiplier', Math.max(1, Number(e.target.value)))}
                      className="h-9 pr-6"
                    />
                    <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">×</span>
                  </div>
                </div>
              </div>
              <div className="rounded-md bg-primary/5 border border-primary/20 px-3 py-2 flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Client Charge</span>
                <div className="text-right">
                  <span className="font-mono font-bold text-sm">${chatClientCharge.toFixed(4)}</span>
                  <span className="text-[10px] text-muted-foreground ml-1">
                    ({dollarsToCredits(chatClientCharge).toLocaleString()} cr)
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Monthly Free Credits Section */}
        <div>
          <h4 className="text-sm font-semibold mb-3 flex items-center gap-1.5">
            <Gift className="h-4 w-4" />
            Monthly Free Credits (All Clients)
          </h4>
          <div className="rounded-lg border border-border p-4 space-y-3">
            <p className="text-xs text-muted-foreground">
              Free credits issued to <strong>every client</strong> on the 1st of each month. Previous month's unused free credits are wiped — they do not carry over. Purchased credits are never affected.
            </p>
            <div className="flex items-end gap-4">
              <div className="space-y-1 w-48">
                <Label className="text-xs text-muted-foreground">Monthly Free Credits</Label>
                <div className="relative">
                  <Input
                    type="number"
                    step="1000"
                    min="0"
                    value={Math.round(config.monthly_free_credits_dollars / CREDIT_RATE)}
                    onChange={(e) => {
                      const credits = Math.max(0, Number(e.target.value));
                      updateField('monthly_free_credits_dollars', credits * CREDIT_RATE);
                    }}
                    className="h-9 pr-10"
                  />
                  <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">cr</span>
                </div>
              </div>
              <div className="rounded-md bg-primary/5 border border-primary/20 px-3 py-2 flex items-center gap-2 h-9">
                <span className="text-xs text-muted-foreground">Value:</span>
                <span className="font-mono font-bold text-sm">${config.monthly_free_credits_dollars.toFixed(2)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Rate Limits Section */}
        <div>
          <h4 className="text-sm font-semibold mb-3 flex items-center gap-1.5">
            <Shield className="h-4 w-4" />
            Global Rate Limits (RPM)
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Global Chat RPM</Label>
              <Input
                type="number"
                value={config.global_chat_rpm}
                onChange={(e) => updateField('global_chat_rpm', Math.max(1, Number(e.target.value)))}
                className="h-9"
              />
              <p className="text-[10px] text-muted-foreground">Max chat requests/min platform-wide</p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Global Image RPM</Label>
              <Input
                type="number"
                value={config.global_image_rpm}
                onChange={(e) => updateField('global_image_rpm', Math.max(1, Number(e.target.value)))}
                className="h-9"
              />
              <p className="text-[10px] text-muted-foreground">Max image generations/min platform-wide</p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Global Cost Estimate RPM</Label>
              <Input
                type="number"
                value={config.global_cost_estimate_rpm}
                onChange={(e) => updateField('global_cost_estimate_rpm', Math.max(1, Number(e.target.value)))}
                className="h-9"
              />
              <p className="text-[10px] text-muted-foreground">Max cost estimate requests/min platform-wide</p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
