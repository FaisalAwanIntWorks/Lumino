import { ContactShadows } from '@react-three/drei';

interface GroundShadowProps {
  opacity?: number;
  blur?: number;
  far?: number;
  resolution?: number;
  color?: string;
  position?: [number, number, number];
}

export function GroundShadow({
  opacity = 0.4,
  blur = 2.5,
  far = 4,
  resolution = 512,
  color = '#000000',
  position = [0, -0.5, 0],
}: GroundShadowProps) {
  return (
    <ContactShadows
      position={position}
      opacity={opacity}
      scale={10}
      blur={blur}
      far={far}
      resolution={resolution}
      color={color}
    />
  );
}
