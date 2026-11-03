import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { JEWELRY_SCENE_CONFIG } from './sceneConfig';

interface OrbitControlsWithDampingProps {
  autoRotate?: boolean;
  autoRotateSpeed?: number;
  minDistance?: number;
  maxDistance?: number;
  enablePan?: boolean;
  dampingFactor?: number;
  rotateSpeed?: number;
  zoomSpeed?: number;
  panSpeed?: number;
  minPolarAngle?: number;
  maxPolarAngle?: number;
}

const defaultConfig = JEWELRY_SCENE_CONFIG.orbitControls;

export function OrbitControlsWithDamping({
  autoRotate = defaultConfig.autoRotate,
  autoRotateSpeed = defaultConfig.autoRotateSpeed,
  minDistance = defaultConfig.minDistance,
  maxDistance = defaultConfig.maxDistance,
  enablePan = defaultConfig.enablePan,
  dampingFactor = defaultConfig.dampingFactor,
  rotateSpeed = defaultConfig.rotateSpeed,
  zoomSpeed = defaultConfig.zoomSpeed,
  panSpeed = defaultConfig.panSpeed,
  minPolarAngle = defaultConfig.minPolarAngle,
  maxPolarAngle = defaultConfig.maxPolarAngle,
}: OrbitControlsWithDampingProps) {
  const controlsRef = useRef<OrbitControlsImpl>(null);
  
  // Update controls every frame for smooth damping
  useFrame(() => {
    controlsRef.current?.update();
  });
  
  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault
      enableDamping={true}
      dampingFactor={dampingFactor}
      enableZoom={true}
      enablePan={enablePan}
      minDistance={minDistance}
      maxDistance={maxDistance}
      minPolarAngle={minPolarAngle}
      maxPolarAngle={maxPolarAngle}
      autoRotate={autoRotate}
      autoRotateSpeed={autoRotateSpeed}
      rotateSpeed={rotateSpeed}
      zoomSpeed={zoomSpeed}
      panSpeed={panSpeed}
      target={[0, 0, 0]}
    />
  );
}
