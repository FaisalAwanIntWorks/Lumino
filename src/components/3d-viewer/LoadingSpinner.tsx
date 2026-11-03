import { Html } from '@react-three/drei';
import { Loader2 } from 'lucide-react';

export function LoadingSpinner() {
  return (
    <Html center>
      <div className="flex flex-col items-center gap-2">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="text-sm text-muted-foreground">Loading model...</span>
      </div>
    </Html>
  );
}

export function LoadingFallbackMesh() {
  return (
    <mesh>
      <torusGeometry args={[1, 0.3, 16, 100]} />
      {/* @ts-ignore - R3F JSX intrinsic typing mismatch */}
      <meshStandardMaterial color="#888888" metalness={0.3} roughness={0.7} transparent opacity={0.3} />
    </mesh>
  );
}
