interface GridHelperProps {
  visible: boolean;
  size?: number;
  divisions?: number;
}

export function GridHelper({ visible, size = 10, divisions = 10 }: GridHelperProps) {
  if (!visible) return null;
  
  return (
    <gridHelper 
      args={[size, divisions, '#666666', '#333333']} 
      position={[0, -1, 0]}
    />
  );
}
