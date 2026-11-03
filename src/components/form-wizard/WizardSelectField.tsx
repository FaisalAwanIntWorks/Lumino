import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface WizardSelectFieldProps {
  label: string;
  value: string;
  onValueChange: (v: string) => void;
  options: { value: string; label: string; note?: string }[];
  placeholder?: string;
  accentColor?: string;
  fontColor?: string;
}

export function WizardSelectField({
  label,
  value,
  onValueChange,
  options,
  placeholder = 'Select...',
  accentColor,
  fontColor,
}: WizardSelectFieldProps) {
  const accent = accentColor || 'hsl(142, 53%, 53%)';
  const font = fontColor || '#ffffff';

  return (
    <div className="space-y-2 w-full">
      <Label className="text-sm font-semibold uppercase tracking-wider" style={{ color: `${font}99` }}>
        {label}
      </Label>
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger
          className="h-12 rounded-xl border-2 bg-transparent text-base font-medium"
          style={{ borderColor: value ? accent : 'rgba(255,255,255,0.15)', color: font }}
        >
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              <span className="flex flex-col items-start text-left">
                <span>{o.label}</span>
                {o.note && <span className="text-[11px] text-muted-foreground leading-tight">{o.note}</span>}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
