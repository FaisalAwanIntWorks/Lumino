import { useState, useRef } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Upload, X } from 'lucide-react';

interface DiamondInspirationStepProps {
  inspirationImages: File[];
  ringSize: string;
  otherDetails: string;
  onUpdate: (data: { inspirationImages: File[]; ringSize: string; otherDetails: string }) => void;
  onNext: () => void;
  onBack: () => void;
}

export const DiamondInspirationStep = ({ 
  inspirationImages, 
  ringSize, 
  otherDetails, 
  onUpdate,
  onNext,
  onBack 
}: DiamondInspirationStepProps) => {
  const [localImages, setLocalImages] = useState<File[]>(inspirationImages);
  // Ring size is collected on its own step now; passed through untouched.
  const localRingSize = ringSize;
  const [localDetails, setLocalDetails] = useState(otherDetails);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (files: FileList | null) => {
    if (files) {
      const newFiles = Array.from(files);
      const updatedImages = [...localImages, ...newFiles];
      setLocalImages(updatedImages);
      onUpdate({ inspirationImages: updatedImages, ringSize: localRingSize, otherDetails: localDetails });
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    handleFileChange(e.dataTransfer.files);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleRemoveImage = (index: number) => {
    const updatedImages = localImages.filter((_, i) => i !== index);
    setLocalImages(updatedImages);
    onUpdate({ inspirationImages: updatedImages, ringSize: localRingSize, otherDetails: localDetails });
  };

  const handleDetailsChange = (value: string) => {
    setLocalDetails(value);
    onUpdate({ inspirationImages: localImages, ringSize: localRingSize, otherDetails: value });
  };

  const handleNext = () => {
    onNext();
  };

  return (
    <Card className="w-full bg-[#EDE8E3] border-none shadow-2xl relative min-h-[100dvh] md:min-h-0">
      <CardContent className="p-4 md:p-8">
        <div className="text-center mb-6">
          <h2 className="text-2xl md:text-3xl font-bold text-gray-900">
            Upload your inspiration images!
          </h2>
        </div>

        {/* File Upload Area */}
        <div
          onClick={() => fileInputRef.current?.click()}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          className={`
            mx-auto max-w-lg mb-8 p-8 border-2 border-dashed rounded-lg cursor-pointer
            transition-all duration-200 flex flex-col items-center justify-center
            ${isDragOver 
              ? 'border-gray-800 bg-black/10' 
              : 'border-gray-400 bg-black/5 hover:bg-black/10'
            }
          `}
        >
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*"
            onChange={(e) => handleFileChange(e.target.files)}
            className="hidden"
          />
          <div className="w-16 h-16 mb-4 bg-black/10 rounded-full flex items-center justify-center">
            <Upload className="w-8 h-8 text-gray-700" />
          </div>
          <p className="text-gray-700 text-center">Drop file here or click to upload</p>
        </div>

        {/* Preview uploaded images */}
        {localImages.length > 0 && (
          <div className="flex flex-wrap gap-3 justify-center mb-8 max-w-lg mx-auto">
            {localImages.map((file, index) => (
              <div key={index} className="relative">
                <img
                  src={URL.createObjectURL(file)}
                  alt={`Inspiration ${index + 1}`}
                  className="w-20 h-20 object-cover rounded-lg"
                />
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRemoveImage(index);
                  }}
                  className="absolute -top-2 -right-2 w-6 h-6 bg-black rounded-full flex items-center justify-center"
                >
                  <X className="w-4 h-4 text-white" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Ring size moved to its own step (DiamondRingSizeStep). */}

        {/* Other Details Textarea */}
        <div className="max-w-lg mx-auto mb-8">
          <h3 className="text-xl md:text-2xl font-bold text-gray-900 text-center mb-4">
            Any other details we should know?
          </h3>
          <Textarea
            value={localDetails}
            onChange={(e) => handleDetailsChange(e.target.value)}
            placeholder="Enter any additional details..."
            className="bg-white border-none text-gray-800 placeholder:text-gray-400 min-h-[150px] text-lg resize-none"
          />
        </div>

        <div className="flex justify-center gap-3">
          <Button
            variant="secondary"
            onClick={onBack}
            className="bg-black text-white hover:bg-gray-900 px-6 md:px-8 border border-black"
          >
            Back
          </Button>
          <Button
            onClick={handleNext}
            className="bg-black text-white hover:bg-gray-900 px-6 md:px-8 border border-black"
          >
            Next
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};