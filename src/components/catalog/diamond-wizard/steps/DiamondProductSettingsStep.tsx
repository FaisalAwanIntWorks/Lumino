import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { DiamondWizardState } from '../types';
import { TITLE_TOKENS, SKU_TOKENS } from '../defaults';
import { generateTitleFromTemplate } from '../utils';

interface Props {
  state: DiamondWizardState;
  onChange: (state: DiamondWizardState) => void;
}

export function DiamondProductSettingsStep({ state, onChange }: Props) {
  const { productSettings } = state;

  const updateSettings = (partial: Partial<typeof productSettings>) => {
    onChange({ ...state, productSettings: { ...productSettings, ...partial } });
  };

  const updateCollections = (partial: Partial<typeof productSettings.collections>) => {
    updateSettings({ collections: { ...productSettings.collections, ...partial } });
  };

  const insertToken = (field: 'titleTemplate' | 'skuTemplate', token: string) => {
    const current = productSettings[field];
    updateSettings({ [field]: current + token });
  };

  // Sample values for preview
  const sampleValues = {
    carat: '1.52',
    shape: 'Round',
    color: 'D',
    clarity: 'VVS1',
    cut: 'Excellent',
    origin: 'Natural',
    lab: 'GIA',
    report_number: '12345678',
  };

  const titlePreview = generateTitleFromTemplate(productSettings.titleTemplate, sampleValues);
  const skuPreview = generateTitleFromTemplate(productSettings.skuTemplate, {
    ...sampleValues,
    shape: 'ROUND',
    color: 'D',
    clarity: 'VVS1',
    carat: '1.52',
  });

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold">How should diamonds appear in your store?</h3>
        <p className="text-sm text-muted-foreground">Configure product titles, SKUs, and collection rules.</p>
      </div>

      {/* 5A: Product Title Template */}
      <div className="space-y-2">
        <Label className="text-sm font-semibold">Product Title Template</Label>
        <div className="flex flex-wrap gap-1 mb-2">
          {TITLE_TOKENS.map(token => (
            <button
              key={token}
              onClick={() => insertToken('titleTemplate', token)}
              className="px-2 py-0.5 text-[10px] rounded bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 transition-colors"
            >
              {token}
            </button>
          ))}
        </div>
        <Input
          value={productSettings.titleTemplate}
          onChange={(e) => updateSettings({ titleTemplate: e.target.value })}
          placeholder="{carat}ct {shape} Diamond - {color}/{clarity}"
        />
        <Card className="bg-muted/30">
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground mb-1">Preview:</p>
            <p className="text-sm font-medium">{titlePreview}</p>
          </CardContent>
        </Card>
      </div>

      <Separator />

      {/* 5B: SKU Format */}
      <div className="space-y-2">
        <Label className="text-sm font-semibold">SKU Format</Label>
        <div className="flex flex-wrap gap-1 mb-2">
          {SKU_TOKENS.map(token => (
            <button
              key={token}
              onClick={() => insertToken('skuTemplate', token)}
              className="px-2 py-0.5 text-[10px] rounded bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 transition-colors"
            >
              {token}
            </button>
          ))}
        </div>
        <Input
          value={productSettings.skuTemplate}
          onChange={(e) => updateSettings({ skuTemplate: e.target.value })}
          placeholder="DIA-{shape}-{color}-{clarity}-{carat}"
        />
        <Card className="bg-muted/30">
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground mb-1">Preview:</p>
            <p className="text-sm font-mono">{skuPreview}</p>
          </CardContent>
        </Card>
      </div>

      <Separator />

      {/* 5C: Auto-Create Collections */}
      <div className="space-y-3">
        <Label className="text-sm font-semibold">Auto-Create Collections</Label>
        <div className="space-y-2">
          {[
            { key: 'allDiamonds' as const, label: '"All Diamonds" master collection', desc: 'Groups all diamonds together' },
            { key: 'perShape' as const, label: 'Per-Shape', desc: 'e.g., "Round Diamonds", "Oval Diamonds"' },
            { key: 'perOrigin' as const, label: 'Per-Origin', desc: 'e.g., "Natural Diamonds", "Lab-Grown Diamonds"' },
            { key: 'perCaratRange' as const, label: 'Per-Carat Range', desc: 'e.g., "Under 1ct", "1-2ct", "2ct+"' },
            
          ].map(opt => (
            <div key={opt.key} className="flex items-center justify-between p-3 rounded-lg border bg-card">
              <div>
                <span className="text-sm font-medium">{opt.label}</span>
                <p className="text-xs text-muted-foreground">{opt.desc}</p>
              </div>
              <Switch
                checked={productSettings.collections[opt.key]}
                onCheckedChange={(v) => updateCollections({ [opt.key]: v })}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
