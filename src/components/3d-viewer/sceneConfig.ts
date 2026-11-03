/**
 * Scene Configuration for GLB Jewelry Rendering
 * Extracted from WebGi/iJewel3D scene-config.vjson (v0.19.0)
 * 
 * These settings provide professional jewelry visualization matching
 * industry-standard rendering quality.
 */

import * as THREE from 'three';

export interface CameraConfig {
  fov: number;
  position: [number, number, number];
  target: [number, number, number];
  near: number;
  far: number;
}

export interface OrbitControlsConfig {
  enableDamping: boolean;
  dampingFactor: number;
  rotateSpeed: number;
  zoomSpeed: number;
  panSpeed: number;
  minDistance: number;
  maxDistance: number;
  autoRotate: boolean;
  autoRotateSpeed: number;
  minPolarAngle: number;
  maxPolarAngle: number;
  enablePan: boolean;
}

export interface ToneMappingConfig {
  type: THREE.ToneMapping;
  exposure: number;
}

export interface EnvironmentConfig {
  intensity: number;
  preset: 'studio' | 'city' | 'sunset' | 'dawn' | 'night' | 'warehouse' | 'apartment' | 'forest' | 'park';
  backgroundIntensity: number;
}

export interface BackgroundConfig {
  color: string;
  transparent: boolean;
}

export interface BloomConfig {
  enabled: boolean;
  threshold: number;
  intensity: number;
  radius: number;
}

export interface SSAOConfig {
  enabled: boolean;
  intensity: number;
  radius: number;
}

export interface PostProcessingConfig {
  bloom: BloomConfig;
  ssao: SSAOConfig;
}

export interface JewelrySceneConfig {
  camera: CameraConfig;
  orbitControls: OrbitControlsConfig;
  toneMapping: ToneMappingConfig;
  environment: EnvironmentConfig;
  background: BackgroundConfig;
  postProcessing: PostProcessingConfig;
}

/**
 * Default jewelry scene configuration extracted from WebGi scene-config.vjson
 * Optimized for professional jewelry rendering with:
 * - Narrow 25° FOV for close-up presentation
 * - Slow zoom speed for precision control
 * - ACES Filmic tone mapping
 * - White background matching jewelry photography standards
 */
export const JEWELRY_SCENE_CONFIG: JewelrySceneConfig = {
  camera: {
    fov: 25,                              // Narrow FOV for jewelry close-ups
    position: [-1.49, -5.96, 6.60],       // Off-center viewing angle
    target: [0, 0, 0],                    // Centered on origin
    near: 0.01,                           // Allow very close zoom
    far: 1000,
  },
  orbitControls: {
    enableDamping: true,
    dampingFactor: 0.08,                  // Smooth movement (WebGi default)
    rotateSpeed: 2.0,
    zoomSpeed: 0.15,                      // Very slow zoom for precision
    panSpeed: 1.0,
    minDistance: 0.35,
    maxDistance: 1000,
    autoRotate: false,
    autoRotateSpeed: 2.0,
    minPolarAngle: 0,
    maxPolarAngle: Math.PI,
    enablePan: true,
  },
  toneMapping: {
    type: THREE.ACESFilmicToneMapping,    // toneMapping: 4 in WebGi
    exposure: 1.0,
  },
  environment: {
    intensity: 1.0,
    preset: 'studio',
    backgroundIntensity: 1.0,
  },
  background: {
    color: '#ffffff',                     // White background (jewelry standard)
    transparent: false,
  },
  postProcessing: {
    bloom: {
      enabled: true,
      threshold: 2.0,                     // High threshold (subtle highlights)
      intensity: 0.2,                     // Very subtle
      radius: 0.6,
    },
    ssao: {
      enabled: true,
      intensity: 0.25,                    // Ambient occlusion for depth
      radius: 1.0,
    },
  },
};

/**
 * Dark theme scene configuration
 * Same as jewelry config but with dark background
 */
export const DARK_SCENE_CONFIG: JewelrySceneConfig = {
  ...JEWELRY_SCENE_CONFIG,
  background: {
    color: '#000000',
    transparent: false,
  },
};

/**
 * Transparent background scene configuration
 * For embedding in websites with custom backgrounds
 */
export const TRANSPARENT_SCENE_CONFIG: JewelrySceneConfig = {
  ...JEWELRY_SCENE_CONFIG,
  background: {
    color: '#000000',
    transparent: true,
  },
};

/**
 * Get a merged scene config with custom overrides
 */
export function getSceneConfig(
  overrides?: Partial<JewelrySceneConfig>
): JewelrySceneConfig {
  if (!overrides) return JEWELRY_SCENE_CONFIG;
  
  return {
    camera: { ...JEWELRY_SCENE_CONFIG.camera, ...overrides.camera },
    orbitControls: { ...JEWELRY_SCENE_CONFIG.orbitControls, ...overrides.orbitControls },
    toneMapping: { ...JEWELRY_SCENE_CONFIG.toneMapping, ...overrides.toneMapping },
    environment: { ...JEWELRY_SCENE_CONFIG.environment, ...overrides.environment },
    background: { ...JEWELRY_SCENE_CONFIG.background, ...overrides.background },
    postProcessing: {
      bloom: { ...JEWELRY_SCENE_CONFIG.postProcessing.bloom, ...overrides.postProcessing?.bloom },
      ssao: { ...JEWELRY_SCENE_CONFIG.postProcessing.ssao, ...overrides.postProcessing?.ssao },
    },
  };
}

/**
 * Environment preset HDR mappings
 * Maps preset names to @react-three/drei Environment presets
 */
export const ENVIRONMENT_PRESETS = {
  studio: 'studio',
  city: 'city',
  sunset: 'sunset',
  dawn: 'dawn',
  night: 'night',
  warehouse: 'warehouse',
  apartment: 'apartment',
  forest: 'forest',
  park: 'park',
  lobby: 'lobby',
} as const;

export type EnvironmentPreset = keyof typeof ENVIRONMENT_PRESETS;
