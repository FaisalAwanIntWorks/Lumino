import { useEffect, useRef } from 'react';
import { useLoader, useThree } from '@react-three/fiber';
import { GLTFLoader, DRACOLoader, KTX2Loader, MeshoptDecoder } from 'three-stdlib';
import * as THREE from 'three';
import { 
  JEWELRY_MATERIAL_PRESETS, 
  detectMaterialType, 
  applyJewelryPreset,
  type JewelryMaterialSettings 
} from './materialPresets';

export interface ModelInfo {
  boundingBox: THREE.Box3;
  maxDimension: number;
  center: THREE.Vector3;
}

/** 
 * Loader profile for compatibility fallback:
 * - 'full': Draco + KTX2 + Meshopt (default)
 * - 'no_meshopt': Draco + KTX2 only
 * - 'no_ktx2': Draco + Meshopt only
 * - 'draco_only': Draco only (with JS decoder for Safari)
 * - 'basic': Plain GLTFLoader, no extensions
 */
export type LoaderProfile = 'full' | 'no_meshopt' | 'no_ktx2' | 'draco_only' | 'basic';

export interface SmartGLBModelProps {
  modelPath: string;
  materialColor?: string;
  materialPreset?: 'metal' | 'diamond' | 'glossy' | 'gold' | 'roseGold' | 'platinum' | 'auto';
  customMaterialSettings?: Partial<JewelryMaterialSettings>;
  /** 
   * When true, preserves original Blender/Octane materials without applying jewelry presets.
   * Default: true for accurate asset visualization
   */
  preserveOriginalMaterials?: boolean;
  /** Boost environment map intensity for better reflections */
  envMapIntensity?: number;
  onLoaded?: (info: ModelInfo) => void;
  /** Loader profile for compatibility fallback */
  loaderProfile?: LoaderProfile;
}

// Singleton loaders for performance
let dracoLoader: DRACOLoader | null = null;
let ktx2Loader: KTX2Loader | null = null;

function getDracoLoader(useJSDecoder: boolean = false): DRACOLoader {
  if (!dracoLoader) {
    dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');
  }
  // Use JS decoder for Safari compatibility
  if (useJSDecoder) {
    dracoLoader.setDecoderConfig({ type: 'js' });
  }
  return dracoLoader;
}

function getKTX2Loader(gl: THREE.WebGLRenderer): KTX2Loader {
  if (!ktx2Loader) {
    ktx2Loader = new KTX2Loader();
    ktx2Loader.setTranscoderPath('https://cdn.jsdelivr.net/gh/pmndrs/drei-assets/basis/');
  }
  ktx2Loader.detectSupport(gl);
  return ktx2Loader;
}

// Utility to clear loader cache for retry
export function clearGLTFCache(modelPath: string) {
  try {
    useLoader.clear(GLTFLoader, modelPath);
  } catch (err) {
    console.warn('Failed to clear GLTF cache:', err);
  }
}

export function SmartGLBModel({ 
  modelPath, 
  materialColor, 
  materialPreset = 'auto',
  customMaterialSettings,
  preserveOriginalMaterials = true,
  envMapIntensity = 2.0,
  onLoaded,
  loaderProfile = 'full'
}: SmartGLBModelProps) {
  const { gl } = useThree();
  const groupRef = useRef<THREE.Group>(null);
  const materialsRef = useRef<THREE.MeshPhysicalMaterial[]>([]);
  const centeredSceneIdRef = useRef<string | null>(null);
  
  // Configure loader based on profile
  const gltf = useLoader(GLTFLoader, modelPath, (loader) => {
    if (loaderProfile === 'basic') {
      // No extensions - maximum compatibility
      console.log('SmartGLBModel: Using basic loader (no extensions)');
      return;
    }
    
    // Draco - use for all profiles except 'basic'
    try {
      const useJSDecoder = loaderProfile === 'draco_only'; // Use JS decoder for maximum Safari compatibility
      loader.setDRACOLoader(getDracoLoader(useJSDecoder));
    } catch (err) {
      console.warn('SmartGLBModel: Failed to set Draco loader', err);
    }
    
    // KTX2 - skip for 'no_ktx2' and 'draco_only'
    if (loaderProfile !== 'no_ktx2' && loaderProfile !== 'draco_only') {
      try {
        loader.setKTX2Loader(getKTX2Loader(gl));
      } catch (err) {
        console.warn('SmartGLBModel: Failed to set KTX2 loader', err);
      }
    }
    
    // Meshopt - only for 'full' profile
    if (loaderProfile === 'full') {
      try {
        loader.setMeshoptDecoder(MeshoptDecoder);
      } catch (err) {
        console.warn('SmartGLBModel: Failed to set Meshopt decoder', err);
      }
    }
    
    console.log(`SmartGLBModel: Using loader profile '${loaderProfile}'`);
  });
  
  // Initial setup effect - upgrade materials to MeshPhysicalMaterial with jewelry presets
  useEffect(() => {
    const collectedMaterials: THREE.MeshPhysicalMaterial[] = [];
    
    // Calculate bounding box for auto-camera positioning (guarded)
    let box: THREE.Box3;
    try {
      box = new THREE.Box3().setFromObject(gltf.scene);
    } catch (err) {
      console.warn('SmartGLBModel: Failed to compute bounding box, using defaults', err);
      const defaultBox = new THREE.Box3(new THREE.Vector3(-1, -1, -1), new THREE.Vector3(1, 1, 1));
      onLoaded?.({ boundingBox: defaultBox, maxDimension: 2, center: new THREE.Vector3(0, 0, 0) });
      return;
    }

    // Validate bounding box is not empty or invalid
    if (box.isEmpty() || !isFinite(box.min.x) || !isFinite(box.max.x)) {
      console.warn('SmartGLBModel: Model has empty or invalid bounding box, using defaults');
      const defaultBox = new THREE.Box3(new THREE.Vector3(-1, -1, -1), new THREE.Vector3(1, 1, 1));
      onLoaded?.({ boundingBox: defaultBox, maxDimension: 2, center: new THREE.Vector3(0, 0, 0) });
      return;
    }

    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());

    // Validate size values
    if (!isFinite(size.x) || !isFinite(size.y) || !isFinite(size.z)) {
      console.warn('SmartGLBModel: Invalid bounding box size, using defaults');
      const defaultBox = new THREE.Box3(new THREE.Vector3(-1, -1, -1), new THREE.Vector3(1, 1, 1));
      onLoaded?.({ boundingBox: defaultBox, maxDimension: 2, center: new THREE.Vector3(0, 0, 0) });
      return;
    }

    // Center model ONCE per loaded scene (avoids repeated offset on re-renders)
    const shouldCenter = centeredSceneIdRef.current !== gltf.scene.uuid;
    if (shouldCenter) {
      gltf.scene.position.sub(center);
      centeredSceneIdRef.current = gltf.scene.uuid;
      // Shift the box so it matches the centered scene
      box = new THREE.Box3(box.min.clone().sub(center), box.max.clone().sub(center));
    }

    const reportedCenter = shouldCenter ? new THREE.Vector3(0, 0, 0) : center;
    const maxDim = Math.max(size.x, size.y, size.z) || 2; // Default to 2 if zero

    // Process materials based on mode - SAFARI-SAFE: no .copy() calls
    try {
      gltf.scene.traverse((child) => {
        try {
          if (!(child instanceof THREE.Mesh) || !(child as THREE.Mesh).material) return;
          const mesh = child as THREE.Mesh;
          
          const materials = Array.isArray(mesh.material) 
            ? mesh.material 
            : [mesh.material];
          
          materials.forEach((mat, index) => {
            if (!mat) return;
            
            try {
              if (preserveOriginalMaterials) {
                // SAFARI-SAFE: Only tweak existing properties, NO .copy() calls
                if (mat instanceof THREE.MeshPhysicalMaterial) {
                  // Already a physical material - just enhance it
                  mat.envMapIntensity = Math.max(mat.envMapIntensity || 1, envMapIntensity);
                  if (mat.metalness !== undefined && mat.metalness > 0.5) {
                    mat.metalness = Math.min(mat.metalness * 1.1, 1);
                    mat.roughness = Math.max((mat.roughness || 0) * 0.9, 0);
                  }
                  mat.needsUpdate = true;
                  collectedMaterials.push(mat);
                } else if (mat instanceof THREE.MeshStandardMaterial) {
                  // Standard material - enhance in-place, DO NOT convert
                  // Converting via .copy() crashes Safari due to undefined vector fields
                  mat.envMapIntensity = Math.max(mat.envMapIntensity || 1, envMapIntensity);
                  if (mat.metalness !== undefined && mat.metalness > 0.5) {
                    mat.metalness = Math.min(mat.metalness * 1.1, 1);
                    mat.roughness = Math.max((mat.roughness || 0) * 0.9, 0);
                  }
                  mat.needsUpdate = true;
                  // Store as-is for color updates (we'll check type before accessing sheen)
                  collectedMaterials.push(mat as unknown as THREE.MeshPhysicalMaterial);
                }
              } else {
                // Apply jewelry presets (original behavior for consumer-facing views)
                const originalColor = (mat as THREE.MeshStandardMaterial).color?.clone() || new THREE.Color(0xd4af37);
                
                let presetKey: keyof typeof JEWELRY_MATERIAL_PRESETS;
                if (materialPreset === 'auto') {
                  presetKey = detectMaterialType(mat.name || child.name || '');
                } else {
                  presetKey = materialPreset;
                }
                
                const preset = JEWELRY_MATERIAL_PRESETS[presetKey];
                
                // Create new material with explicit properties (no .copy())
                const physicalMat = new THREE.MeshPhysicalMaterial({
                  color: originalColor,
                  metalness: preset.metalness,
                  roughness: preset.roughness,
                  envMapIntensity: preset.envMapIntensity,
                  ior: preset.ior || 1.5,
                  transmission: preset.transmission || 0,
                  thickness: preset.thickness || 0,
                  sheen: preset.sheen || 0,
                  sheenRoughness: preset.sheenRoughness || 0.25,
                  sheenColor: preset.sheenColor || new THREE.Color(0xffffff),
                  clearcoat: preset.clearcoat || 0,
                  clearcoatRoughness: preset.clearcoatRoughness || 0.1,
                });
                
                if (customMaterialSettings) {
                  applyJewelryPreset(physicalMat, { ...preset, ...customMaterialSettings });
                }
                
                if (Array.isArray(mesh.material)) {
                  (mesh.material as THREE.Material[])[index] = physicalMat;
                } else {
                  mesh.material = physicalMat;
                }
                
                collectedMaterials.push(physicalMat);
              }
            } catch (matError) {
              console.warn('[SmartGLBModel] Error processing material:', matError);
            }
          });
        } catch (childError) {
          console.warn('[SmartGLBModel] Error processing mesh child:', childError);
        }
      });
    } catch (traverseError) {
      console.warn('[SmartGLBModel] Error during scene traversal:', traverseError);
    }
    
    materialsRef.current = collectedMaterials;
    onLoaded?.({ boundingBox: box, maxDimension: maxDim, center: reportedCenter });
  }, [gltf, onLoaded, materialPreset, customMaterialSettings, preserveOriginalMaterials, envMapIntensity]);
  
  // Color change effect - SAFARI-SAFE: check property existence before access
  useEffect(() => {
    if (!materialColor) return;
    
    try {
      const color = new THREE.Color(materialColor);
      
      // Update all collected materials
      materialsRef.current.forEach((mat) => {
        try {
          // Check if color property exists before accessing
          if (mat && 'color' in mat && mat.color instanceof THREE.Color) {
            mat.color.set(color);
          }
          
          // Only access sheen properties on actual MeshPhysicalMaterial
          if (mat instanceof THREE.MeshPhysicalMaterial && typeof mat.sheen === 'number' && mat.sheen > 0) {
            // Blend sheen color with the metal color for realistic effect
            if (mat.sheenColor instanceof THREE.Color) {
              const sheenColor = color.clone().lerp(new THREE.Color(0xffffff), 0.5);
              mat.sheenColor.copy(sheenColor);
            }
          }
          
          mat.needsUpdate = true;
        } catch (matError) {
          console.warn('[SmartGLBModel] Error updating material color:', matError);
        }
      });
    } catch (colorError) {
      console.warn('[SmartGLBModel] Error in color update effect:', colorError);
    }
  }, [materialColor]);
  
  return <primitive ref={groupRef} object={gltf.scene} />;
}
