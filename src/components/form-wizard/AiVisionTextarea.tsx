import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

interface AiVisionTextareaProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
  maxLength?: number;
  accentColor: string;
  fontColor: string;
  helperText?: string;
}

export function AiVisionTextarea({
  label,
  value,
  onChange,
  placeholder = 'Describe your vision...',
  rows = 4,
  maxLength,
  accentColor,
  fontColor,
  helperText = 'This helps create your AI preview',
}: AiVisionTextareaProps) {
  return (
    <div
      className="p-4 rounded-xl space-y-2"
      style={{
        border: `1px solid ${accentColor}4D`,
        boxShadow: `0 0 12px ${accentColor}30, 0 0 4px ${accentColor}20`,
      }}
    >
      <p
        className="text-[10px] md:text-xs font-bold uppercase tracking-wider"
        style={{ color: accentColor }}
      >
        {helperText}
      </p>
      <Label
        className="text-sm font-semibold uppercase tracking-wider"
        style={{ color: `${fontColor}99` }}
      >
        {label}
      </Label>
      <Textarea
        value={value}
        onChange={(e) => onChange(maxLength ? e.target.value.slice(0, maxLength) : e.target.value)}
        placeholder={placeholder}
        rows={rows}
        className="bg-transparent border-2 rounded-xl"
        style={{
          borderColor: `${accentColor}40`,
          color: fontColor,
        }}
      />
      {maxLength && (
        <p className="text-[8px] md:text-[10px] text-right" style={{ color: `${fontColor}60` }}>
          {value.length}/{maxLength}
        </p>
      )}
    </div>
  );
}
