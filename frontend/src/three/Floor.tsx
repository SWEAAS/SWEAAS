import { BUILDING_DEPTH, BUILDING_WIDTH } from "./Building";

interface FloorProps {
  position: [number, number, number];
  color: string;
}

export default function Floor({ position, color }: FloorProps) {
  return (
    <group position={position}>
      {/* Main floor surface — slightly glossy */}
      <mesh position={[0, 0.01, 0]} receiveShadow>
        <boxGeometry args={[BUILDING_WIDTH - 0.2, 0.03, BUILDING_DEPTH - 0.2]} />
        <meshStandardMaterial color={color} metalness={0.1} roughness={0.45} />
      </mesh>

      {/* Subtle carpet / rug area near desks */}
      <mesh position={[0, 0.025, -0.7]} receiveShadow>
        <boxGeometry args={[BUILDING_WIDTH - 2.2, 0.005, 3.6]} />
        <meshStandardMaterial color="#e0e7ff" transparent opacity={0.55} />
      </mesh>
    </group>
  );
}
