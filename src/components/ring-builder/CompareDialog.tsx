import { useState } from 'react';
import { X, Plus } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { RingConfiguration } from '@/types/ring-builder';

interface CompareDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentConfiguration: RingConfiguration;
  calculatePrice: (config: RingConfiguration) => number;
}

export const CompareDialog = ({ 
  open, 
  onOpenChange, 
  currentConfiguration,
  calculatePrice 
}: CompareDialogProps) => {
  const [comparisons, setComparisons] = useState<RingConfiguration[]>([]);

  const addCurrentDesign = () => {
    if (comparisons.length < 3) {
      setComparisons([...comparisons, currentConfiguration]);
    }
  };

  const removeComparison = (index: number) => {
    setComparisons(comparisons.filter((_, i) => i !== index));
  };

  const clearAll = () => {
    setComparisons([]);
  };

  const getConfigImage = (_config: RingConfiguration) => {
    return null;
  };

  const formatValue = (value: any) => {
    if (!value) return 'Not selected';
    if (typeof value === 'string') {
      return value.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    }
    return value;
  };

  const specs = [
    { label: 'Style', key: 'style' },
    { label: 'Metal', key: 'metal' },
    { label: 'Shape', key: 'shape' },
    { label: 'Shank', key: 'shank' },
    { label: 'Carat', key: 'caratRange' },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Compare Designs</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex gap-2">
            <Button 
              onClick={addCurrentDesign} 
              disabled={comparisons.length >= 3}
              size="sm"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Current Design ({comparisons.length}/3)
            </Button>
            {comparisons.length > 0 && (
              <Button onClick={clearAll} variant="outline" size="sm">
                Clear All
              </Button>
            )}
          </div>

          {comparisons.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <p>Add designs to compare side by side</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {comparisons.map((config, index) => (
                <div key={index} className="border rounded-lg overflow-hidden">
                  <div className="relative aspect-square bg-black flex items-center justify-center p-4">
                    <button
                      onClick={() => removeComparison(index)}
                      className="absolute top-2 right-2 p-1 bg-white/10 hover:bg-white/20 rounded-full"
                    >
                      <X className="w-4 h-4 text-white" />
                    </button>
                    {getConfigImage(config) ? (
                      <img
                        src={getConfigImage(config)!}
                        alt="Ring preview"
                        className="max-w-full max-h-full object-contain"
                      />
                    ) : (
                      <div className="text-white/50 text-sm">Preview not available</div>
                    )}
                  </div>

                  <div className="p-4 space-y-3">
                    <div className="text-xl font-bold text-primary">
                      ${calculatePrice(config).toLocaleString()}
                    </div>

                    {specs.map((spec) => (
                      <div key={spec.key} className="text-sm">
                        <span className="text-muted-foreground">{spec.label}:</span>{' '}
                        <span className="font-medium">
                          {formatValue(config[spec.key as keyof RingConfiguration])}
                        </span>
                      </div>
                    ))}

                    {config.stone && (
                      <div className="text-sm">
                        <span className="text-muted-foreground">Stone:</span>{' '}
                        <span className="font-medium">
                          {formatValue(config.stone.type)} - {config.stone.clarity}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
