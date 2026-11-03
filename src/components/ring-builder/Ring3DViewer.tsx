import { Suspense, useState, useCallback, Component, ReactNode, useEffect } from 'react';
import { Canvas } from '@react-three/fiber';
import { Environment } from '@react-three/drei';
import * as THREE from 'three';
import {
  SmartGLBModel,
  CameraController,
  OrbitControlsWithDamping,
  PostProcessingEffects,
  GroundShadow,
  clearGLTFCache,
  type LoaderProfile,
} from '@/components/3d-viewer';
import { JEWELRY_SCENE_CONFIG } from '@/components/3d-viewer/sceneConfig';
import { Button } from '@/components/ui/button';
import { Copy, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

interface Ring3DViewerProps {
  modelPath: string;
  materialColor?: string;
}

const LOADER_PROFILES: LoaderProfile[] = ['full', 'no_meshopt', 'no_ktx2', 'draco_only', 'basic'];

interface ErrorDetails {
  name: string;
  message: string;
  stack?: string;
  modelPath: string;
  loaderProfile: LoaderProfile;
  timestamp: string;
}

// Error Boundary for catching model loading errors
interface ErrorBoundaryProps {
  children: ReactNode;
  onError?: (error: Error) => void;
  fallback?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ModelErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error) {
    console.error('Model loading error:', error);
    this.props.onError?.(error);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback || null;
    }
    return this.props.children;
  }
}

function LoadingFallback() {
  return (
    <mesh>
      <torusGeometry args={[1, 0.3, 16, 100]} />
      {/* @ts-ignore - R3F JSX intrinsic typing mismatch */}
      <meshStandardMaterial color="#d4af37" metalness={0.9} roughness={0.1} />
    </mesh>
  );
}

function ErrorMesh() {
  return (
    <mesh>
      <boxGeometry args={[1, 1, 1]} />
      {/* @ts-ignore - R3F JSX intrinsic typing mismatch */}
      <meshStandardMaterial color="#ff4444" transparent opacity={0.5} />
    </mesh>
  );
}

const config = JEWELRY_SCENE_CONFIG;

export const Ring3DViewer = ({ modelPath, materialColor }: Ring3DViewerProps) => {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<ErrorDetails | null>(null);
  const [boundingBox, setBoundingBox] = useState<THREE.Box3 | null>(null);
  const [loaderProfile, setLoaderProfile] = useState<LoaderProfile>('full');
  const [retryCount, setRetryCount] = useState(0);
  const [canvasKey, setCanvasKey] = useState(0);

  // Reset state when modelPath changes
  useEffect(() => {
    setError(null);
    setLoaderProfile('full');
    setRetryCount(0);
    setIsLoading(true);
    setCanvasKey(prev => prev + 1);
  }, [modelPath]);

  const handleModelError = useCallback((err: Error) => {
    const errorDetails: ErrorDetails = {
      name: err?.name || 'UnknownError',
      message: err?.message || String(err) || 'Unknown error occurred',
      stack: err?.stack,
      modelPath,
      loaderProfile,
      timestamp: new Date().toISOString(),
    };

    console.error('Ring3DViewer error:', errorDetails);

    // Try next profile
    const currentIndex = LOADER_PROFILES.indexOf(loaderProfile);
    const nextIndex = currentIndex + 1;

    if (nextIndex < LOADER_PROFILES.length) {
      const nextProfile = LOADER_PROFILES[nextIndex];
      console.log(`Retrying with profile: ${nextProfile}`);
      toast.info(`Retrying with compatibility mode: ${nextProfile}`);
      
      // Clear cache and retry
      clearGLTFCache(modelPath);
      setLoaderProfile(nextProfile);
      setRetryCount(prev => prev + 1);
      setCanvasKey(prev => prev + 1);
    } else {
      // All profiles failed
      setError(errorDetails);
      setIsLoading(false);
    }
  }, [modelPath, loaderProfile]);

  const handleModelLoaded = useCallback((info: { boundingBox: THREE.Box3; maxDimension: number }) => {
    setBoundingBox(info.boundingBox);
    setIsLoading(false);
    if (retryCount > 0) {
      toast.success(`Model loaded with compatibility mode: ${loaderProfile}`);
    }
  }, [loaderProfile, retryCount]);

  const copyErrorDetails = useCallback(() => {
    if (error) {
      navigator.clipboard.writeText(JSON.stringify(error, null, 2));
      toast.success('Error details copied to clipboard');
    }
  }, [error]);

  const handleRetry = useCallback(() => {
    clearGLTFCache(modelPath);
    setError(null);
    setLoaderProfile('full');
    setRetryCount(0);
    setIsLoading(true);
    setCanvasKey(prev => prev + 1);
  }, [modelPath]);

  return (
    <div 
      className="relative w-full h-full min-h-[280px] md:min-h-[480px] lg:min-h-[560px]"
      style={{ touchAction: 'none', cursor: 'grab', background: config.background.color }}
    >
      {!error && (
        <Canvas
          key={canvasKey}
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
          onCreated={() => setIsLoading(false)}
        >
          <Suspense fallback={<LoadingFallback />}>
            {/* Environment map with WebGi-matched settings */}
            <Environment 
              preset={config.environment.preset}
              environmentIntensity={config.environment.intensity}
            />
            
            {/* Additional lighting for better jewelry rendering */}
            <ambientLight intensity={0.4} />
            <directionalLight position={[5, 5, 5]} intensity={0.8} castShadow />
            <directionalLight position={[-5, 3, -5]} intensity={0.4} />
            <spotLight position={[0, 10, 0]} intensity={0.3} angle={0.3} penumbra={1} />
            
            {/* Ground shadow for depth */}
            <GroundShadow opacity={0.3} blur={2} />
            
            {/* Camera auto-fit based on model size */}
            <CameraController boundingBox={boundingBox} />
            
            {/* Model with error boundary */}
            <ModelErrorBoundary 
              onError={handleModelError}
              fallback={<ErrorMesh />}
            >
              <SmartGLBModel 
                modelPath={modelPath} 
                materialColor={materialColor} 
                onLoaded={handleModelLoaded}
                preserveOriginalMaterials={true}
                envMapIntensity={2.5}
                loaderProfile={loaderProfile}
              />
            </ModelErrorBoundary>
            
            {/* Orbit controls with WebGi-accurate settings */}
            <OrbitControlsWithDamping 
              autoRotate={config.orbitControls.autoRotate}
              autoRotateSpeed={config.orbitControls.autoRotateSpeed}
              minDistance={config.orbitControls.minDistance}
              maxDistance={config.orbitControls.maxDistance}
              enablePan={config.orbitControls.enablePan}
              dampingFactor={config.orbitControls.dampingFactor}
              rotateSpeed={config.orbitControls.rotateSpeed}
              zoomSpeed={config.orbitControls.zoomSpeed}
            />
            
            {/* Post-processing effects for jewelry sparkle */}
            <PostProcessingEffects 
              enableBloom={true}
              enableVignette={false}
              bloomIntensity={0.12}
              bloomThreshold={1.2}
            />
          </Suspense>
        </Canvas>
      )}
      
      {isLoading && !error && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/80 pointer-events-none">
          <div className="text-foreground text-sm">
            {retryCount > 0 ? `Retrying (${loaderProfile})...` : 'Loading 3D model...'}
          </div>
        </div>
      )}
      
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/90 p-4">
          <div className="max-w-md text-center space-y-4">
            <div className="text-destructive text-lg font-semibold">Failed to load 3D model</div>
            <p className="text-muted-foreground text-sm">
              The model could not be loaded after trying all compatibility modes.
              This may be due to unsupported compression or a corrupt file.
            </p>
            
            <details className="text-left bg-muted/50 rounded-lg p-3 text-xs">
              <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                Technical Details
              </summary>
              <div className="mt-2 space-y-1 font-mono overflow-auto max-h-40">
                <div><strong>Error:</strong> {error.name}</div>
                <div><strong>Message:</strong> {error.message}</div>
                <div><strong>Profile:</strong> {error.loaderProfile}</div>
                <div><strong>Model:</strong> {error.modelPath}</div>
                {error.stack && (
                  <div className="whitespace-pre-wrap text-[10px] mt-2 opacity-70">
                    {error.stack.slice(0, 500)}
                  </div>
                )}
              </div>
            </details>

            <div className="flex gap-2 justify-center">
              <Button variant="outline" size="sm" onClick={copyErrorDetails}>
                <Copy className="w-4 h-4 mr-1" />
                Copy Details
              </Button>
              <Button size="sm" onClick={handleRetry}>
                <RefreshCw className="w-4 h-4 mr-1" />
                Retry
              </Button>
            </div>

            <p className="text-muted-foreground text-xs">
              Try re-exporting the model without Draco/Meshopt compression or KTX2 textures.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
