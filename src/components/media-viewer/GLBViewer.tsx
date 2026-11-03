import { Suspense, useState, useCallback, Component, ReactNode } from 'react';
import { Canvas } from '@react-three/fiber';
import { Environment } from '@react-three/drei';
import * as THREE from 'three';
import { SmartGLBModel } from '@/components/3d-viewer/SmartGLBModel';
import { CameraController } from '@/components/3d-viewer/CameraController';
import { OrbitControlsWithDamping } from '@/components/3d-viewer/OrbitControlsWithDamping';
import { LoadingSpinner } from '@/components/3d-viewer/LoadingSpinner';
import { JEWELRY_SCENE_CONFIG, type EnvironmentPreset } from '@/components/3d-viewer/sceneConfig';
import { Loader2, AlertCircle, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ModelInfo {
  boundingBox: THREE.Box3;
  maxDimension: number;
  center: THREE.Vector3;
}

interface GLBViewerProps {
  glbUrl: string;
  autoRotate?: boolean;
  showControls?: boolean;
  environmentPreset?: EnvironmentPreset;
}

// Error boundary for 3D rendering
class ModelErrorBoundary extends Component<
  { children: ReactNode; onError?: () => void },
  { hasError: boolean }
> {
  constructor(props: { children: ReactNode; onError?: () => void }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    console.error('3D Model Error:', error);
    this.props.onError?.();
  }

  render() {
    if (this.state.hasError) {
      return (
        <mesh>
          <boxGeometry args={[1, 1, 1]} />
          {/* @ts-ignore - R3F JSX intrinsic typing mismatch */}
          <meshStandardMaterial color="#ef4444" />
        </mesh>
      );
    }
    return this.props.children;
  }
}

const config = JEWELRY_SCENE_CONFIG;

export function GLBViewer({ 
  glbUrl, 
  autoRotate = false,
  showControls = true,
  environmentPreset = config.environment.preset
}: GLBViewerProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [boundingBox, setBoundingBox] = useState<THREE.Box3 | null>(null);
  const [resetTrigger, setResetTrigger] = useState(0);

  const handleModelLoaded = useCallback((info: ModelInfo) => {
    setBoundingBox(info.boundingBox);
    setIsLoading(false);
  }, []);

  const handleResetView = useCallback(() => {
    setResetTrigger(prev => prev + 1);
  }, []);

  const handleError = useCallback(() => {
    setHasError(true);
    setIsLoading(false);
  }, []);

  if (hasError) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-background/50 rounded-lg">
        <AlertCircle className="w-12 h-12 text-destructive mb-4" />
        <p className="text-muted-foreground text-center">Failed to load 3D model</p>
        <p className="text-sm text-muted-foreground/60 mt-1">{glbUrl}</p>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full" style={{ background: config.background.color }}>
      {/* Loading overlay */}
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/80 z-10 rounded-lg">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <span className="text-sm text-muted-foreground">Loading 3D model...</span>
          </div>
        </div>
      )}

      {/* Reset button */}
      {showControls && !isLoading && (
        <Button
          variant="outline"
          size="icon"
          className="absolute top-3 right-3 z-10 bg-background/80 backdrop-blur-sm"
          onClick={handleResetView}
        >
          <RotateCcw className="w-4 h-4" />
        </Button>
      )}

      {/* Canvas with WebGi-matched settings */}
      <Canvas
        camera={{ 
          position: config.camera.position, 
          fov: config.camera.fov, 
          near: config.camera.near, 
          far: config.camera.far 
        }}
        gl={{
          antialias: true,
          alpha: config.background.transparent,
          toneMapping: config.toneMapping.type,
          toneMappingExposure: config.toneMapping.exposure,
          outputColorSpace: THREE.SRGBColorSpace,
        }}
        dpr={[1, 2]}
        style={{ touchAction: 'none' }}
      >
        <Suspense fallback={<LoadingSpinner />}>
          <Environment 
            preset={environmentPreset} 
            background={false}
            environmentIntensity={config.environment.intensity}
          />
          
          {/* Additional lighting */}
          <ambientLight intensity={0.4} />
          <directionalLight position={[5, 5, 5]} intensity={0.8} />
          <directionalLight position={[-5, 3, -5]} intensity={0.4} />
          
          <ModelErrorBoundary onError={handleError}>
            <SmartGLBModel 
              modelPath={glbUrl} 
              onLoaded={handleModelLoaded} 
            />
          </ModelErrorBoundary>
          
          <CameraController 
            boundingBox={boundingBox} 
            resetTrigger={resetTrigger} 
          />
          
          <OrbitControlsWithDamping
            autoRotate={autoRotate}
            autoRotateSpeed={config.orbitControls.autoRotateSpeed}
            minDistance={config.orbitControls.minDistance}
            maxDistance={config.orbitControls.maxDistance}
            enablePan={config.orbitControls.enablePan}
            dampingFactor={config.orbitControls.dampingFactor}
            rotateSpeed={config.orbitControls.rotateSpeed}
            zoomSpeed={config.orbitControls.zoomSpeed}
          />
        </Suspense>
      </Canvas>

      {/* Controls hint */}
      {showControls && !isLoading && (
        <div className="absolute bottom-3 left-3 text-xs text-muted-foreground/60 bg-background/60 backdrop-blur-sm px-2 py-1 rounded">
          Drag to rotate • Scroll to zoom
        </div>
      )}
    </div>
  );
}
