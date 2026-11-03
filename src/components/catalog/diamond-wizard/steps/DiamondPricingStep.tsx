import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Info, RotateCcw } from "lucide-react";
import type { DiamondWizardState, MarkupTier } from '../types';
import { CURRENCIES, STANDARD_CARAT_RANGES } from '../defaults';
import {
  CLARITY_MULTIPLIERS_NATURAL,
  CLARITY_MULTIPLIERS_LAB,
  COLOR_MULTIPLIERS_NATURAL,
  COLOR_MULTIPLIERS_LAB,
  SHAPE_DISCOUNTS,
  WHOLESALE_ANCHORS_NATURAL,
  WHOLESALE_ANCHORS_LAB,
} from '../cheat-sheet';
import { getCurrencySymbol, formatPrice } from '../utils';
import { useMemo, useEffect } from 'react';


interface Props {
  state: DiamondWizardState;
  onChange: (state: DiamondWizardState) => void;
  clientId?: string;
}

function makeId() {
  return Math.random().toString(36).substr(2, 9);
}

function InfoTip({ text }: { text: string }) {
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Info className="w-3.5 h-3.5 text-muted-foreground hover:text-primary cursor-help inline ml-1" />
        </TooltipTrigger>
        <TooltipContent className="max-w-[250px] text-xs">{text}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// Wholesale anchors come from the Ring OS Master Cheat Sheet (G/VS2 baseline).
function getAnchorPrice(caratFrom: number, isLab: boolean): number {
  const anchors = isLab ? WHOLESALE_ANCHORS_LAB : WHOLESALE_ANCHORS_NATURAL;
  if (anchors[caratFrom] != null) return anchors[caratFrom];
  // Fallback: use the largest anchor available
  const keys = Object.keys(anchors).map(Number).sort((a, b) => a - b);
  return anchors[keys[keys.length - 1]] ?? 0;
}

/** Build locked tiers from selected standard ranges, preserving existing markup/cost */
function buildLockedTiers(
  caratRange: [number, number],
  existingTiers: MarkupTier[],
  defaultMarkups: number[],
  defaultAnchors: Record<number, number>,
): MarkupTier[] {
  const activeRanges = STANDARD_CARAT_RANGES.filter(
    r => r.min >= caratRange[0] && r.max <= caratRange[1]
  );
  return activeRanges.map((range, idx) => {
    const existing = existingTiers.find(t => Math.abs(t.caratFrom - range.min) < 0.01);
    return {
      id: existing?.id ?? makeId(),
      caratFrom: range.min,
      caratTo: range.max,
      markup: existing?.markup ?? (defaultMarkups[idx] ?? 15),
      purchasingPrice: existing?.purchasingPrice ?? (defaultAnchors[range.min] ?? 0),
    };
  });
}

function MarkupTierTable({ tiers, onChange, currency, label, isLab }: {
  tiers: MarkupTier[];
  onChange: (tiers: MarkupTier[]) => void;
  currency: string;
  label: string;
  isLab: boolean;
}) {
  const symbol = getCurrencySymbol(currency);

  const updateTier = (id: string, field: keyof MarkupTier, value: any) => {
    onChange(tiers.map(t => t.id === id ? { ...t, [field]: value } : t));
  };

  const resetAllAnchors = () => {
    onChange(tiers.map(t => ({
      ...t,
      purchasingPrice: getAnchorPrice(t.caratFrom, isLab),
    })));
  };

  return (
    <div className="space-y-2">
      <Label className="text-sm font-semibold">{label}</Label>
      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-muted/50">
              <th className="text-left p-2 font-medium">Carat Range</th>
              <th className="text-left p-2 font-medium">Markup %</th>
            </tr>
          </thead>
          <tbody>
            {tiers.map((tier) => (
              <tr key={tier.id} className="border-t">
                <td className="p-2 font-medium text-foreground whitespace-nowrap">
                  {tier.caratFrom.toFixed(2)} – {(tier.caratTo ?? 5.00).toFixed(2)} ct
                </td>
                <td className="p-2">
                  <div className="flex items-center gap-1">
                    <Input
                      type="number"
                      value={tier.markup}
                      onChange={(e) => updateTier(tier.id, 'markup', e.target.value === '' ? '' : parseFloat(e.target.value))}
                      onBlur={(e) => updateTier(tier.id, 'markup', e.target.value === '' ? 0 : (parseFloat(e.target.value) || 0))}
                      className="w-16 h-7 text-xs"
                    />
                    <span className="text-muted-foreground">%</span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const NATURAL_DEFAULT_MARKUPS = [110, 90, 75, 60, 50, 40, 35, 35, 35];
const LAB_DEFAULT_MARKUPS = [220, 175, 140, 110, 95, 85, 80, 80, 80];

function MultiplierTable({
  title, rowKeys, showNatural, showLab,
  naturalValues, labValues, naturalDefaults, labDefaults,
  onChangeNatural, onChangeLab,
}: {
  title: string;
  rowKeys: string[];
  showNatural: boolean;
  showLab: boolean;
  naturalValues: Record<string, number>;
  labValues: Record<string, number>;
  naturalDefaults: Record<string, number>;
  labDefaults: Record<string, number>;
  onChangeNatural: (v: Record<string, number>) => void;
  onChangeLab: (v: Record<string, number>) => void;
}) {
  const setVal = (which: 'nat' | 'lab', key: string, raw: string) => {
    const num = raw === '' ? 0 : parseFloat(raw);
    if (which === 'nat') onChangeNatural({ ...naturalValues, [key]: isNaN(num) ? 0 : num });
    else onChangeLab({ ...labValues, [key]: isNaN(num) ? 0 : num });
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          Editable. Click reset to restore Ring OS Master Cheat Sheet defaults.
        </span>
        <div className="flex gap-2">
          {showNatural && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onChangeNatural({ ...naturalDefaults })}
              className="h-7 text-xs gap-1"
            >
              <RotateCcw className="w-3 h-3" /> Reset Natural
            </Button>
          )}
          {showLab && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onChangeLab({ ...labDefaults })}
              className="h-7 text-xs gap-1"
            >
              <RotateCcw className="w-3 h-3" /> Reset Lab
            </Button>
          )}
        </div>
      </div>
      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-muted/50">
              <th className="text-left p-2 font-medium">{title}</th>
              {showNatural && <th className="text-left p-2 font-medium">Natural ×</th>}
              {showLab && <th className="text-left p-2 font-medium">Lab ×</th>}
            </tr>
          </thead>
          <tbody>
            {rowKeys.map((k) => (
              <tr key={k} className="border-t">
                <td className="p-2 font-medium">{k}</td>
                {showNatural && (
                  <td className="p-2">
                    <Input
                      type="number"
                      step="0.01"
                      value={naturalValues[k] ?? ''}
                      onChange={(e) => setVal('nat', k, e.target.value)}
                      className="w-20 h-7 text-xs"
                    />
                  </td>
                )}
                {showLab && (
                  <td className="p-2">
                    <Input
                      type="number"
                      step="0.01"
                      value={labValues[k] ?? ''}
                      onChange={(e) => setVal('lab', k, e.target.value)}
                      className="w-20 h-7 text-xs"
                    />
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ShapeDiscountTable({
  values, defaults, onChange,
}: {
  values: Record<string, number>;
  defaults: Record<string, number>;
  onChange: (v: Record<string, number>) => void;
}) {
  const shapes = Object.keys(defaults);
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          Shared across natural & lab. Round = 1.00 baseline.
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onChange({ ...defaults })}
          className="h-7 text-xs gap-1"
        >
          <RotateCcw className="w-3 h-3" /> Reset Defaults
        </Button>
      </div>
      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-muted/50">
              <th className="text-left p-2 font-medium">Shape</th>
              <th className="text-left p-2 font-medium">Multiplier</th>
            </tr>
          </thead>
          <tbody>
            {shapes.map((s) => (
              <tr key={s} className="border-t">
                <td className="p-2 font-medium capitalize">{s}</td>
                <td className="p-2">
                  <Input
                    type="number"
                    step="0.01"
                    value={values[s] ?? ''}
                    onChange={(e) => {
                      const num = e.target.value === '' ? 0 : parseFloat(e.target.value);
                      onChange({ ...values, [s]: isNaN(num) ? 0 : num });
                    }}
                    className="w-20 h-7 text-xs"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}


export function DiamondPricingStep({ state, onChange }: Props) {
  const { pricing, diamondType, grading } = state;

  const updatePricing = (partial: Partial<typeof pricing>) => {
    onChange({ ...state, pricing: { ...pricing, ...partial } });
  };

  // Auto-sync tiers to selected carat ranges
  const naturalTiers = useMemo(
    () => buildLockedTiers(grading.caratRange as [number, number], pricing.naturalMarkupTiers, NATURAL_DEFAULT_MARKUPS, WHOLESALE_ANCHORS_NATURAL),
    [grading.caratRange, pricing.naturalMarkupTiers]
  );

  const labTiers = useMemo(
    () => buildLockedTiers(grading.caratRange as [number, number], pricing.labMarkupTiers, LAB_DEFAULT_MARKUPS, WHOLESALE_ANCHORS_LAB),
    [grading.caratRange, pricing.labMarkupTiers]
  );

  // Persist auto-built tiers into state so the edge function receives them even if the user never edits.
  useEffect(() => {
    const sameNat = naturalTiers.length === pricing.naturalMarkupTiers.length &&
      naturalTiers.every((t, i) => {
        const e = pricing.naturalMarkupTiers[i];
        return e && Math.abs(e.caratFrom - t.caratFrom) < 0.01 && e.caratTo === t.caratTo &&
          e.markup === t.markup && e.purchasingPrice === t.purchasingPrice;
      });
    const sameLab = labTiers.length === pricing.labMarkupTiers.length &&
      labTiers.every((t, i) => {
        const e = pricing.labMarkupTiers[i];
        return e && Math.abs(e.caratFrom - t.caratFrom) < 0.01 && e.caratTo === t.caratTo &&
          e.markup === t.markup && e.purchasingPrice === t.purchasingPrice;
      });
    if (!sameNat || !sameLab) {
      const partial: Partial<typeof pricing> = {};
      if (!sameNat) partial.naturalMarkupTiers = naturalTiers;
      if (!sameLab) partial.labMarkupTiers = labTiers;
      updatePricing(partial);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [naturalTiers, labTiers]);

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold">Diamond Pricing</h3>
        <p className="text-sm text-muted-foreground">
          Pre-loaded with Ring OS Master Pricing Cheat Sheet defaults (May 2026). All values are fully editable below.
        </p>
      </div>

      {/* Currency */}
      <div className="space-y-2">
        <Label className="text-sm font-semibold">Currency <InfoTip text="The currency used for diamond pricing and display on your store." /></Label>
        <Select value={pricing.currency} onValueChange={(v) => updatePricing({ currency: v })}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CURRENCIES.map(c => (
              <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Separator />

      {/* Markup Tiers */}
      <div className="space-y-4">
        <p className="text-xs text-muted-foreground">Tiers are automatically set based on your selected carat ranges from the Grading step.</p>
        <div className="flex items-start gap-2 p-3 rounded-lg bg-primary/5 border border-primary/20">
          <Info className="w-4 h-4 text-primary mt-0.5 shrink-0" />
          <p className="text-xs text-muted-foreground">
            <span className="font-medium text-foreground">Ring OS pricing formula:</span>{' '}
            Wholesale anchor (G/VS2 baseline) × Clarity × Color × Shape × (1 + Markup%) → rounded.
            Defaults pre-loaded from the Ring OS Master Pricing Cheat Sheet (May 2026). Edit any value below.
          </p>
        </div>
        {diamondType.naturalEnabled && (
          <MarkupTierTable
            tiers={naturalTiers}
            onChange={(tiers) => updatePricing({ naturalMarkupTiers: tiers })}
            currency={pricing.currency}
            label="Natural Diamond Wholesale Anchors & Markups"
            isLab={false}
          />
        )}
        {diamondType.labGrownEnabled && (
          <MarkupTierTable
            tiers={labTiers}
            onChange={(tiers) => updatePricing({ labMarkupTiers: tiers })}
            currency={pricing.currency}
            label="Lab-Grown Diamond Wholesale Anchors & Markups"
            isLab={true}
          />
        )}
      </div>


    </div>
  );
}
