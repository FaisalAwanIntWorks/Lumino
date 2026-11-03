import { Label } from '@/components/ui/label';
import { AI_IMAGE_DELIVERY_OPTIONS, type AiImageDelivery } from '@/lib/ai-image-delivery';

interface AiImageDeliveryEditorProps {
  value: AiImageDelivery;
  onChange: (next: AiImageDelivery) => void;
}

/**
 * Configurator block: "Do you want to show AI Generated Image on Email or
 * Thank You Page?" Shared by the Grillz Builder and Custom Enquiry configurators.
 */
export function AiImageDeliveryEditor({ value, onChange }: AiImageDeliveryEditorProps) {
  const selected = AI_IMAGE_DELIVERY_OPTIONS.find(opt => opt.value === value);

  return (
    <div className="space-y-3">
      <Label className="text-sm font-semibold text-foreground">
        Do you want to show AI Generated Image on Email or Thank You Page?
      </Label>
      <div className="grid grid-cols-2 gap-2">
        {AI_IMAGE_DELIVERY_OPTIONS.map(opt => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={`p-3 rounded-lg border-2 text-left transition-all ${
              value === opt.value
                ? 'border-primary bg-primary/5'
                : 'border-border/50 hover:border-primary/30'
            }`}
          >
            <span className="text-lg">{opt.icon}</span>
            <p className="text-xs font-medium text-foreground mt-1">{opt.label}</p>
          </button>
        ))}
      </div>
      {selected && <p className="text-[11px] text-muted-foreground">{selected.hint}</p>}
    </div>
  );
}
