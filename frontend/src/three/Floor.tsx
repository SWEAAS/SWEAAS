interface FloorProps {
  position: [number, number, number];
  color: string;
}

export default function Floor({ position, color }: FloorProps) {
  return (
    <group position={position}>
      {/* Main floor surface — slightly glossy */}
      <mesh position={[0, 0.01, 0]} receiveShadow>
        <boxGeometry args={[11.8, 0.03, 7.8]} />
        <meshStandardMaterial color={color} metalness={0.1} roughness={0.45} />
      </mesh>

      {/* Subtle carpet / rug area near desks */}
      <mesh position={[0, 0.025, -1.5]} receiveShadow>
        <boxGeometry args={[9.0, 0.005, 2.2]} />
        <meshStandardMaterial color="#e0e7ff" transparent opacity={0.55} />
      </mesh>
    </group>
  );
}
