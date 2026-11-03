import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { LucideIcon } from 'lucide-react';

interface UsageMetricsCardProps {
  title: string;
  description: string;
  icon: LucideIcon;
  current: number;
  limit: number;
  unit: string;
  percentUsed: number;
  secondaryMetric?: {
    label: string;
    value: string | number;
  };
}

export function UsageMetricsCard({
  title,
  description,
  icon: Icon,
  current,
  limit,
  unit,
  percentUsed,
  secondaryMetric
}: UsageMetricsCardProps) {
  const getStatusColor = (percent: number) => {
    if (percent >= 90) return 'text-destructive';
    if (percent >= 75) return 'text-orange-500';
    if (percent >= 50) return 'text-yellow-500';
    return 'text-green-500';
  };

  const getStatusBadge = (percent: number) => {
    if (percent >= 90) return { label: 'Critical', variant: 'destructive' as const };
    if (percent >= 75) return { label: 'Warning', variant: 'secondary' as const };
    if (percent >= 50) return { label: 'Caution', variant: 'secondary' as const };
    return { label: 'Healthy', variant: 'default' as const };
  };

  const status = getStatusBadge(percentUsed);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div className="space-y-1">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Icon className="h-4 w-4" />
            {title}
          </CardTitle>
          <CardDescription className="text-xs">{description}</CardDescription>
        </div>
        <Badge variant={status.variant}>{status.label}</Badge>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          <div>
            <div className="flex items-baseline justify-between mb-2">
              <span className={`text-2xl font-bold ${getStatusColor(percentUsed)}`}>
                {Math.round(current).toLocaleString()}
              </span>
              <span className="text-sm text-muted-foreground">
                / {limit.toLocaleString()} {unit}
              </span>
            </div>
            <Progress value={Math.min(percentUsed, 100)} className="h-2" />
            <p className="text-xs text-muted-foreground mt-1">
              {percentUsed.toFixed(1)}% used
            </p>
          </div>
          {secondaryMetric && (
            <div className="flex items-center justify-between text-xs border-t pt-2">
              <span className="text-muted-foreground">{secondaryMetric.label}</span>
              <span className="font-medium">{secondaryMetric.value}</span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}