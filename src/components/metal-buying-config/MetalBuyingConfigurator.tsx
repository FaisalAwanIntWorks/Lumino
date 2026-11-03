import { MetalBuyingConfigPanel } from './MetalBuyingConfigPanel';
import { useClientMetalBuyingConfig } from '@/hooks/useClientMetalBuyingConfig';
import { RefreshCw } from 'lucide-react';

export function MetalBuyingConfigurator() {
  const { config, isLoading, save, isSaving, defaultMetalsConfig } = useClientMetalBuyingConfig();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      <MetalBuyingConfigPanel
        config={config}
        defaultMetalsConfig={defaultMetalsConfig}
        onSave={save}
        isSaving={isSaving}
      />
    </div>
  );
}
