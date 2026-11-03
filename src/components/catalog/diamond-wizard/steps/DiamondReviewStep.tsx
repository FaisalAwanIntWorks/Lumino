import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Pencil, Rocket, Loader2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { TooltipProvider, Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { supabase } from "@/integrations/supabase/client";
import type { DiamondWizardState, WizardStep } from '../types';
import { calculateProductCount, getCurrencySymbol } from '../utils';
import { DIAMOND_SHAPES } from '../defaults';

interface Props {
  state: DiamondWizardState;
  onGoToStep: (step: WizardStep) => void;
  onGenerate: () => void;
  isGenerating: boolean;
}

export function DiamondReviewStep({ state, onGoToStep, onGenerate, isGenerating }: Props) {
  const fallbackCount = calculateProductCount(state);
  const [estimate, setEstimate] = useState<{ total: number; loading: boolean }>({
    total: fallbackCount,
    loading: true,
  });

  useEffect(() => {
    let cancelled = false;
    setEstimate((prev) => ({ total: prev.total, loading: true }));
    (async () => {
      try {
        const { data, error } = await (supabase as any).rpc('count_diamond_presets_estimate', {
          p_wizard_config: state,
        });
        if (cancelled) return;
        if (error || !data) {
          setEstimate({ total: fallbackCount, loading: false });
          return;
        }
        setEstimate({ total: Number(data.total ?? fallbackCount), loading: false });
      } catch {
        if (!cancelled) setEstimate({ total: fallbackCount, loading: false });
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(state)]);

  const productCount = estimate.total;
  const isCounting = estimate.loading;
  const { diamondType, shapes, grading, pricing, productSettings } = state;

  const shapeNames = shapes.selectedShapes.map(id => DIAMOND_SHAPES.find(s => s.id === id)?.name || id);

  const allTiers = [...pricing.naturalMarkupTiers, ...pricing.labMarkupTiers];
  const markupRange = allTiers.length > 0
    ? `${Math.min(...allTiers.map(t => t.markup))}% – ${Math.max(...allTiers.map(t => t.markup))}%`
    : 'N/A';

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold">Review & Activate</h3>
        <p className="text-sm text-muted-foreground">Here's a summary of your diamond catalogue configuration.</p>
      </div>

      {/* Stats card */}
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-lg">📊</span>
            <span className="font-semibold">Your Diamond Catalogue Will Generate:</span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="text-center p-3 bg-background rounded-lg border">
                    {isCounting ? (
                      <Loader2 className="w-5 h-5 animate-spin text-primary mx-auto" />
                    ) : (
                      <p className="text-2xl font-bold text-primary">~{productCount.toLocaleString()}</p>
                    )}
                    <p className="text-xs text-muted-foreground">Products</p>
                  </div>
                </TooltipTrigger>
                <TooltipContent className="text-xs max-w-[250px]">
                  Estimate from your inventory pool + standard fallback combinations
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <div className="text-center p-3 bg-background rounded-lg border">
              <p className="text-2xl font-bold">{shapes.selectedShapes.length}</p>
              <p className="text-xs text-muted-foreground">Shapes</p>
            </div>
            <div className="text-center p-3 bg-background rounded-lg border">
              <p className="text-lg font-bold">{grading.clarities[0]}–{grading.clarities[grading.clarities.length - 1]}</p>
              <p className="text-xs text-muted-foreground">Clarity</p>
            </div>
            <div className="text-center p-3 bg-background rounded-lg border">
              <p className="text-lg font-bold">{grading.caratRange[0]}–{grading.caratRange[1]}ct</p>
              <p className="text-xs text-muted-foreground">Carats</p>
            </div>
            <div className="text-center p-3 bg-background rounded-lg border">
              <p className="text-2xl font-bold">{pricing.currency}</p>
              <p className="text-xs text-muted-foreground">Currency</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary cards */}
      <div className="space-y-3">
        {/* Diamond Types */}
        <Card>
          <CardContent className="p-4 flex items-start justify-between">
            <div>
              <p className="font-semibold text-sm mb-1">Diamond Types</p>
              <p className="text-xs text-muted-foreground">
                Natural: {diamondType.naturalEnabled ? '✅' : '❌'}  Lab-Grown: {diamondType.labGrownEnabled ? '✅' : '❌'}
              </p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => onGoToStep(1)} className="text-xs gap-1">
              <Pencil className="w-3 h-3" /> Edit
            </Button>
          </CardContent>
        </Card>

        {/* Shapes */}
        <Card>
          <CardContent className="p-4 flex items-start justify-between">
            <div>
              <p className="font-semibold text-sm mb-1">Shapes ({shapes.selectedShapes.length})</p>
              <p className="text-xs text-muted-foreground">{shapeNames.join(', ')}</p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => onGoToStep(2)} className="text-xs gap-1">
              <Pencil className="w-3 h-3" /> Edit
            </Button>
          </CardContent>
        </Card>

        {/* Grading */}
        <Card>
          <CardContent className="p-4 flex items-start justify-between">
            <div>
              <p className="font-semibold text-sm mb-1">Grading</p>
              <div className="text-xs text-muted-foreground space-y-0.5">
                <p>Carat: {grading.caratRange[0]} – {grading.caratRange[1]}ct</p>
                <p>Clarity: {grading.clarities[0]} – {grading.clarities[grading.clarities.length - 1]}</p>
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={() => onGoToStep(3)} className="text-xs gap-1">
              <Pencil className="w-3 h-3" /> Edit
            </Button>
          </CardContent>
        </Card>

        {/* Pricing */}
        <Card>
          <CardContent className="p-4 flex items-start justify-between">
            <div>
              <p className="font-semibold text-sm mb-1">Pricing</p>
              <div className="text-xs text-muted-foreground space-y-0.5">
                <p>Currency: {pricing.currency}  |  {allTiers.length} tiers ({markupRange})</p>
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={() => onGoToStep(4)} className="text-xs gap-1">
              <Pencil className="w-3 h-3" /> Edit
            </Button>
          </CardContent>
        </Card>

        {/* Product Settings */}
        <Card>
          <CardContent className="p-4 flex items-start justify-between">
            <div>
              <p className="font-semibold text-sm mb-1">Product Settings</p>
              <div className="text-xs text-muted-foreground space-y-0.5">
                <p>Title: {productSettings.titleTemplate}</p>
                <p>SKU: {productSettings.skuTemplate}</p>
                <p>Collections: {[
                  productSettings.collections.allDiamonds && 'All',
                  productSettings.collections.perShape && 'Per-Shape',
                  productSettings.collections.perOrigin && 'Per-Origin',
                  productSettings.collections.perCaratRange && 'Per-Carat',
                  
                ].filter(Boolean).join(', ')}</p>
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={() => onGoToStep(5)} className="text-xs gap-1">
              <Pencil className="w-3 h-3" /> Edit
            </Button>
          </CardContent>
        </Card>
      </div>

      <Separator />

      {/* Generate button */}
      <div className="text-center space-y-3">
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button size="lg" className="gap-2" disabled={isGenerating}>
              {isGenerating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Rocket className="w-4 h-4" />
                  Generate Diamond Catalogue
                </>
              )}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Generate Diamond Catalogue?</AlertDialogTitle>
              <AlertDialogDescription>
                This will create ~{productCount.toLocaleString()} diamond products based on your configuration. You can edit this later.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={onGenerate}>Generate Catalogue</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        <p className="text-xs text-muted-foreground">
          This will create ~{productCount.toLocaleString()} diamond products based on your configuration.
        </p>
      </div>
    </div>
  );
}
