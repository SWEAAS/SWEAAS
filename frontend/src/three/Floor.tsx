interface FloorProps {
  position: [number, number, number];
  color: string;
}

export default function Floor({ position, color }: FloorProps) {
  return (
    <group position={position}>
      {/* Main floor area */}
      <mesh position={[0, 0.01, 0]} receiveShadow>
        <boxGeometry args={[11.8, 0.02, 7.8]} />
        <meshStandardMaterial color={color} />
      </mesh>

      {/* Carpet area */}
      <mesh position={[0, 0.02, 2]} receiveShadow>
        <boxGeometry args={[6, 0.01, 2]} />
        <meshStandardMaterial color="#e0e7ff" opacity={0.5} transparent />
      </mesh>
    </group>
  );
}
