import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { DollarSign, TrendingUp, Wrench, AlertCircle, RefreshCw, ThumbsUp, ThumbsDown } from "lucide-react";

interface LeadCostEstimationProps {
  leadId: string;
  leadSource: string;
  clientId: string;
  configuration: any;
  existingEstimate: number | null;
  currency: string;
}

interface CostEstimate {
  id?: string;
  material_cost: number | null;
  labor_estimate: number | null;
  suggested_retail_low: number | null;
  suggested_retail_high: number | null;
  confidence: string | null;
  reasoning: string | null;
  feedback: string | null;
}

const formatAmount = (amount: number | null, currency: string) => {
  if (amount === null || amount === undefined) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
};

export const LeadCostEstimation = ({
  leadId, leadSource, clientId, configuration, existingEstimate, currency,
}: LeadCostEstimationProps) => {
  const [estimate, setEstimate] = useState<CostEstimate | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [feedback, setFeedback] = useState<string | null>(null);

  // Check for cached estimate
  useEffect(() => {
    const fetchCached = async () => {
      try {
        const { data } = await supabase
          .from('lead_cost_estimates')
          .select('id, material_cost, labor_estimate, suggested_retail_low, suggested_retail_high, confidence, reasoning, feedback')
          .eq('lead_id', leadId)
          .eq('lead_source', leadSource)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (data) {
          setEstimate(data);
          setFeedback(data.feedback);
        }
      } catch (err) {
        console.error('Failed to fetch cached estimate:', err);
      } finally {
        setFetching(false);
      }
    };
    fetchCached();
  }, [leadId, leadSource]);

  const handleGenerateEstimate = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('estimate-lead-cost', {
        body: { leadId, leadSource, clientId, configuration, currency },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setEstimate({
        material_cost: data.materialCost,
        labor_estimate: data.laborEstimate,
        suggested_retail_low: data.suggestedRetailLow,
        suggested_retail_high: data.suggestedRetailHigh,
        confidence: data.confidence,
        reasoning: data.reasoning,
        feedback: null,
      });
      setFeedback(null);
    } catch (err: any) {
      console.error('Failed to generate estimate:', err);
      toast.error('Failed to generate estimate', { description: err.message });
    } finally {
      setLoading(false);
    }
  };

  const handleFeedback = async (type: 'liked' | 'disliked') => {
    const newFeedback = feedback === type ? null : type;
    setFeedback(newFeedback);

    try {
      if (estimate?.id) {
        await supabase
          .from('lead_cost_estimates')
          .update({ feedback: newFeedback })
          .eq('id', estimate.id);
      }
    } catch (err) {
      console.error('Failed to save feedback:', err);
    }
  };

  if (fetching) {
    return (
      <div className="pb-5 border-b border-border/40">
        <Skeleton className="h-6 w-40 mb-3" />
        <Skeleton className="h-20" />
      </div>
    );
  }

  return (
    <div className="pb-5 border-b border-border/40">
        <div className="flex items-center justify-between mb-4">
          <h4 className="text-sm font-semibold flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-primary" />
            AI Cost Estimation
          </h4>
        </div>

        {!estimate ? (
          <div className="text-center py-6 space-y-3">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-primary/10">
              <TrendingUp className="h-6 w-6 text-primary" />
            </div>
            <div>
              <p className="text-sm font-medium">Generate AI Cost Estimate</p>
              <p className="text-xs text-muted-foreground mt-1">
                AI will analyze the customer's selections and provide a cost breakdown
              </p>
            </div>
            <Button onClick={handleGenerateEstimate} disabled={loading} size="sm" className="gap-2">
              {loading && <RefreshCw className="h-4 w-4 animate-spin" />}
              {loading ? 'Analyzing...' : 'Generate Estimate'}
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="rounded-lg border border-border/60 p-3 text-center">
                <Wrench className="h-4 w-4 text-muted-foreground mx-auto mb-1" />
                <p className="text-xs text-muted-foreground">Material</p>
                <p className="text-sm font-bold">{formatAmount(estimate.material_cost, currency)}</p>
              </div>
              <div className="rounded-lg border border-border/60 p-3 text-center">
                <DollarSign className="h-4 w-4 text-muted-foreground mx-auto mb-1" />
                <p className="text-xs text-muted-foreground">Labor</p>
                <p className="text-sm font-bold">{formatAmount(estimate.labor_estimate, currency)}</p>
              </div>
              <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-center col-span-2">
                <TrendingUp className="h-4 w-4 text-primary mx-auto mb-1" />
                <p className="text-xs text-muted-foreground">Suggested Retail</p>
                <p className="text-sm font-bold text-primary">
                  {formatAmount(estimate.suggested_retail_low, currency)} – {formatAmount(estimate.suggested_retail_high, currency)}
                </p>
              </div>
            </div>

            {estimate.confidence && (
              <div className="flex items-center gap-2">
                <AlertCircle className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs text-muted-foreground capitalize">
                  Confidence: <span className="font-medium">{estimate.confidence}</span>
                </span>
              </div>
            )}

            {estimate.reasoning && (
              <div className="rounded-lg bg-muted/50 p-3">
                <p className="text-xs text-muted-foreground leading-relaxed">{estimate.reasoning}</p>
              </div>
            )}

            <div className="flex items-center gap-2 pt-1">
              <span className="text-xs text-muted-foreground">Was this helpful?</span>
              <Button
                variant="ghost"
                size="icon"
                className={`h-7 w-7 ${feedback === 'liked' ? 'text-primary bg-primary/10' : 'text-muted-foreground'}`}
                onClick={() => handleFeedback('liked')}
              >
                <ThumbsUp className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className={`h-7 w-7 ${feedback === 'disliked' ? 'text-destructive bg-destructive/10' : 'text-muted-foreground'}`}
                onClick={() => handleFeedback('disliked')}
              >
                <ThumbsDown className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        )}
    </div>
  );
};
