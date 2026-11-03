import { useState, useMemo } from 'react';
import { Box, Image, Video } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { GLBViewer } from './GLBViewer';
import { ImageGallery } from './ImageGallery';
import { VideoPlayer } from './VideoPlayer';

interface MediaViewerWidgetProps {
  glbUrl?: string;
  images?: string[];
  videoUrl?: string;
  videoPoster?: string;
  title?: string;
  defaultView?: '3d' | 'images' | 'video';
  className?: string;
  height?: string;
  autoRotate?: boolean;
  environmentPreset?: 'studio' | 'sunset' | 'dawn' | 'night' | 'warehouse' | 'forest' | 'apartment' | 'city' | 'park' | 'lobby';
}

export function MediaViewerWidget({
  glbUrl,
  images = [],
  videoUrl,
  videoPoster,
  title,
  defaultView,
  className,
  height = '500px',
  autoRotate = false,
  environmentPreset = 'studio',
}: MediaViewerWidgetProps) {
  // Determine available tabs
  const availableTabs = useMemo(() => {
    const tabs: Array<{ id: '3d' | 'images' | 'video'; label: string; icon: typeof Box }> = [];
    
    if (glbUrl) {
      tabs.push({ id: '3d', label: '3D Model', icon: Box });
    }
    if (images.length > 0) {
      tabs.push({ id: 'images', label: 'Images', icon: Image });
    }
    if (videoUrl) {
      tabs.push({ id: 'video', label: 'Video', icon: Video });
    }
    
    return tabs;
  }, [glbUrl, images.length, videoUrl]);

  // Determine default tab
  const resolvedDefaultView = useMemo(() => {
    if (defaultView && availableTabs.some(t => t.id === defaultView)) {
      return defaultView;
    }
    return availableTabs[0]?.id || '3d';
  }, [defaultView, availableTabs]);

  const [activeTab, setActiveTab] = useState<string>(resolvedDefaultView);

  // No media available
  if (availableTabs.length === 0) {
    return (
      <Card className={cn('', className)}>
        {title && (
          <CardHeader>
            <CardTitle>{title}</CardTitle>
          </CardHeader>
        )}
        <CardContent>
          <div 
            className="flex items-center justify-center bg-muted/20 rounded-lg"
            style={{ height }}
          >
            <p className="text-muted-foreground">No media available</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Single media type - no tabs needed
  if (availableTabs.length === 1) {
    return (
      <Card className={cn('', className)}>
        {title && (
          <CardHeader>
            <CardTitle>{title}</CardTitle>
          </CardHeader>
        )}
        <CardContent>
          <div style={{ height }} className="rounded-lg overflow-hidden">
            {glbUrl && (
              <GLBViewer 
                glbUrl={glbUrl} 
                autoRotate={autoRotate}
                environmentPreset={environmentPreset}
              />
            )}
            {!glbUrl && images.length > 0 && (
              <ImageGallery images={images} alt={title} />
            )}
            {!glbUrl && images.length === 0 && videoUrl && (
              <VideoPlayer videoUrl={videoUrl} poster={videoPoster} />
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  // Multiple media types - show tabs
  return (
    <Card className={cn('', className)}>
      {title && (
        <CardHeader className="pb-2">
          <CardTitle>{title}</CardTitle>
        </CardHeader>
      )}
      <CardContent>
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="w-full justify-start mb-4">
            {availableTabs.map(tab => (
              <TabsTrigger 
                key={tab.id} 
                value={tab.id}
                className="flex items-center gap-2"
              >
                <tab.icon className="w-4 h-4" />
                <span className="hidden sm:inline">{tab.label}</span>
              </TabsTrigger>
            ))}
          </TabsList>

          {glbUrl && (
            <TabsContent value="3d" className="mt-0">
              <div style={{ height }} className="rounded-lg overflow-hidden">
                <GLBViewer 
                  glbUrl={glbUrl} 
                  autoRotate={autoRotate}
                  environmentPreset={environmentPreset}
                />
              </div>
            </TabsContent>
          )}

          {images.length > 0 && (
            <TabsContent value="images" className="mt-0">
              <div style={{ height }} className="rounded-lg overflow-hidden">
                <ImageGallery images={images} alt={title} />
              </div>
            </TabsContent>
          )}

          {videoUrl && (
            <TabsContent value="video" className="mt-0">
              <div style={{ height }} className="rounded-lg overflow-hidden">
                <VideoPlayer videoUrl={videoUrl} poster={videoPoster} />
              </div>
            </TabsContent>
          )}
        </Tabs>
      </CardContent>
    </Card>
  );
}
