import { useState, useEffect } from "react";
import { Loader2, CheckCircle, XCircle, Clock } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";

interface ShopifySyncProgressProps {
  processed: number;
  total: number;
  remaining: number;
  created: number;
  updated: number;
  failed: number;
  label?: string;
  startTime: number;
}

const formatTime = (seconds: number): string => {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  if (m === 0) return `${s}s`;
  return `${m}m ${s.toString().padStart(2, "0")}s`;
};

export const ShopifySyncProgress = ({
  processed,
  total,
  remaining,
  created,
  updated,
  failed,
  label = "products",
  startTime,
}: ShopifySyncProgressProps) => {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setElapsed((Date.now() - startTime) / 1000);
    }, 1000);
    return () => clearInterval(interval);
  }, [startTime]);

  const percentage = total > 0 ? Math.round((processed / total) * 100) : 0;
  const rate = processed > 0 ? elapsed / processed : 0;
  const etaSeconds = Math.ceil(rate * remaining);

  return (
    <div className="w-full rounded-lg border border-border bg-card p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Loader2 className="w-4 h-4 animate-spin text-primary flex-shrink-0" />
        <span className="text-sm font-medium">
          Syncing {label}… {processed} of {total} ({percentage}%)
        </span>
      </div>

      {/* Progress bar */}
      <Progress value={percentage} className="h-2" />

      {/* Live stats */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <Badge variant="outline" className="gap-1 border-emerald-500 text-emerald-600">
          <CheckCircle className="w-3 h-3" />
          Created: {created}
        </Badge>
        <Badge variant="outline" className="gap-1 border-blue-500 text-blue-600">
          <CheckCircle className="w-3 h-3" />
          Updated: {updated}
        </Badge>
        {failed > 0 && (
          <Badge variant="outline" className="gap-1 border-destructive text-destructive">
            <XCircle className="w-3 h-3" />
            Failed: {failed}
          </Badge>
        )}
      </div>

      {/* Timing */}
      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <Clock className="w-3 h-3" />
          Elapsed: {formatTime(elapsed)}
        </span>
        {processed > 0 && remaining > 0 && (
          <span>Est. remaining: ~{formatTime(etaSeconds)}</span>
        )}
      </div>
    </div>
  );
};
