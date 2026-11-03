import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RotateCw, Grid3X3, Image, RotateCcw } from 'lucide-react';

export type EnvironmentPreset = 
  | 'studio' 
  | 'city' 
  | 'sunset' 
  | 'dawn' 
  | 'night' 
  | 'warehouse' 
  | 'apartment' 
  | 'forest' 
  | 'park'
  | 'lobby';

interface ViewerControlsProps {
  // Environment
  envPreset: EnvironmentPreset;
  onEnvPresetChange: (preset: EnvironmentPreset) => void;
  showBackground: boolean;
  onShowBackgroundChange: (show: boolean) => void;
  
  // Grid
  showGrid: boolean;
  onShowGridChange: (show: boolean) => void;
  
  // Auto-rotate
  autoRotate: boolean;
  onAutoRotateChange: (rotate: boolean) => void;
  
  // Reset
  onResetView: () => void;
}

const ENV_PRESETS: { value: EnvironmentPreset; label: string }[] = [
  { value: 'studio', label: 'Studio' },
  { value: 'city', label: 'City' },
  { value: 'sunset', label: 'Sunset' },
  { value: 'dawn', label: 'Dawn' },
  { value: 'night', label: 'Night' },
  { value: 'warehouse', label: 'Warehouse' },
  { value: 'apartment', label: 'Apartment' },
  { value: 'forest', label: 'Forest' },
  { value: 'park', label: 'Park' },
  { value: 'lobby', label: 'Lobby' },
];

export function ViewerControls({
  envPreset,
  onEnvPresetChange,
  showBackground,
  onShowBackgroundChange,
  showGrid,
  onShowGridChange,
  autoRotate,
  onAutoRotateChange,
  onResetView,
}: ViewerControlsProps) {
  return (
    <div className="flex flex-wrap items-center gap-4 p-3 border-t bg-muted/30">
      {/* Environment Preset */}
      <div className="flex items-center gap-2">
        <Label className="text-xs text-muted-foreground">Environment:</Label>
        <Select value={envPreset} onValueChange={(v) => onEnvPresetChange(v as EnvironmentPreset)}>
          <SelectTrigger className="w-[120px] h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ENV_PRESETS.map((preset) => (
              <SelectItem key={preset.value} value={preset.value} className="text-xs">
                {preset.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      
      {/* Show Background */}
      <div className="flex items-center gap-2">
        <Image className={`h-4 w-4 ${showBackground ? 'text-primary' : 'text-muted-foreground'}`} />
        <Switch 
          checked={showBackground} 
          onCheckedChange={onShowBackgroundChange}
          id="show-bg"
        />
        <Label htmlFor="show-bg" className="text-xs">Background</Label>
      </div>
      
      {/* Show Grid */}
      <div className="flex items-center gap-2">
        <Grid3X3 className={`h-4 w-4 ${showGrid ? 'text-primary' : 'text-muted-foreground'}`} />
        <Switch 
          checked={showGrid} 
          onCheckedChange={onShowGridChange}
          id="show-grid"
        />
        <Label htmlFor="show-grid" className="text-xs">Grid</Label>
      </div>
      
      {/* Auto-rotate */}
      <div className="flex items-center gap-2">
        <RotateCw className={`h-4 w-4 ${autoRotate ? 'text-primary' : 'text-muted-foreground'}`} />
        <Switch 
          checked={autoRotate} 
          onCheckedChange={onAutoRotateChange}
          id="auto-rotate"
        />
        <Label htmlFor="auto-rotate" className="text-xs">Auto-rotate</Label>
      </div>
      
      {/* Reset View */}
      <Button variant="outline" size="sm" onClick={onResetView} className="h-8">
        <RotateCcw className="h-3 w-3 mr-1" />
        Reset
      </Button>
    </div>
  );
}
