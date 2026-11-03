import { useState, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Upload, X, Copy, Trash2, FileVideo, FileImage, Box, CheckCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

const STYLES = ['solitaire', 'three-stone', 'halo', 'pave-rail'];
const SHANKS = ['high-polish', 'castel-pave', '3-row-pave', 'tapered', 'eternity', 'marquise-cut'];
const COLORS = ['yellow', 'rose', 'white'];
const SHAPES = ['round', 'oval', 'princess', 'radiant', 'emerald', 'cushion', 'pear', 'marquise'];

const FILE_TYPES = [
  { value: 'angle-0', label: 'Angle 0 (Front)' },
  { value: 'angle-1', label: 'Angle 1 (Side)' },
  { value: 'angle-2', label: 'Angle 2 (Back)' },
  { value: 'angle-3', label: 'Angle 3 (Top)' },
  { value: 'video', label: 'Video (MP4)' },
  { value: 'model', label: '3D Model (GLB/OBJ)' },
  { value: 'transparent-0', label: 'Transparent 0' },
  { value: 'transparent-1', label: 'Transparent 1' },
  { value: 'transparent-2', label: 'Transparent 2' },
  { value: 'transparent-3', label: 'Transparent 3' },
  { value: 'model-photo', label: 'Model Photo' },
];

interface UploadedFile {
  name: string;
  path: string;
  url: string;
  size: number;
  type: string;
}

export default function AssetUpload() {
  const [style, setStyle] = useState('');
  const [shank, setShank] = useState('');
  const [color, setColor] = useState('');
  const [shape, setShape] = useState('');
  const [fileType, setFileType] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);

  const isFormValid = style && shank && color && shape && fileType && file;

  const generatePath = () => {
    if (!style || !shank || !color || !shape || !fileType || !file) return '';
    const ext = file.name.split('.').pop()?.toLowerCase() || 'png';
    const filename = `${style}-${shank}-${color}-${shape}-${fileType}.${ext}`;
    return `rings/${style}/${shank}/${color}/${shape}/${filename}`;
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) {
      setFile(droppedFile);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
    }
  };

  const handleUpload = async () => {
    if (!isFormValid) {
      toast.error('Please fill all fields and select a file');
      return;
    }

    const path = generatePath();
    if (!path) return;

    setUploading(true);
    setProgress(0);

    try {
      // Simulate progress for better UX (Supabase doesn't provide upload progress)
      const progressInterval = setInterval(() => {
        setProgress(prev => Math.min(prev + 10, 90));
      }, 200);

      const { data, error } = await supabase.storage
        .from('ring-assets')
        .upload(path, file!, {
          cacheControl: '3600',
          upsert: true,
        });

      clearInterval(progressInterval);

      if (error) {
        throw error;
      }

      setProgress(100);

      const { data: urlData } = supabase.storage
        .from('ring-assets')
        .getPublicUrl(data.path);

      const uploadedFile: UploadedFile = {
        name: file!.name,
        path: data.path,
        url: urlData.publicUrl,
        size: file!.size,
        type: fileType,
      };

      setUploadedFiles(prev => [uploadedFile, ...prev]);
      toast.success('File uploaded successfully!');
      
      // Reset form
      setFile(null);
      setProgress(0);
    } catch (error: any) {
      console.error('Upload error:', error);
      toast.error(error.message || 'Failed to upload file');
    } finally {
      setUploading(false);
    }
  };

  const handleCopyUrl = (url: string) => {
    navigator.clipboard.writeText(url);
    toast.success('URL copied to clipboard');
  };

  const handleDelete = async (path: string) => {
    try {
      const { error } = await supabase.storage
        .from('ring-assets')
        .remove([path]);

      if (error) throw error;

      setUploadedFiles(prev => prev.filter(f => f.path !== path));
      toast.success('File deleted');
    } catch (error: any) {
      toast.error(error.message || 'Failed to delete file');
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getFileIcon = (type: string) => {
    if (type === 'video') return <FileVideo className="h-4 w-4" />;
    if (type === 'model') return <Box className="h-4 w-4" />;
    return <FileImage className="h-4 w-4" />;
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Asset Upload</h1>
        <p className="text-muted-foreground mt-1">
          Upload ring assets (images, videos, 3D models) to cloud storage
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Upload Form */}
          <Card>
            <CardHeader>
              <CardTitle>Upload New Asset</CardTitle>
              <CardDescription>
                Select the ring combination and file type, then upload your asset
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Combination Selectors */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Style</Label>
                  <Select value={style} onValueChange={setStyle}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select style" />
                    </SelectTrigger>
                    <SelectContent>
                      {STYLES.map(s => (
                        <SelectItem key={s} value={s}>{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Shank</Label>
                  <Select value={shank} onValueChange={setShank}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select shank" />
                    </SelectTrigger>
                    <SelectContent>
                      {SHANKS.map(s => (
                        <SelectItem key={s} value={s}>{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Color</Label>
                  <Select value={color} onValueChange={setColor}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select color" />
                    </SelectTrigger>
                    <SelectContent>
                      {COLORS.map(c => (
                        <SelectItem key={c} value={c}>{c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Shape</Label>
                  <Select value={shape} onValueChange={setShape}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select shape" />
                    </SelectTrigger>
                    <SelectContent>
                      {SHAPES.map(s => (
                        <SelectItem key={s} value={s}>{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* File Type */}
              <div className="space-y-2">
                <Label>File Type</Label>
                <Select value={fileType} onValueChange={setFileType}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select file type" />
                  </SelectTrigger>
                  <SelectContent>
                    {FILE_TYPES.map(ft => (
                      <SelectItem key={ft.value} value={ft.value}>{ft.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Drop Zone */}
              <div
                className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                  isDragging 
                    ? 'border-primary bg-primary/10' 
                    : 'border-border hover:border-primary/50'
                }`}
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
              >
                {file ? (
                  <div className="flex items-center justify-center gap-3">
                    {getFileIcon(fileType)}
                    <span className="font-medium">{file.name}</span>
                    <Badge variant="secondary">{formatFileSize(file.size)}</Badge>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setFile(null)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Upload className="h-8 w-8 mx-auto text-muted-foreground" />
                    <p className="text-muted-foreground">
                      Drag & drop your file here, or{' '}
                      <label className="text-primary cursor-pointer hover:underline">
                        browse
                        <input
                          type="file"
                          className="hidden"
                          accept=".png,.jpg,.jpeg,.webp,.mp4,.glb,.obj"
                          onChange={handleFileSelect}
                        />
                      </label>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      PNG, JPG, MP4, GLB, OBJ up to 500MB
                    </p>
                  </div>
                )}
              </div>

              {/* Generated Path Preview */}
              {isFormValid && (
                <div className="p-3 bg-muted rounded-lg">
                  <p className="text-xs text-muted-foreground mb-1">File will be saved as:</p>
                  <code className="text-sm text-foreground break-all">{generatePath()}</code>
                </div>
              )}

              {/* Progress */}
              {uploading && (
                <div className="space-y-2">
                  <Progress value={progress} />
                  <p className="text-sm text-muted-foreground text-center">
                    Uploading... {progress}%
                  </p>
                </div>
              )}

              {/* Upload Button */}
              <Button
                className="w-full"
                onClick={handleUpload}
                disabled={!isFormValid || uploading}
              >
                {uploading ? 'Uploading...' : 'Upload Asset'}
              </Button>
            </CardContent>
          </Card>

          {/* Recently Uploaded */}
          <Card>
            <CardHeader>
              <CardTitle>Recently Uploaded</CardTitle>
              <CardDescription>
                Files uploaded in this session
              </CardDescription>
            </CardHeader>
            <CardContent>
              {uploadedFiles.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <CheckCircle className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>No files uploaded yet</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {uploadedFiles.map((f, i) => (
                    <div key={i} className="flex items-center gap-3 p-3 bg-muted rounded-lg">
                      {getFileIcon(f.type)}
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{f.name}</p>
                        <p className="text-xs text-muted-foreground truncate">{f.path}</p>
                      </div>
                      <Badge variant="outline">{formatFileSize(f.size)}</Badge>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleCopyUrl(f.url)}
                        title="Copy URL"
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(f.path)}
                        title="Delete"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
  );
}
