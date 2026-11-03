import { useRef, useState } from 'react';
import { ImageIcon, Loader2, X } from 'lucide-react';
import {
  ACCEPTED_OVERRIDE_INPUT_ACCEPT,
  uploadOptionOverride,
  type OverrideScope,
} from '@/lib/option-image-overrides';

interface OptionOverrideControlProps {
  scope: OverrideScope;
  clientId: string | null | undefined;
  stepKey: string;
  optionValue: string;
  optionLabel: string;
  /** Current override URL (if any) for this option. */
  overrideUrl?: string;
  /** Default/master image to display when no override is set (thumbnail preview). */
  defaultUrl?: string;
  onUploaded: (url: string) => void;
  onReset: () => void;
}

export function OptionOverrideControl({
  scope, clientId, stepKey, optionValue, optionLabel,
  overrideUrl, defaultUrl, onUploaded, onReset,
}: OptionOverrideControlProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handleFile = async (file: File) => {
    if (!clientId) return;
    setUploading(true);
    const url = await uploadOptionOverride({ scope, clientId, stepKey, optionValue, file });
    setUploading(false);
    if (url) onUploaded(url);
  };

  const previewUrl = overrideUrl || defaultUrl;

  return (
    <div className="flex items-center gap-1">
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_OVERRIDE_INPUT_ACCEPT}
        className="hidden"
        onChange={async e => {
          const f = e.target.files?.[0];
          if (f) await handleFile(f);
          if (inputRef.current) inputRef.current.value = '';
        }}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={uploading || !clientId}
        className={`relative w-7 h-7 rounded border flex items-center justify-center transition-colors ${
          overrideUrl
            ? 'border-primary/60 bg-primary/5'
            : 'border-dashed border-muted-foreground/30 hover:border-muted-foreground/60'
        }`}
        title={overrideUrl ? `Replace custom image for "${optionLabel}"` : `Upload custom image for "${optionLabel}" (PNG/WEBP/JPEG, ≤2MB, 300×300)`}
      >
        {uploading ? (
          <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
        ) : previewUrl ? (
          <img src={previewUrl} alt="" className="w-full h-full object-contain p-0.5" />
        ) : (
          <ImageIcon className="h-3 w-3 text-muted-foreground" />
        )}
      </button>
      {overrideUrl && (
        <button
          type="button"
          onClick={onReset}
          className="w-5 h-5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors flex items-center justify-center"
          title="Reset to default image"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}
