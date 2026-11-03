import * as THREE from 'three';

/**
 * Jewelry Material Presets based on Blender/Octane Render settings
 * These values are calibrated to match professional jewelry rendering
 */

export interface JewelryMaterialSettings {
  metalness: number;
  roughness: number;
  envMapIntensity: number;
  ior?: number;
  transmission?: number;
  thickness?: number;
  sheen?: number;
  sheenRoughness?: number;
  sheenColor?: THREE.Color;
  clearcoat?: number;
  clearcoatRoughness?: number;
}

export const JEWELRY_MATERIAL_PRESETS = {
  // Metallic material - for ring bands, gold, silver, platinum
  // Based on Octane Metallic: Roughness 0.03, Sheen Roughness 0.20
  metal: {
    metalness: 1.0,
    roughness: 0.03,           // Ultra-low for mirror-like reflections
    envMapIntensity: 2.5,      // Boost environment reflections
    sheen: 1.0,                // Full sheen layer
    sheenRoughness: 0.20,      // From Octane settings
    sheenColor: new THREE.Color(0xffffff),
    clearcoat: 0.1,
    clearcoatRoughness: 0.03,
  } as JewelryMaterialSettings,

  // Diamond/Gem material - for diamonds and precious stones
  // Based on Octane Specular: IOR 2.42 (diamond), Roughness 0.0
  diamond: {
    metalness: 0.0,
    roughness: 0.0,            // Perfectly smooth for brilliance
    envMapIntensity: 3.0,      // Maximum reflections
    transmission: 1.0,         // Full transparency
    ior: 2.42,                 // Diamond refractive index
    thickness: 0.5,            // Gem thickness for refraction
  } as JewelryMaterialSettings,

  // Glossy material - for polished non-metallic surfaces
  // Based on Octane Glossy: IOR 1.55, Roughness 0.05, Specular 0.94
  glossy: {
    metalness: 0.0,
    roughness: 0.05,           // Very smooth
    envMapIntensity: 2.0,
    ior: 1.55,                 // Glass-like IOR
    clearcoat: 0.94,           // High specular/clearcoat
    clearcoatRoughness: 0.05,
  } as JewelryMaterialSettings,

  // Gold specific preset
  gold: {
    metalness: 1.0,
    roughness: 0.03,
    envMapIntensity: 2.5,
    sheen: 1.0,
    sheenRoughness: 0.15,
    sheenColor: new THREE.Color(0xffd700),
    clearcoat: 0.1,
    clearcoatRoughness: 0.03,
  } as JewelryMaterialSettings,

  // Rose Gold preset
  roseGold: {
    metalness: 1.0,
    roughness: 0.03,
    envMapIntensity: 2.5,
    sheen: 1.0,
    sheenRoughness: 0.18,
    sheenColor: new THREE.Color(0xffb4a2),
    clearcoat: 0.1,
    clearcoatRoughness: 0.03,
  } as JewelryMaterialSettings,

  // Platinum/White Gold preset
  platinum: {
    metalness: 1.0,
    roughness: 0.02,           // Even smoother for platinum
    envMapIntensity: 2.8,
    sheen: 1.0,
    sheenRoughness: 0.12,
    sheenColor: new THREE.Color(0xe5e4e2),
    clearcoat: 0.15,
    clearcoatRoughness: 0.02,
  } as JewelryMaterialSettings,
};

/**
 * Detect material type from material name in GLB
 */
export function detectMaterialType(materialName: string): keyof typeof JEWELRY_MATERIAL_PRESETS {
  const name = materialName.toLowerCase();
  
  if (name.includes('diamond') || name.includes('gem') || name.includes('stone') || name.includes('crystal')) {
    return 'diamond';
  }
  if (name.includes('gold') && name.includes('rose')) {
    return 'roseGold';
  }
  if (name.includes('gold') || name.includes('yellow')) {
    return 'gold';
  }
  if (name.includes('platinum') || name.includes('white') || name.includes('silver')) {
    return 'platinum';
  }
  if (name.includes('glossy') || name.includes('glass') || name.includes('polish')) {
    return 'glossy';
  }
  
  // Default to metal for jewelry
  return 'metal';
}

/**
 * Apply jewelry material preset to a MeshPhysicalMaterial
 */
export function applyJewelryPreset(
  material: THREE.MeshPhysicalMaterial,
  preset: JewelryMaterialSettings,
  color?: THREE.Color
): void {
  material.metalness = preset.metalness;
  material.roughness = preset.roughness;
  material.envMapIntensity = preset.envMapIntensity;
  
  if (preset.ior !== undefined) material.ior = preset.ior;
  if (preset.transmission !== undefined) material.transmission = preset.transmission;
  if (preset.thickness !== undefined) material.thickness = preset.thickness;
  if (preset.sheen !== undefined) material.sheen = preset.sheen;
  if (preset.sheenRoughness !== undefined) material.sheenRoughness = preset.sheenRoughness;
  if (preset.sheenColor !== undefined) material.sheenColor = preset.sheenColor;
  if (preset.clearcoat !== undefined) material.clearcoat = preset.clearcoat;
  if (preset.clearcoatRoughness !== undefined) material.clearcoatRoughness = preset.clearcoatRoughness;
  
  if (color) {
    material.color.copy(color);
  }
  
  material.needsUpdate = true;
}

/**
 * Metal color hex values for common jewelry metals
 */
export const METAL_COLORS = {
  yellow: '#D4AF37',      // Yellow Gold
  rose: '#B76E79',        // Rose Gold
  white: '#E8E8E8',       // White Gold/Platinum
  silver: '#C0C0C0',      // Silver
  platinum: '#E5E4E2',    // Platinum
};
