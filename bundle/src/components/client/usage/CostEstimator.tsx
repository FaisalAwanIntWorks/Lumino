import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { TrendingUp, Calendar, DollarSign, AlertTriangle } from 'lucide-react';
import { calculateUsageProjection, formatDaysUntilLimit, formatCostEstimate } from '@/lib/cost-calculator';
import { UsageSnapshot } from '@/lib/usage-utils';

interface CostEstimatorProps {
  snapshots: UsageSnapshot[];
}

export function CostEstimator({ snapshots }: CostEstimatorProps) {
  const projection = calculateUsageProjection(snapshots);

  const getConfidenceBadge = () => {
    const variants = {
      high: 'default' as const,
      medium: 'secondary' as const,
      low: 'outline' as const
    };
    return (
      <Badge variant={variants[projection.confidenceLevel]}>
        {projection.confidenceLevel} confidence
      </Badge>
    );
  };

  const getStatusIcon = (status: string) => {
    if (status === 'critical') return <AlertTriangle className="h-4 w-4 text-destructive" />;
    if (status === 'warning') return <TrendingUp className="h-4 w-4 text-orange-500" />;
    return <TrendingUp className="h-4 w-4 text-green-500" />;
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5" />
              Cost Projection
            </CardTitle>
            <CardDescription>Based on {snapshots.length} days of data</CardDescription>
          </div>
          {getConfidenceBadge()}
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Summary */}
        <div className="space-y-2 border-b pb-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Next service to limit:</span>
            <span className="font-semibold">{projection.nextServiceToLimit}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Time until limit:</span>
            <span className="font-semibold text-lg">
              {formatDaysUntilLimit(projection.daysUntilFirstLimit)}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Projected monthly cost:</span>
            <span className={`font-bold text-xl ${projection.totalProjectedCost > 0 ? 'text-orange-500' : 'text-green-500'}`}>
              {formatCostEstimate(projection.totalProjectedCost)}
            </span>
          </div>
        </div>

        {/* Individual Service Projections */}
        <div className="space-y-4">
          <h4 className="text-sm font-medium flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            Service Breakdown
          </h4>
          {projection.projections.map((proj) => (
            <div key={proj.service} className="space-y-2 border rounded-lg p-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {getStatusIcon(proj.status)}
                  <span className="font-medium text-sm">{proj.service}</span>
                </div>
                <Badge variant={proj.status === 'critical' ? 'destructive' : proj.status === 'warning' ? 'secondary' : 'default'}>
                  {proj.percentUsed.toFixed(1)}%
                </Badge>
              </div>
              
              <Progress value={Math.min(proj.percentUsed, 100)} className="h-2" />
              
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-muted-foreground">Growth rate:</span>
                  <span className="ml-1 font-medium">
                    {proj.growthRate > 0 ? `+${proj.growthRate.toFixed(2)}/day` : 'Stable'}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">Days to limit:</span>
                  <span className="ml-1 font-medium">
                    {formatDaysUntilLimit(proj.daysUntilLimit)}
                  </span>
                </div>
                {proj.projectedMonthlyCost > 0 && (
                  <div className="col-span-2">
                    <span className="text-muted-foreground">Est. monthly cost:</span>
                    <span className="ml-1 font-medium text-orange-500">
                      {formatCostEstimate(proj.projectedMonthlyCost)}
                    </span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Note about projections */}
        <div className="text-xs text-muted-foreground bg-muted/50 rounded-lg p-3">
          <p className="flex items-start gap-2">
            <AlertTriangle className="h-3 w-3 mt-0.5 flex-shrink-0" />
            <span>
              Projections are estimates based on historical usage patterns. Actual usage may vary.
              {projection.confidenceLevel === 'low' && ' More data points will improve accuracy.'}
            </span>
          </p>
        </div>
      </CardContent>
    </Card>
  );
}