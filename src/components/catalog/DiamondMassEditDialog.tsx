import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import { formatCurrency } from '@/lib/pricing-utils';

interface DiamondMassEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  totalCount: number;
  filteredCount: number;
  hasFilter: boolean;
  onApplyChanges: (
    type: 'percentage' | 'fixed',
    value: number,
    applyTo: 'all' | 'filtered',
  ) => Promise<void>;
  shapeOptions?: { shape_id: string; shape_name: string }[];
  currency?: string;
}

export function DiamondMassEditDialog({
  open,
  onOpenChange,
  totalCount,
  filteredCount,
  hasFilter,
  onApplyChanges,
}: DiamondMassEditDialogProps) {
  // Diamond inventory sheets are priced in USD and never converted.
  const currency = 'USD';
  const [adjustmentType, setAdjustmentType] = useState<'percentage' | 'fixed'>('percentage');
  const [adjustmentValue, setAdjustmentValue] = useState<string>('');
  const [applyTo, setApplyTo] = useState<'all' | 'filtered'>('all');
  const [isApplying, setIsApplying] = useState(false);

  const targetCount = applyTo === 'all' ? totalCount : filteredCount;

  const previewPrice = (base: number): number => {
    const value = parseFloat(adjustmentValue) || 0;
    if (adjustmentType === 'percentage') return Math.round(base * (1 + value / 100));
    return Math.max(0, Math.round(base + value));
  };

  const handleApply = async () => {
    const value = parseFloat(adjustmentValue);
    if (!value || value === 0) return;
    setIsApplying(true);
    try {
      await onApplyChanges(adjustmentType, value, applyTo);
      setAdjustmentValue('');
      onOpenChange(false);
    } finally {
      setIsApplying(false);
    }
  };

  const handleClose = (open: boolean) => {
    if (!open) {
      setAdjustmentValue('');
      setApplyTo('all');
      setAdjustmentType('percentage');
    }
    onOpenChange(open);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Mass Edit Diamond Prices</DialogTitle>
          <DialogDescription>
            Apply price adjustments to multiple diamonds at once
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Apply To Selection */}
          <div className="space-y-2">
            <Label>Apply to</Label>
            <RadioGroup
              value={applyTo}
              onValueChange={(v) => setApplyTo(v as 'all' | 'filtered')}
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="all" id="mass-edit-all" />
                <Label htmlFor="mass-edit-all" className="font-normal cursor-pointer">
                  All diamonds ({totalCount.toLocaleString()})
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem
                  value="filtered"
                  id="mass-edit-filtered"
                  disabled={!hasFilter}
                />
                <Label
                  htmlFor="mass-edit-filtered"
                  className={`font-normal cursor-pointer ${!hasFilter ? 'opacity-50' : ''}`}
                >
                  Filtered results only ({filteredCount.toLocaleString()})
                  {!hasFilter && (
                    <span className="text-xs text-muted-foreground ml-1">(no filter applied)</span>
                  )}
                </Label>
              </div>
            </RadioGroup>
          </div>

          {/* Adjustment Type */}
          <div className="space-y-2">
            <Label>Adjustment type</Label>
            <Select
              value={adjustmentType}
              onValueChange={(v) => setAdjustmentType(v as 'percentage' | 'fixed')}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="percentage">Percentage (%)</SelectItem>
                <SelectItem value="fixed">Fixed Amount ($)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Adjustment Value */}
          <div className="space-y-2">
            <Label>
              {adjustmentType === 'percentage' ? 'Percentage change' : 'Amount to add/subtract'}
            </Label>
            <div className="flex items-center gap-2">
              {adjustmentType === 'fixed' && (
                <span className="text-muted-foreground">$</span>
              )}
              <Input
                type="number"
                value={adjustmentValue}
                onChange={(e) => setAdjustmentValue(e.target.value)}
                placeholder={adjustmentType === 'percentage' ? 'e.g., 10 or -5' : 'e.g., 100 or -50'}
              />
              {adjustmentType === 'percentage' && (
                <span className="text-muted-foreground">%</span>
              )}
            </div>
            <p className="text-xs text-muted-foreground">Use negative values to decrease prices</p>
          </div>

          {/* Preview */}
          {adjustmentValue && parseFloat(adjustmentValue) !== 0 && (
            <div className="p-3 bg-muted rounded-lg space-y-2">
              <p className="text-sm font-medium">Preview ({targetCount.toLocaleString()} diamonds)</p>
              <div className="text-sm text-muted-foreground space-y-1">
                <p>Example: {formatCurrency(1688, currency)} → {formatCurrency(previewPrice(1688), currency)}</p>
                <p>Example: {formatCurrency(6750, currency)} → {formatCurrency(previewPrice(6750), currency)}</p>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleClose(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleApply}
            disabled={!adjustmentValue || parseFloat(adjustmentValue) === 0 || isApplying}
          >
            {isApplying && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Apply to {targetCount.toLocaleString()} diamonds
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
