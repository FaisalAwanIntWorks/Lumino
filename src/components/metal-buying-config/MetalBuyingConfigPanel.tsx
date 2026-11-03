import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Save, Coins, Award, CircleDollarSign, Palette, Phone, Calendar, MessageSquare, Wand2 } from 'lucide-react';
import { toast } from 'sonner';
import type { MetalBuyingConfig, MetalsConfig, MetalKaratConfig, CtaConfig } from '@/hooks/useClientMetalBuyingConfig';
import { DEFAULT_VOLUME_TIER_CONFIG, type VolumeTierConfig } from '@/lib/metal-offer-tiers';

interface MetalBuyingConfigPanelProps {
  config: MetalBuyingConfig | null;
  defaultMetalsConfig: MetalsConfig;
  onSave: (updates: Partial<MetalBuyingConfig>) => void;
  isSaving: boolean;
}

const METAL_ICONS: Record<string, any> = {
  gold: Coins,
  silver: Award,
  platinum: CircleDollarSign,
};

/** Clients sometimes paste "tel:+1 555..." — strip the scheme so the widget link works. */
const stripDialScheme = (raw: string) =>
  raw.replace(/^\s*(tel|sms|callto|call)\s*:\s*/i, '');

/** Preview of the exact number that ends up in the tel:/sms: href. */
const toDialValue = (raw: string) =>
  stripDialScheme(raw).replace(/[^\d+]/g, '').replace(/(?!^)\+/g, '');

const METAL_LABELS: Record<string, string> = {
  gold: 'Gold',
  silver: 'Silver',
  platinum: 'Platinum',
};

export function MetalBuyingConfigPanel({ config, defaultMetalsConfig, onSave, isSaving }: MetalBuyingConfigPanelProps) {
  const [metalsConfig, setMetalsConfig] = useState<MetalsConfig>(
    config?.metals_config ?? defaultMetalsConfig
  );
  // Legacy top-level value kept for backward compat — mirrored from gold on save.
  const [refinerySellPct] = useState(config?.refinery_sell_pct ?? 99);
  const [dontKnowEnabled, setDontKnowEnabled] = useState(config?.dont_know_enabled ?? true);
  const [tierConfig, setTierConfig] = useState<VolumeTierConfig>(() => ({
    ...DEFAULT_VOLUME_TIER_CONFIG,
    ...((config?.volume_tier_config as VolumeTierConfig | null) ?? {}),
  }));
  const [ctaConfig, setCtaConfig] = useState<CtaConfig>(
    config?.cta_config ?? { book_url: '', call_number: '', text_number: '' }
  );
  const [formColors, setFormColors] = useState<Record<string, string>>(
    (config?.form_colors as Record<string, string>) ?? {}
  );
  const [bulkInputs, setBulkInputs] = useState<Record<string, { buy: string; competitor: string }>>({
    gold: { buy: '', competitor: '' },
    silver: { buy: '', competitor: '' },
    platinum: { buy: '', competitor: '' },
  });

  const applyBulkToEmpty = (metal: string) => {
    const inputs = bulkInputs[metal] ?? { buy: '', competitor: '' };
    const buyRaw = inputs.buy.trim();
    const compRaw = inputs.competitor.trim();
    const buyVal = buyRaw === '' ? null : Math.min(100, Math.max(0, parseFloat(buyRaw)));
    const compVal = compRaw === '' ? null : Math.min(100, Math.max(0, parseFloat(compRaw)));

    if ((buyVal === null || isNaN(buyVal as number)) && (compVal === null || isNaN(compVal as number))) {
      toast.info('Enter a Buy % or Competitor % first');
      return;
    }

    let filledCount = 0;
    setMetalsConfig((prev) => {
      const m = prev[metal as keyof MetalsConfig];
      const nextKarats: Record<string, MetalKaratConfig> = {};
      for (const [karat, cfg] of Object.entries(m.karats)) {
        let next = { ...cfg };
        let touched = false;
        const buyEmpty = !cfg.buy_pct || Number(cfg.buy_pct) === 0;
        const compEmpty = !cfg.competitor_pct || Number(cfg.competitor_pct) === 0;
        if (buyVal !== null && !isNaN(buyVal as number) && buyEmpty) {
          next.buy_pct = buyVal as number;
          touched = true;
        }
        if (compVal !== null && !isNaN(compVal as number) && compEmpty) {
          next.competitor_pct = compVal as number;
          touched = true;
        }
        if (touched) filledCount++;
        nextKarats[karat] = next;
      }
      return { ...prev, [metal]: { ...m, karats: nextKarats } };
    });

    if (filledCount === 0) {
      toast.info('No empty karats to fill — existing values preserved');
    } else {
      toast.success(`Applied to ${filledCount} karat${filledCount === 1 ? '' : 's'}`);
      setBulkInputs((prev) => ({ ...prev, [metal]: { buy: '', competitor: '' } }));
    }
  };


  const updateKarat = (metal: string, karat: string, field: keyof MetalKaratConfig, value: number | string) => {
    setMetalsConfig((prev) => ({
      ...prev,
      [metal]: {
        ...prev[metal as keyof MetalsConfig],
        karats: {
          ...prev[metal as keyof MetalsConfig].karats,
          [karat]: {
            ...prev[metal as keyof MetalsConfig].karats[karat],
            [field]: value,
          },
        },
      },
    }));
  };

  const commitKarat = (metal: string, karat: string, field: keyof MetalKaratConfig) => {
    setMetalsConfig((prev) => {
      const raw = prev[metal as keyof MetalsConfig].karats[karat][field];
      const parsed = typeof raw === 'string' ? parseFloat(raw) : raw;
      const clamped = Math.min(100, Math.max(0, isNaN(parsed) ? 0 : parsed));
      return {
        ...prev,
        [metal]: {
          ...prev[metal as keyof MetalsConfig],
          karats: {
            ...prev[metal as keyof MetalsConfig].karats,
            [karat]: {
              ...prev[metal as keyof MetalsConfig].karats[karat],
              [field]: clamped,
            },
          },
        },
      };
    });
  };

  const updateMetalRefinery = (metal: string, value: number) => {
    const clamped = Math.min(100, Math.max(75, isNaN(value) ? 95 : value));
    setMetalsConfig((prev) => ({
      ...prev,
      [metal]: {
        ...prev[metal as keyof MetalsConfig],
        refinery_sell_pct: clamped,
      },
    }));
  };

  const toggleMetal = (metal: string, enabled: boolean) => {
    setMetalsConfig((prev) => ({
      ...prev,
      [metal]: {
        ...prev[metal as keyof MetalsConfig],
        enabled,
      },
    }));
  };

  const handleSave = () => {
    // Mirror gold's per-metal refinery rate into the legacy top-level column so
    // any older code path still reading `refinery_sell_pct` stays consistent.
    const legacyMirror = Number(metalsConfig.gold?.refinery_sell_pct ?? refinerySellPct);
    const tiers = [...tierConfig.tiers]
      .map((t) => ({ min_grams: Math.max(0, Number(t.min_grams) || 0), bonus_pct: Math.min(50, Math.max(0, Number(t.bonus_pct) || 0)) }))
      .sort((a, b) => a.min_grams - b.min_grams);
    onSave({
      metals_config: metalsConfig,
      refinery_sell_pct: legacyMirror,
      dont_know_enabled: dontKnowEnabled,
      onboarding_completed: true,
      cta_config: ctaConfig,
      form_colors: formColors,
      volume_tier_config: {
        ...tierConfig,
        tiers,
        bullion_24k_pct: Math.min(100, Math.max(0, Number(tierConfig.bullion_24k_pct) || 0)),
        bullion_24k_min_oz: Math.max(0.1, Number(tierConfig.bullion_24k_min_oz) || 5),
      },
    });
  };

  const goldRefinery = Number(metalsConfig.gold?.refinery_sell_pct ?? 99);
  const updateTier = (i: number, field: 'min_grams' | 'bonus_pct', v: string) =>
    setTierConfig((p) => ({ ...p, tiers: p.tiers.map((t, idx) => (idx === i ? { ...t, [field]: v as any } : t)) }));

  return (
    <div className="space-y-6 overflow-y-auto max-h-[calc(100vh-120px)] pr-2">
      {/* Volume tiers */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Volume Bonus</CardTitle>
            <Switch checked={tierConfig.enabled} onCheckedChange={(v) => setTierConfig((p) => ({ ...p, enabled: v }))} />
          </div>
          <p className="text-xs text-muted-foreground">
            Pay a higher rate for larger submissions. The total weight of every piece the customer adds decides the bonus, and it applies to all pieces. Off = your normal rates only.
          </p>
        </CardHeader>
        {tierConfig.enabled && (
          <CardContent className="space-y-4">
            <div className="space-y-2">
              {tierConfig.tiers.map((t, i) => (
                <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-3 items-end">
                  <div>
                    <Label className="text-xs text-muted-foreground">From total grams</Label>
                    <Input type="number" min={0} value={t.min_grams} disabled={i === 0}
                      onChange={(e) => updateTier(i, 'min_grams', e.target.value)} className="h-9 text-sm" />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Bonus (+% points)</Label>
                    <Input type="number" min={0} max={50} step={0.5} value={t.bonus_pct}
                      onChange={(e) => updateTier(i, 'bonus_pct', e.target.value)} className="h-9 text-sm" />
                  </div>
                  <Button type="button" variant="ghost" size="sm" className="h-9" disabled={i === 0}
                    onClick={() => setTierConfig((p) => ({ ...p, tiers: p.tiers.filter((_, idx) => idx !== i) }))}>Remove</Button>
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" className="w-full h-8"
                onClick={() => setTierConfig((p) => ({ ...p, tiers: [...p.tiers, { min_grams: (p.tiers[p.tiers.length - 1]?.min_grams ?? 0) + 100, bonus_pct: 0 }] }))}>
                Add tier
              </Button>
            </div>
            <div className="rounded-md bg-muted/30 border border-border/40 p-3 grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Label className="text-xs font-medium text-foreground">24K bullion rate</Label>
                <p className="text-[10px] text-muted-foreground leading-tight">Flat rate for 24K gold when the customer's 24K total is over the ounce limit. Set 0 to turn off.</p>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Rate (%)</Label>
                <Input type="number" min={0} max={100} step={0.5} value={tierConfig.bullion_24k_pct ?? 0}
                  onChange={(e) => setTierConfig((p) => ({ ...p, bullion_24k_pct: e.target.value as any }))} className="h-9 text-sm" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Over (troy oz)</Label>
                <Input type="number" min={0.1} step={0.5} value={tierConfig.bullion_24k_min_oz ?? 5}
                  onChange={(e) => setTierConfig((p) => ({ ...p, bullion_24k_min_oz: e.target.value as any }))} className="h-9 text-sm" />
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Safety: a bonus can never push a rate above that metal's refinery sell rate (gold currently {goldRefinery}%).
              {Number(tierConfig.bullion_24k_pct) > goldRefinery && ' Your 24K bullion rate is above your gold refinery rate, so it will be held at the refinery rate.'}
            </p>
          </CardContent>
        )}
      </Card>

      {/* Metals, Buy Rates & Per-Metal Refinery Sell % */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Metals & Buy Rates</CardTitle>
        </CardHeader>
        <CardContent>
          <Accordion type="multiple" defaultValue={['gold', 'silver', 'platinum']} className="space-y-2">
            {Object.entries(metalsConfig).map(([metal, metalCfg]) => {
              const Icon = METAL_ICONS[metal] || Coins;
              const label = METAL_LABELS[metal] || metal;
              const refineryPct = Number(metalCfg.refinery_sell_pct ?? (metal === 'gold' ? 99 : metal === 'silver' ? 92 : 95));

              return (
                <AccordionItem key={metal} value={metal} className="border rounded-lg px-3">
                  <AccordionTrigger className="py-3 hover:no-underline">
                    <div className="flex items-center gap-3">
                      <Icon className="w-4 h-4 text-primary" />
                      <span className="font-medium">{label}</span>
                      <Switch
                        checked={metalCfg.enabled}
                        onCheckedChange={(v) => toggleMetal(metal, v)}
                        onClick={(e) => e.stopPropagation()}
                      />
                    </div>
                  </AccordionTrigger>
                  {metalCfg.enabled && (
                    <AccordionContent className="pb-4">
                      <div className="space-y-4">
                        {/* Per-metal refinery sell rate */}
                        <div className="rounded-md bg-muted/30 border border-border/40 p-3">
                          <div className="flex items-center justify-between mb-1">
                            <Label className="text-xs font-medium text-foreground">Refinery Sell Rate (%)</Label>
                            <span className="font-mono text-sm font-medium">{refineryPct}%</span>
                          </div>
                          <p className="text-[10px] text-muted-foreground mb-2 leading-tight">
                            What your refinery pays you for pure {label.toLowerCase()}. Affects your estimated profit only — does not change the customer's quoted offer.
                          </p>
                          <Slider
                            value={[refineryPct]}
                            onValueChange={([v]) => updateMetalRefinery(metal, v)}
                            min={75} max={100} step={0.5}
                          />
                        </div>

                        <div className="rounded-md bg-muted/30 border border-border/40 p-3 space-y-2">
                          <div className="grid grid-cols-3 gap-3 items-end">
                            <div>
                              <Label className="text-xs font-medium text-foreground">Bulk set</Label>
                              <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight">
                                Apply to empty karats only
                              </p>
                            </div>
                            <div>
                              <Label className="text-xs text-muted-foreground">Our Buy %</Label>
                              <Input
                                type="number"
                                value={bulkInputs[metal]?.buy ?? ''}
                                onChange={(e) => setBulkInputs((prev) => ({ ...prev, [metal]: { ...(prev[metal] ?? { buy: '', competitor: '' }), buy: e.target.value } }))}
                                placeholder="—"
                                min={0}
                                max={100}
                                className="h-9 text-sm"
                              />
                            </div>
                            <div>
                              <Label className="text-xs text-muted-foreground">Competitor %</Label>
                              <Input
                                type="number"
                                value={bulkInputs[metal]?.competitor ?? ''}
                                onChange={(e) => setBulkInputs((prev) => ({ ...prev, [metal]: { ...(prev[metal] ?? { buy: '', competitor: '' }), competitor: e.target.value } }))}
                                placeholder="—"
                                min={0}
                                max={100}
                                className="h-9 text-sm"
                              />
                            </div>
                          </div>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => applyBulkToEmpty(metal)}
                            className="w-full gap-1.5 h-8"
                          >
                            <Wand2 className="w-3.5 h-3.5" />
                            Apply to empty karats
                          </Button>
                        </div>
                        {Object.entries(metalCfg.karats).map(([karat, cfg]: [string, MetalKaratConfig]) => (
                          <div key={karat} className="grid grid-cols-3 gap-3 items-end border-b border-border/30 pb-3 last:border-0 last:pb-0">
                            <div>
                              <Label className="text-xs text-muted-foreground">{karat}</Label>
                            </div>
                            <div>
                              <Label className="text-xs text-muted-foreground">Our Buy %</Label>
                              <Input
                                type="number"
                                value={cfg.buy_pct}
                                onChange={(e) => updateKarat(metal, karat, 'buy_pct', e.target.value)}
                                onBlur={() => commitKarat(metal, karat, 'buy_pct')}
                                min={0} max={100}
                                className="h-9 text-sm"
                              />
                            </div>
                            <div>
                              <Label className="text-xs text-muted-foreground">Competitor %</Label>
                              <Input
                                type="number"
                                value={cfg.competitor_pct}
                                onChange={(e) => updateKarat(metal, karat, 'competitor_pct', e.target.value)}
                                onBlur={() => commitKarat(metal, karat, 'competitor_pct')}
                                min={0} max={100}
                                className="h-9 text-sm"
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    </AccordionContent>
                  )}
                </AccordionItem>
              );
            })}
          </Accordion>
        </CardContent>
      </Card>

      {/* CTA Configuration */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Phone className="w-4 h-4" /> Call-to-Action Options
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-xs text-muted-foreground">
            These CTAs appear on the "Visit Us" screen when a customer can't provide full details, and on the thank-you page.
          </p>
          <div className="space-y-3">
            <div>
              <Label className="text-sm flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5" /> Book Appointment URL
              </Label>
              <Input
                value={ctaConfig.book_url}
                onChange={(e) => setCtaConfig(prev => ({ ...prev, book_url: e.target.value }))}
                placeholder="https://calendly.com/your-store"
                className="mt-1"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Leave empty to use the built-in appointment form instead
              </p>
            </div>
            <div>
              <Label className="text-sm flex items-center gap-1.5">
                <Phone className="w-3.5 h-3.5" /> Call Number
              </Label>
              <Input
                value={ctaConfig.call_number}
                onChange={(e) => setCtaConfig(prev => ({ ...prev, call_number: stripDialScheme(e.target.value) }))}
                placeholder="+1 (555) 123-4567"
                className="mt-1"
              />
              <p className="text-xs text-muted-foreground mt-1">
                {ctaConfig.call_number
                  ? `Link generated: tel:${toDialValue(ctaConfig.call_number)}`
                  : 'Enter digits only — do not include "tel:"'}
              </p>
            </div>
            <div>
              <Label className="text-sm flex items-center gap-1.5">
                <MessageSquare className="w-3.5 h-3.5" /> Text Number
              </Label>
              <Input
                value={ctaConfig.text_number}
                onChange={(e) => setCtaConfig(prev => ({ ...prev, text_number: stripDialScheme(e.target.value) }))}
                placeholder="+1 (555) 123-4567"
                className="mt-1"
              />
              <p className="text-xs text-muted-foreground mt-1">
                {ctaConfig.text_number
                  ? `Link generated: sms:${toDialValue(ctaConfig.text_number)}`
                  : 'Enter digits only — do not include "sms:"'}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Branding */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Palette className="w-4 h-4" /> Form Branding
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label className="text-xs text-muted-foreground">Accent Color</Label>
              <div className="flex items-center gap-2 mt-1">
                <input
                  type="color"
                  value={formColors.tabBorder || '#d4af37'}
                  onChange={(e) => setFormColors(prev => ({ ...prev, tabBorder: e.target.value }))}
                  className="w-8 h-8 rounded cursor-pointer border border-border"
                />
                <Input
                  value={formColors.tabBorder || '#d4af37'}
                  onChange={(e) => setFormColors(prev => ({ ...prev, tabBorder: e.target.value }))}
                  className="h-8 text-xs font-mono"
                />
              </div>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Background</Label>
              <div className="flex items-center gap-2 mt-1">
                <input
                  type="color"
                  value={formColors.background || '#0a0a0a'}
                  onChange={(e) => setFormColors(prev => ({ ...prev, background: e.target.value }))}
                  className="w-8 h-8 rounded cursor-pointer border border-border"
                />
                <Input
                  value={formColors.background || '#0a0a0a'}
                  onChange={(e) => setFormColors(prev => ({ ...prev, background: e.target.value }))}
                  className="h-8 text-xs font-mono"
                />
              </div>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Font Color</Label>
              <div className="flex items-center gap-2 mt-1">
                <input
                  type="color"
                  value={formColors.fontColor || '#ffffff'}
                  onChange={(e) => setFormColors(prev => ({ ...prev, fontColor: e.target.value }))}
                  className="w-8 h-8 rounded cursor-pointer border border-border"
                />
                <Input
                  value={formColors.fontColor || '#ffffff'}
                  onChange={(e) => setFormColors(prev => ({ ...prev, fontColor: e.target.value }))}
                  className="h-8 text-xs font-mono"
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Settings */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Form Settings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm">Allow "I don't know" answers</Label>
              <p className="text-xs text-muted-foreground">Let customers skip karat, weight, or authenticity questions</p>
            </div>
            <Switch checked={dontKnowEnabled} onCheckedChange={setDontKnowEnabled} />
          </div>
        </CardContent>
      </Card>

      {/* Save */}
      <Button onClick={handleSave} disabled={isSaving} className="w-full gap-2">
        <Save className="w-4 h-4" />
        {isSaving ? 'Saving...' : 'Save Configuration'}
      </Button>
    </div>
  );
}
