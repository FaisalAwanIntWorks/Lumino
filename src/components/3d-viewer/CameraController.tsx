import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';

interface CameraControllerProps {
  boundingBox: THREE.Box3 | null;
  resetTrigger?: number;
}

export function CameraController({ boundingBox, resetTrigger }: CameraControllerProps) {
  const { camera } = useThree();
  
  useEffect(() => {
    // Guard: skip if no bounding box or if it's empty/invalid
    if (!boundingBox || boundingBox.isEmpty()) {
      return;
    }
    
    const size = boundingBox.getSize(new THREE.Vector3());
    
    // Validate size values before using them
    if (!isFinite(size.x) || !isFinite(size.y) || !isFinite(size.z)) {
      console.warn('CameraController: Invalid bounding box size, skipping camera adjustment');
      return;
    }
    
    const maxDim = Math.max(size.x, size.y, size.z) || 2; // Default to 2 if zero
    
    // Calculate optimal distance based on model size and camera FOV
    const fov = (camera as THREE.PerspectiveCamera).fov || 45;
    const distance = maxDim / (2 * Math.tan((fov * Math.PI) / 360));
    
    // Position camera at a comfortable viewing distance
    const optimalDistance = Math.max(distance * 1.5, 2);
    
    // Update near plane dynamically based on model size to prevent clipping
    const perspectiveCamera = camera as THREE.PerspectiveCamera;
    perspectiveCamera.near = Math.max(0.01, optimalDistance * 0.01);
    perspectiveCamera.far = Math.max(1000, optimalDistance * 100);
    
    camera.position.set(0, 0, optimalDistance);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
  }, [boundingBox, camera, resetTrigger]);
  
  return null;
}
