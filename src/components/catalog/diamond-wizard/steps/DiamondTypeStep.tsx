import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";

import { Card, CardContent } from "@/components/ui/card";
import type { DiamondWizardState } from '../types';

interface Props {
  state: DiamondWizardState;
  onChange: (state: DiamondWizardState) => void;
}

export function DiamondTypeStep({ state, onChange }: Props) {
  const { diamondType } = state;

  const update = (partial: Partial<typeof diamondType>) => {
    onChange({ ...state, diamondType: { ...diamondType, ...partial } });
  };


  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold mb-1">What kind of diamonds do you sell?</h3>
        <p className="text-sm text-muted-foreground">Enable at least one diamond type to continue.</p>
      </div>

      {/* Diamond type cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Natural */}
        <Card className={`relative transition-all ${diamondType.naturalEnabled ? 'border-primary ring-1 ring-primary/30' : 'opacity-70'}`}>
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="text-xl">💎</span>
                <span className="font-semibold">Natural Diamonds</span>
              </div>
              <Switch checked={diamondType.naturalEnabled} onCheckedChange={(v) => update({ naturalEnabled: v })} />
            </div>
            <p className="text-sm text-muted-foreground">Earth-mined diamonds with traditional value</p>
            {diamondType.naturalEnabled && (
              <Badge className="mt-2 bg-primary/10 text-primary border-primary/20">Enabled</Badge>
            )}
          </CardContent>
        </Card>

        {/* Lab-Grown */}
        <Card className={`relative transition-all ${diamondType.labGrownEnabled ? 'border-primary ring-1 ring-primary/30' : 'opacity-70'}`}>
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="text-xl">🔬</span>
                <span className="font-semibold">Lab-Grown Diamonds</span>
              </div>
              <Switch checked={diamondType.labGrownEnabled} onCheckedChange={(v) => update({ labGrownEnabled: v })} />
            </div>
            <p className="text-sm text-muted-foreground">Ethically created in controlled environments</p>
            {diamondType.labGrownEnabled && (
              <Badge className="mt-2 bg-primary/10 text-primary border-primary/20">Enabled</Badge>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
