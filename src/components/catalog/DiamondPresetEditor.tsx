import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Switch } from "@/components/ui/switch";
import { Diamond, Info, Settings } from "lucide-react";
import { CARAT_RANGES, DIAMOND_COLORS, DIAMOND_CLARITIES, getBasePrice, getCaratRangeLabel } from "@/data/diamond-presets";
import { ShapeIcon } from "@/components/common/ShapeIcon";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";

export interface DiamondPresetPrice {
  shapeId: string;
  carat: number;
  color: string;
  clarity: string;
  price: number;
  stoneType?: 'natural' | 'lab';
}

interface DiamondPresetEditorProps {
  selectedShapes: { shape_id: string; shape_name: string }[];
  presetPrices: DiamondPresetPrice[];
  onPriceChange: (shapeId: string, carat: number, color: string, clarity: string, price: number) => void;
  enabledColors?: string[];
  enabledClarities?: string[];
  onColorToggle?: (color: string, enabled: boolean) => void;
  onClarityToggle?: (clarity: string, enabled: boolean) => void;
}

export function DiamondPresetEditor({ 
  selectedShapes, 
  presetPrices, 
  onPriceChange,
  enabledColors = [...DIAMOND_COLORS],
  enabledClarities = [...DIAMOND_CLARITIES],
  onColorToggle,
  onClarityToggle,
}: DiamondPresetEditorProps) {
  const [expandedShapes, setExpandedShapes] = useState<string[]>(
    selectedShapes.length > 0 ? [selectedShapes[0].shape_id] : []
  );

  const getPrice = (shapeId: string, carat: number, color: string, clarity: string): number => {
    const preset = presetPrices.find(
      p => p.shapeId === shapeId && p.carat === carat && p.color === color && p.clarity === clarity
    );
    return preset?.price ?? getBasePrice(carat, color, clarity);
  };

  const formatCarat = (carat: number): string => {
    return carat.toFixed(2).replace(/\.?0+$/, '') + ' ct';
  };

  const isOptionEnabled = (color: string, clarity: string): boolean => {
    return enabledColors.includes(color) && enabledClarities.includes(clarity);
  };

  // Calculate enabled options count
  const enabledOptionsCount = CARAT_RANGES.reduce((acc, range) => {
    return acc + range.carats.length * enabledColors.length * enabledClarities.length;
  }, 0);

  if (selectedShapes.length === 0) {
    return (
      <div className="text-center py-12">
        <Diamond className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
        <h3 className="text-lg font-medium text-foreground mb-2">No Shapes Selected</h3>
        <p className="text-muted-foreground">
          Please complete the ring catalog configuration first to select diamond shapes.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-semibold text-foreground mb-2">
          Configure Natural Diamond Pricing
        </h2>
        <div className="flex items-center justify-center gap-2">
          <p className="text-muted-foreground">
            Set your prices for each diamond configuration. Default prices are pre-filled.
          </p>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="h-4 w-4 text-muted-foreground cursor-help" />
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                <p>You can modify the base prices as per your margin or keep the base price as it is.</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>

      {/* Option Toggles Card */}
      {(onColorToggle || onClarityToggle) && (
        <Card className="border-primary/20 bg-primary/5">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Settings className="w-4 h-4" />
              Offering Options
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Colors Toggle */}
            <div className="space-y-2">
              <Label className="text-sm font-medium text-muted-foreground">Colors you can offer:</Label>
              <div className="flex flex-wrap gap-3">
                {DIAMOND_COLORS.map((color) => (
                  <div key={color} className="flex items-center gap-2 bg-background rounded-lg px-3 py-2 border">
                    <Switch
                      id={`color-${color}`}
                      checked={enabledColors.includes(color)}
                      onCheckedChange={(checked) => onColorToggle?.(color, checked)}
                      disabled={!onColorToggle}
                    />
                    <Label htmlFor={`color-${color}`} className="font-medium cursor-pointer">
                      {color}
                    </Label>
                  </div>
                ))}
              </div>
            </div>

            {/* Clarities Toggle */}
            <div className="space-y-2">
              <Label className="text-sm font-medium text-muted-foreground">Clarities you can offer:</Label>
              <div className="flex flex-wrap gap-3">
                {DIAMOND_CLARITIES.map((clarity) => (
                  <div key={clarity} className="flex items-center gap-2 bg-background rounded-lg px-3 py-2 border">
                    <Switch
                      id={`clarity-${clarity}`}
                      checked={enabledClarities.includes(clarity)}
                      onCheckedChange={(checked) => onClarityToggle?.(clarity, checked)}
                      disabled={!onClarityToggle}
                    />
                    <Label htmlFor={`clarity-${clarity}`} className="font-medium cursor-pointer">
                      {clarity}
                    </Label>
                  </div>
                ))}
              </div>
            </div>

            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Info className="w-3 h-3" />
              Disabled options won't appear in your catalog or be pushed to Shopify
            </p>
          </CardContent>
        </Card>
      )}

      <Accordion
        type="multiple"
        value={expandedShapes}
        onValueChange={setExpandedShapes}
        className="space-y-4"
      >
        {selectedShapes.map((shape) => (
          <AccordionItem
            key={shape.shape_id}
            value={shape.shape_id}
            className="border rounded-xl overflow-hidden"
          >
            <AccordionTrigger className="px-6 py-4 hover:no-underline hover:bg-muted/50">
              <div className="flex items-center gap-3">
                <ShapeIcon shapeId={shape.shape_id} size="md" className="text-primary" />
                <span className="font-semibold text-lg">{shape.shape_name} Diamonds</span>
                <Badge variant="secondary" className="ml-2">
                  {enabledOptionsCount} options
                </Badge>
              </div>
            </AccordionTrigger>
            <AccordionContent className="px-6 pb-6">
              <div className="space-y-6">
                {CARAT_RANGES.map((range) => (
                  <div key={range.label} className="space-y-3">
                    <h4 className="font-medium text-foreground border-b pb-2">
                      Carat Range: {range.label}
                    </h4>
                    <div className="grid gap-2">
                      {range.carats.map((carat) => (
                        <div key={carat} className="space-y-2">
                          {DIAMOND_COLORS.map((color) => (
                            DIAMOND_CLARITIES.map((clarity) => {
                              const price = getPrice(shape.shape_id, carat, color, clarity);
                              const enabled = isOptionEnabled(color, clarity);
                              return (
                                <div
                                  key={`${carat}-${color}-${clarity}`}
                                  className={`flex items-center justify-between gap-4 py-2 px-3 rounded-lg transition-colors ${
                                    enabled 
                                      ? 'bg-muted/30 hover:bg-muted/50' 
                                      : 'bg-muted/10 opacity-50'
                                  }`}
                                >
                                  <div className="flex items-center gap-3 min-w-0 flex-1 flex-wrap">
                                    <span className="font-medium text-foreground w-16">
                                      {formatCarat(carat)}
                                    </span>
                                    <Badge variant="outline" className="text-xs">
                                      Color: {color}
                                    </Badge>
                                    <Badge variant="outline" className="text-xs">
                                      Clarity: {clarity}
                                    </Badge>
                                    <span className="text-xs text-muted-foreground">
                                      Base: ${getBasePrice(carat, color, clarity).toLocaleString()}
                                    </span>
                                    {!enabled && (
                                      <Badge variant="secondary" className="text-xs">
                                        Disabled
                                      </Badge>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-2 flex-shrink-0">
                                    <span className="text-muted-foreground">$</span>
                                    <Input
                                      type="number"
                                      value={price || ''}
                                      onChange={(e) => onPriceChange(
                                        shape.shape_id,
                                        carat,
                                        color,
                                        clarity,
                                        e.target.value === '' ? 0 : (parseFloat(e.target.value) || 0)
                                      )}
                                      className="w-28 text-right"
                                      min={0}
                                      step={1}
                                      disabled={!enabled}
                                    />
                                  </div>
                                </div>
                              );
                            })
                          ))}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  );
}
