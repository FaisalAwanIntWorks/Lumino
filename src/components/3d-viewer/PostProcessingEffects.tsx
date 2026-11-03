import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing';
import { BlendFunction } from 'postprocessing';

interface PostProcessingEffectsProps {
  enableBloom?: boolean;
  enableVignette?: boolean;
  bloomIntensity?: number;
  bloomThreshold?: number;
  bloomRadius?: number;
  vignetteIntensity?: number;
}

export function PostProcessingEffects({
  enableBloom = true,
  enableVignette = true,
  bloomIntensity = 0.15,
  bloomThreshold = 1.5,
  bloomRadius = 0.4,
  vignetteIntensity = 0.3,
}: PostProcessingEffectsProps) {
  return (
    <EffectComposer multisampling={8}>
      {enableBloom && (
        <Bloom
          intensity={bloomIntensity}
          luminanceThreshold={bloomThreshold}
          luminanceSmoothing={0.9}
          radius={bloomRadius}
          blendFunction={BlendFunction.ADD}
        />
      )}
      {enableVignette && (
        <Vignette
          offset={0.3}
          darkness={vignetteIntensity}
          blendFunction={BlendFunction.NORMAL}
        />
      )}
    </EffectComposer>
  );
}
