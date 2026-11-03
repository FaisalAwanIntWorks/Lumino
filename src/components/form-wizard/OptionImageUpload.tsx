import { useRef } from 'react';
import { ImageIcon, Loader2 } from 'lucide-react';

interface OptionImageUploadProps {
  optionLabel: string;
  clientId: string | null;
  isUploading: boolean;
  onUpload: (file: File) => Promise<void>;
}

export function OptionImageUpload({ optionLabel, clientId, isUploading, onUpload }: OptionImageUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/webp,image/jpeg"
        className="hidden"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (file) await onUpload(file);
          if (inputRef.current) inputRef.current.value = '';
        }}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={isUploading || !clientId}
        className="w-8 h-8 rounded border border-dashed border-muted-foreground/30 flex items-center justify-center hover:border-muted-foreground/60 transition-colors"
        title={`Upload image for "${optionLabel}"`}
      >
        {isUploading ? (
          <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
        ) : (
          <ImageIcon className="h-3 w-3 text-muted-foreground" />
        )}
      </button>
    </>
  );
}
