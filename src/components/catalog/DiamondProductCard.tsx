import { ShapeIcon } from "@/components/common/ShapeIcon";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/pricing-utils";

interface DiamondProductCardProps {
  shapeId: string;
  shapeName: string;
  carat: number;
  color: string;
  clarity: string;
  price: number;
  stoneType: 'natural' | 'lab';
  currency?: string;
}

export function DiamondProductCard({
  shapeId,
  shapeName,
  carat,
  color,
  clarity,
  price,
  stoneType,
  currency = 'USD',
}: DiamondProductCardProps) {
  const isLab = stoneType === 'lab';

  return (
    <Card className="p-2.5 hover:shadow-md transition-all duration-200 border-border/50">
      <div className="space-y-1.5">
        {/* Header: Icon + Shape Name */}
        <div className="flex items-center gap-1.5">
          <ShapeIcon shapeId={shapeId} size="md" className="text-primary flex-shrink-0" />
          <span className="font-medium text-xs truncate">{shapeName}</span>
        </div>
        
        {/* Specs: Clean text format */}
        <p className="text-[11px] text-muted-foreground truncate">
          {Number(carat).toFixed(2)}ct · {color} · {clarity}
        </p>
        
        {/* Price */}
        <p className="font-bold text-sm text-foreground">
          {formatCurrency(price, currency)}
          <span className="ml-1 text-[9px] font-medium text-muted-foreground align-middle">{currency}</span>
        </p>
        
        {/* Footer: Type */}
        <div className="flex items-center justify-between pt-1.5 border-t border-border/50">
          <span className={cn(
            "text-[9px] font-medium uppercase tracking-wide",
            isLab ? "text-cyan-600 dark:text-cyan-400" : "text-amber-600 dark:text-amber-400"
          )}>
            {isLab ? 'Lab' : 'Natural'}
          </span>
        </div>
      </div>
    </Card>
  );
}
