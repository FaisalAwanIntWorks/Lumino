import { stickyHeaderTableClass } from "@/components/ui/table";
import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Slider } from '@/components/ui/slider';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Info, Diamond } from 'lucide-react';
import {
  DIAMOND_BASE_PRICES,
  LAB_DIAMOND_BASE_PRICES,
  DIAMOND_COLORS,
  DIAMOND_CLARITIES,
  LAB_DIAMOND_COLORS,
  LAB_DIAMOND_CLARITIES,
} from '@/data/diamond-presets';
import { formatCurrency } from '@/lib/pricing-utils';

// Build column combos from color × clarity
function buildCombos(colors: readonly string[], clarities: readonly string[]) {
  const combos: { color: string; clarity: string; label: string }[] = [];
  for (const color of colors) {
    for (const clarity of clarities) {
      combos.push({ color, clarity, label: `${color}/${clarity}` });
    }
  }
  return combos;
}

// Heat-map background: green = high margin, amber = mid, red = low
function marginColor(base: number, retail: number): string {
  if (base === 0) return '';
  const pct = ((retail - base) / base) * 100;
  if (pct >= 80) return 'bg-emerald-500/15 text-emerald-300';
  if (pct >= 50) return 'bg-emerald-500/10 text-emerald-400/80';
  if (pct >= 30) return 'bg-amber-500/10 text-amber-300';
  return 'bg-red-500/10 text-red-300';
}

interface MatrixProps {
  prices: Record<number, Record<string, Record<string, number>>>;
  combos: { color: string; clarity: string; label: string }[];
  carats: number[];
  markup: number;
}

function PriceMatrix({ prices, combos, carats, markup }: MatrixProps) {
  return (
    <Table containerClassName={stickyHeaderTableClass}>
      <TableHeader>
        <TableRow>
          <TableHead className="w-24">Carat</TableHead>
          {combos.map((c) => (
            <TableHead key={c.label} className="text-center min-w-[120px]">
              {c.label}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {carats.map((carat) => (
          <TableRow key={carat}>
            <TableCell className="font-semibold">{carat.toFixed(2)} ct</TableCell>
            {combos.map((c) => {
              const base = prices[carat]?.[c.color]?.[c.clarity] ?? 0;
              const retail = base === 0 ? 0 : Math.round(base * (1 + markup / 100));
              return (
                <TableCell
                  key={c.label}
                  className={`text-center text-xs ${base === 0 ? 'text-muted-foreground' : marginColor(base, retail)}`}
                >
                  {base === 0 ? (
                    '—'
                  ) : (
                    <div className="flex flex-col gap-0.5">
                      <span className="text-muted-foreground line-through text-[10px]">
                        {formatCurrency(base)}
                      </span>
                      <span className="font-bold text-sm">{formatCurrency(retail)}</span>
                    </div>
                  )}
                </TableCell>
              );
            })}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export default function DiamondPricingSandbox() {
  const [markup, setMarkup] = useState(30);

  const naturalCombos = buildCombos(DIAMOND_COLORS, DIAMOND_CLARITIES);
  const labCombos = buildCombos(LAB_DIAMOND_COLORS, LAB_DIAMOND_CLARITIES);

  const naturalCarats = Object.keys(DIAMOND_BASE_PRICES).map(Number).sort((a, b) => a - b);
  const labCarats = Object.keys(LAB_DIAMOND_BASE_PRICES).map(Number).sort((a, b) => a - b);

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-[1400px] mx-auto">
      {/* Sandbox banner */}
      <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 flex items-start gap-3">
        <Info className="h-5 w-5 text-primary mt-0.5 shrink-0" />
        <div>
          <h3 className="font-semibold text-sm text-primary">Sandbox Prototype</h3>
          <p className="text-xs text-muted-foreground mt-1">
            This is a visual prototype showing how a Rapaport-style diamond pricing matrix could work.
            Prices shown are sample data — not connected to live systems.
          </p>
        </div>
      </div>

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Diamond className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Diamond Pricing Matrix</h1>
            <p className="text-sm text-muted-foreground">
              Carat × Color/Clarity grid with adjustable jeweler markup
            </p>
          </div>
        </div>

        {/* Markup slider */}
        <div className="flex items-center gap-4 min-w-[280px] bg-card border border-border rounded-lg p-4">
          <span className="text-sm font-medium whitespace-nowrap">Markup</span>
          <Slider
            value={[markup]}
            onValueChange={(v) => setMarkup(v[0])}
            min={10}
            max={200}
            step={5}
            className="flex-1"
          />
          <Badge variant="secondary" className="text-sm font-bold min-w-[48px] justify-center">
            {markup}%
          </Badge>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 text-xs">
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-emerald-500/15 border border-emerald-500/30" /> High margin (≥80%)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-emerald-500/10 border border-emerald-500/20" /> Good (50–79%)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-amber-500/10 border border-amber-500/30" /> Mid (30–49%)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-red-500/10 border border-red-500/30" /> Low (&lt;30%)
        </span>
      </div>

      {/* Tabs + Matrix */}
      <Tabs defaultValue="natural" className="space-y-4">
        <TabsList>
          <TabsTrigger value="natural">Natural Diamonds</TabsTrigger>
          <TabsTrigger value="lab">Lab Grown</TabsTrigger>
        </TabsList>

        <TabsContent value="natural">
          <PriceMatrix
            prices={DIAMOND_BASE_PRICES}
            combos={naturalCombos}
            carats={naturalCarats}
            markup={markup}
          />
        </TabsContent>

        <TabsContent value="lab">
          <PriceMatrix
            prices={LAB_DIAMOND_BASE_PRICES}
            combos={labCombos}
            carats={labCarats}
            markup={markup}
          />
        </TabsContent>
      </Tabs>

      {/* Explanation */}
      <div className="text-xs text-muted-foreground border-t border-border pt-4 space-y-1">
        <p><strong>How it works:</strong> Each cell shows the base cost (strikethrough) and the retail price after applying your markup.</p>
        <p>Retail = Base Cost × (1 + Markup%). For example, a $6,300 base at 30% markup → $8,190 retail.</p>
      </div>
    </div>
  );
}
