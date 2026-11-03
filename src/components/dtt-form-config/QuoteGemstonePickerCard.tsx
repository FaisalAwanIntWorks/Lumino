import { useQuery } from '@tanstack/react-query';
import { Sparkles } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { supabase } from '@/integrations/supabase/client';
import {
  QUOTE_GEMSTONE_PAGE_SIZES,
  QUOTE_GEMSTONE_PICKER_DEFAULTS,
  resolveQuoteGemstonePickerConfig,
  type QuoteGemstonePickerConfig,
  type QuoteGemstoneSort,
} from '@/lib/quote-estimator-gemstones';
import { QUOTE_GEMSTONES, findQuoteGemstone } from '@/lib/quote-v3-gemstones';

interface Props {
  value: QuoteGemstonePickerConfig | undefined;
  onChange: (next: QuoteGemstonePickerConfig) => void;
}

interface GemTypeRow { gem_key: string; gem_type: string; stone_count: number }

/**
 * V3 "Gemstone picker" settings (saved into `form_content.gemstonePicker`
 * with "Save Configuration"): whether the stone list opens after the gemstone
 * card, how many cards a page starts with, the price order and the markup on
 * gemstone-pool prices. Stock comes from Admin -> Gemstone Pool.
 */
export function QuoteGemstonePickerCard({ value, onChange }: Props) {
  const resolved = resolveQuoteGemstonePickerConfig({ gemstonePicker: value });
  const patch = (p: Partial<QuoteGemstonePickerConfig>) => onChange({ ...(value || {}), ...p });
  const { data: stock } = useQuery<GemTypeRow[]>({
    queryKey: ['gemstone-pool-gem-types'],
    staleTime: 1000 * 60 * 5,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_gemstone_pool_gem_types');
      if (error) throw error;
      return ((data ?? []) as GemTypeRow[]).map(r => ({ ...r, stone_count: Number(r.stone_count) }));
    },
  });
  const stocked = (stock ?? []).filter(r => findQuoteGemstone(r.gem_key));
  const totalStones = stocked.reduce((n, r) => n + r.stone_count, 0);

  return (
    <Card className="p-6 space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold text-foreground flex items-center gap-2"><Sparkles className="h-4 w-4" /> Gemstone picker</h3>
          <p className="text-xs text-muted-foreground">
            After the "Pick your gemstone" card, the customer sees that gemstone's real stones from the JewlX gemstone pool as product cards
            (picture, carat, colour, cut, origin, treatment, lab, measurements, price), sorted by price with a per-page choice and pages. The
            picked stone's details and price go into the quote, the lead and both emails. Saved with "Save Configuration".
          </p>
        </div>
        <Switch checked={resolved.enabled} onCheckedChange={v => patch({ enabled: v })} aria-label="Enable gemstone picker" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="space-y-1.5">
          <Label className="text-sm">Gemstones per page</Label>
          <select
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={resolved.pageSize}
            onChange={e => patch({ pageSize: Number(e.target.value) })}
          >
            {Array.from(new Set([...QUOTE_GEMSTONE_PAGE_SIZES, resolved.pageSize])).sort((a, b) => a - b).map(n => <option key={n} value={n}>{n}</option>)}
          </select>
          <p className="text-[11px] text-muted-foreground">Opening page size. The customer can switch to {QUOTE_GEMSTONE_PAGE_SIZES.join(' / ')}. Default {QUOTE_GEMSTONE_PICKER_DEFAULTS.pageSize}.</p>
        </div>
        <div className="space-y-1.5">
          <Label className="text-sm">Opening price order</Label>
          <select
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={resolved.defaultSort}
            onChange={e => patch({ defaultSort: e.target.value as QuoteGemstoneSort })}
          >
            <option value="low_to_high">Low to high</option>
            <option value="high_to_low">High to low</option>
          </select>
          <p className="text-[11px] text-muted-foreground">The customer can flip the order on the list.</p>
        </div>
        <div className="space-y-1.5">
          <Label className="text-sm">Markup (%)</Label>
          <Input
            type="number"
            min={0}
            max={500}
            step="0.5"
            value={value?.markupPercent ?? 0}
            onChange={e => patch({ markupPercent: e.target.value === '' ? undefined : Math.max(0, Number(e.target.value) || 0) })}
          />
          <p className="text-[11px] text-muted-foreground">Displayed price = pool price × (1 + markup ÷ 100). Pool prices are USD.</p>
        </div>
      </div>

      <div className="rounded-md border border-border bg-muted/30 p-3 text-xs text-muted-foreground space-y-1">
        <p className="font-medium text-foreground">
          Gemstone pool: {stock ? `${totalStones.toLocaleString()} stones across ${stocked.length} of ${QUOTE_GEMSTONES.length} gemstone cards` : 'loading…'}
        </p>
        {stock && stocked.length > 0 && (
          <p>{stocked.map(r => `${findQuoteGemstone(r.gem_key)?.name} (${r.stone_count.toLocaleString()})`).join(' · ')}</p>
        )}
        {stock && stocked.length === 0 && <p>No stones uploaded yet — upload the gemstone CSV under Admin → Gemstone Pool. Until then every gemstone card continues straight to the setting.</p>}
      </div>
    </Card>
  );
}
