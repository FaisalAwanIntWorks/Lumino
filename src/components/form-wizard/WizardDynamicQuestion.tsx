import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CardCarousel } from '@/components/form-wizard/CardCarousel';
import { WizardSelectField } from '@/components/form-wizard/WizardSelectField';
import { AiVisionTextarea } from '@/components/form-wizard/AiVisionTextarea';
import { Loader2 } from 'lucide-react';

export interface DynamicQuestionConfig {
  id: string;
  question_text: string;
  question_key: string;
  question_type: string;
  is_enabled: boolean;
  is_required: boolean;
  display_order: number;
  has_text_followup: boolean;
  has_file_followup: boolean;
  is_default: boolean;
  options?: string[] | any;
  option_images?: Record<string, string> | null;
  subtitle?: string;
}

interface WizardDynamicQuestionProps {
  question: DynamicQuestionConfig;
  answer: boolean | null;
  textValue: string;
  fileValue: File | null;
  onAnswerChange: (v: boolean) => void;
  onTextChange: (v: string) => void;
  onFileChange: (v: File | null) => void;
  accentColor: string;
  fontColor: string;
  hideLabel?: boolean;
  /** URL of the already-uploaded file (for immediate-upload flows) */
  fileUrl?: string | null;
  /** Display name of the already-uploaded file */
  fileName?: string | null;
  /** Whether a file upload is currently in progress */
  isUploading?: boolean;
}

export function WizardDynamicQuestion({
  question, answer, textValue, fileValue,
  onAnswerChange, onTextChange, onFileChange,
  accentColor, fontColor, hideLabel,
  fileUrl, fileName, isUploading,
}: WizardDynamicQuestionProps) {
  const options: string[] = Array.isArray(question.options) ? question.options : [];

  const requiredMark = question.is_required ? ' *' : '';

  if (question.question_type === 'file') {
    return (
      <div className="space-y-2">
        {!hideLabel && <Label className="text-sm font-medium" style={{ color: fontColor }}>{question.question_text}{requiredMark}</Label>}
        <Input type="file" accept="image/*" onChange={e => onFileChange(e.target.files?.[0] ?? null)} className="cursor-pointer bg-transparent border-2 rounded-xl file:text-current" style={{ backgroundColor: 'transparent', color: fontColor, borderColor: `${fontColor}26` }} />
        {isUploading && (
          <div className="flex items-center gap-2">
            <Loader2 className="h-3 w-3 animate-spin" style={{ color: accentColor }} />
            <p className="text-xs" style={{ color: `${fontColor}80` }}>Uploading...</p>
          </div>
        )}
        {fileName && !isUploading && <p className="text-xs" style={{ color: `${fontColor}80` }}>✓ {fileName}</p>}
        {!fileName && fileValue && !isUploading && <p className="text-xs" style={{ color: `${fontColor}80` }}>{fileValue.name}</p>}
      </div>
    );
  }

  if (question.question_type === 'text') {
    const isVisionQuestion = ['custom_message', 'description'].includes(question.question_key);
    if (isVisionQuestion) {
      return (
        <AiVisionTextarea
          label={question.question_text}
          value={textValue}
          onChange={onTextChange}
          placeholder="Describe your dream piece..."
          rows={3}
          maxLength={500}
          accentColor={accentColor}
          fontColor={fontColor}
        />
      );
    }
    return (
      <div className="space-y-2">
        {!hideLabel && <Label className="text-sm font-medium" style={{ color: fontColor }}>{question.question_text}{requiredMark}</Label>}
        <Input value={textValue} onChange={e => onTextChange(e.target.value)} placeholder="Enter details..." maxLength={200} className="bg-transparent border-2 rounded-lg" style={{ backgroundColor: 'transparent', borderColor: `${fontColor}26`, color: fontColor }} />
      </div>
    );
  }

  if (question.question_type === 'dropdown' && options.length > 0) {
    return (
      <WizardSelectField
        label={hideLabel ? '' : question.question_text}
        value={textValue}
        onValueChange={onTextChange}
        options={options.map(o => ({ value: o, label: o }))}
        accentColor={accentColor}
        fontColor={fontColor}
      />
    );
  }

  if (question.question_type === 'custom_options' && options.length > 0) {
    const optionImages = question.option_images || null;
    const hasImages = optionImages && Object.values(optionImages).some(Boolean);
    if (hasImages) {
      return (
        <div className="space-y-2">
          {!hideLabel && <Label className="text-sm font-medium" style={{ color: fontColor }}>{question.question_text}{requiredMark}</Label>}
          <CardCarousel
            cards={options.map(opt => ({
              value: opt,
              label: opt,
              image: optionImages[opt] || undefined,
            }))}
            selectedValue={textValue}
            onSelect={onTextChange}
            accentColor={accentColor}
            fontColor={fontColor}
          />
        </div>
      );
    }
    return (
      <div className="space-y-2">
        {!hideLabel && <Label className="text-sm font-medium" style={{ color: fontColor }}>{question.question_text}{requiredMark}</Label>}
        <div className="flex flex-wrap gap-2">
          {options.map(opt => (
            <button
              key={opt}
              type="button"
              onClick={() => onTextChange(opt)}
              className="px-4 py-2 rounded-lg text-sm font-semibold transition-all border-2"
              style={{
                backgroundColor: textValue === opt ? accentColor : 'transparent',
                borderColor: textValue === opt ? accentColor : 'rgba(255,255,255,0.15)',
                color: textValue === opt ? '#fff' : fontColor,
              }}
            >
              {opt}
            </button>
          ))}
        </div>
      </div>
    );
  }

  // Default: yes/no
  return (
    <div className="space-y-2">
      <WizardYesNo label={hideLabel ? '' : `${question.question_text}${requiredMark}`} value={answer} onChange={onAnswerChange} accentColor={accentColor} fontColor={fontColor} />
      {answer && question.has_text_followup && (
        <Input value={textValue} onChange={e => onTextChange(e.target.value)} placeholder="Enter details..." maxLength={100} className="bg-transparent border-2 rounded-lg ml-1" style={{ backgroundColor: 'transparent', borderColor: `${fontColor}26`, color: fontColor }} />
      )}
      {answer && question.has_file_followup && (
        <Input type="file" accept="image/*" onChange={e => onFileChange(e.target.files?.[0] ?? null)} className="cursor-pointer ml-1 bg-transparent border-2 rounded-xl file:text-current" style={{ backgroundColor: 'transparent', color: fontColor, borderColor: `${fontColor}26` }} />
      )}
    </div>
  );
}

function WizardYesNo({ label, value, onChange, accentColor, fontColor }: {
  label: string; value: boolean | null; onChange: (v: boolean) => void; accentColor: string; fontColor: string;
}) {
  return (
    <div className="space-y-2">
      {label && <Label className="text-sm font-medium" style={{ color: fontColor }}>{label}</Label>}
      <div className="flex gap-2">
        {[true, false].map(v => (
          <button
            key={String(v)}
            type="button"
            onClick={() => onChange(v)}
            className="px-5 py-2 rounded-lg text-sm font-semibold transition-all border-2"
            style={{
              backgroundColor: value === v ? accentColor : 'transparent',
              borderColor: value === v ? accentColor : 'rgba(255,255,255,0.15)',
              color: value === v ? '#fff' : fontColor,
            }}
          >
            {v ? 'Yes' : 'No'}
          </button>
        ))}
      </div>
    </div>
  );
}
