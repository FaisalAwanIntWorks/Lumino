import { useState } from 'react';
import { Ring3DViewer } from '@/components/ring-builder/Ring3DViewer';
import { ChatAssistant } from '@/components/ring-builder/ChatAssistant';
import { ColorSelector, METAL_COLORS } from '@/components/3d-viewer/ColorSelector';
import { Button } from '@/components/ui/button';
import { Sparkles, X } from 'lucide-react';

const Ring3DDemo = () => {
  const [showChat, setShowChat] = useState(false);
  const [selectedColor, setSelectedColor] = useState(METAL_COLORS[0].color);

  return (
    <div className="h-screen w-screen flex flex-col bg-black overflow-hidden">
      {/* 3D Viewer - Full screen */}
      <div className="flex-1 relative min-h-0">
        {/* 3D model removed from repo for size – re-host externally and update path */}
        <div className="w-full h-full flex items-center justify-center">
          <p className="text-white/70 text-sm">3D model not available — upload via Asset Sheet to enable</p>
        </div>
        
        {/* Floating header */}
        <div className="absolute top-4 left-4 right-4 flex items-center justify-between">
          <div className="text-white">
            <h1 className="text-2xl font-bold tracking-tight">Radiant Ring</h1>
            <p className="text-sm text-white/70">Explore in 3D • Powered by Aurezo AI</p>
          </div>
          
          {!showChat && (
            <Button
              onClick={() => setShowChat(true)}
              className="bg-primary hover:bg-primary/90 text-white gap-2"
            >
              <Sparkles className="w-4 h-4" />
              Ask AI Assistant
            </Button>
          )}
        </div>

        {/* Color Selector */}
        <div className="absolute bottom-20 left-1/2 -translate-x-1/2">
          <ColorSelector 
            selectedColor={selectedColor} 
            onColorChange={setSelectedColor} 
          />
        </div>

        {/* 3D Controls hint */}
        <div className="absolute bottom-4 left-4 text-white/60 text-sm">
          <p>Click + Drag to rotate • Scroll to zoom</p>
        </div>
      </div>

      {/* AI Chat Assistant - Side panel */}
      {showChat && (
        <div className="w-full md:w-[400px] h-full bg-background border-l border-border flex flex-col">
          <ChatAssistant 
            onClose={() => setShowChat(false)}
          />
        </div>
      )}
    </div>
  );
};

export default Ring3DDemo;
