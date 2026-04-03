import * as THREE from "three";
import { Text } from "@react-three/drei";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface DepartmentFloor {
  dept: string;
  agentCount: number;
  color: string;
  glassColor: string;
  label: string;
}

interface BuildingProps {
  departments: DepartmentFloor[];
  companyName?: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────

export const FLOOR_HEIGHT = 4;
export const BUILDING_WIDTH = 14;
export const BUILDING_DEPTH = 10;

// ─── Component ───────────────────────────────────────────────────────────────

export default function Building({
  departments,
  companyName = "SWEAAS HQ",
}: BuildingProps) {
  const floorCount = departments.length;
  const totalHeight = floorCount * FLOOR_HEIGHT;

  return (
    <group>
      {/* ── Main glass shell — sized to floor count ── */}
      <mesh position={[0, totalHeight / 2, 0]}>
        <boxGeometry args={[BUILDING_WIDTH, totalHeight, BUILDING_DEPTH]} />
        <meshStandardMaterial
          color="#f0f4ff"
          transparent
          opacity={0.12}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* ── Corner columns ── */}
      {([ [-6.8, -4.8], [-6.8, 4.8], [6.8, -4.8], [6.8, 4.8] ] as [number, number][]).map(
        ([cx, cz], i) => (
          <mesh key={i} position={[cx, totalHeight / 2, cz]} castShadow>
            <boxGeometry args={[0.35, totalHeight + 0.4, 0.35]} />
            <meshStandardMaterial color="#cbd5e1" />
          </mesh>
        )
      )}

      {/* ── Per-floor structure ── */}
      {departments.map(({ glassColor }, fi) => {
        const y = fi * FLOOR_HEIGHT;
        return (
          <group key={fi}>
            {/* Floor slab */}
            <mesh position={[0, y, 0]} receiveShadow>
              <boxGeometry args={[BUILDING_WIDTH, 0.2, BUILDING_DEPTH]} />
              <meshStandardMaterial color="#e2e8f0" />
            </mesh>

            {/* Front glass */}
            <mesh position={[0, y + 2, BUILDING_DEPTH / 2 + 0.05]}>
              <planeGeometry args={[BUILDING_WIDTH - 1, FLOOR_HEIGHT - 0.5]} />
              <meshStandardMaterial color={glassColor} transparent opacity={0.25} side={THREE.DoubleSide} />
            </mesh>
            {/* Back glass */}
            <mesh position={[0, y + 2, -(BUILDING_DEPTH / 2 + 0.05)]} rotation={[0, Math.PI, 0]}>
              <planeGeometry args={[BUILDING_WIDTH - 1, FLOOR_HEIGHT - 0.5]} />
              <meshStandardMaterial color={glassColor} transparent opacity={0.25} side={THREE.DoubleSide} />
            </mesh>
            {/* Left glass */}
            <mesh position={[-(BUILDING_WIDTH / 2 + 0.05), y + 2, 0]} rotation={[0, -Math.PI / 2, 0]}>
              <planeGeometry args={[BUILDING_DEPTH - 1, FLOOR_HEIGHT - 0.5]} />
              <meshStandardMaterial color={glassColor} transparent opacity={0.2} side={THREE.DoubleSide} />
            </mesh>
            {/* Right glass */}
            <mesh position={[BUILDING_WIDTH / 2 + 0.05, y + 2, 0]} rotation={[0, Math.PI / 2, 0]}>
              <planeGeometry args={[BUILDING_DEPTH - 1, FLOOR_HEIGHT - 0.5]} />
              <meshStandardMaterial color={glassColor} transparent opacity={0.2} side={THREE.DoubleSide} />
            </mesh>
          </group>
        );
      })}

      {/* ── Roof cap ── */}
      <mesh position={[0, totalHeight, 0]} receiveShadow>
        <boxGeometry args={[BUILDING_WIDTH + 1, 0.3, BUILDING_DEPTH + 1]} />
        <meshStandardMaterial color="#cbd5e1" />
      </mesh>

      {/* ── Rooftop company sign ── */}
      <group position={[0, totalHeight + 0.85, BUILDING_DEPTH / 2 + 0.3]}>
        <mesh>
          <boxGeometry args={[7, 1.3, 0.16]} />
          <meshStandardMaterial color="#1d4ed8" />
        </mesh>
        <Text
          position={[0, 0.04, 0.09]}
          fontSize={0.56}
          color="white"
          anchorX="center"
          anchorY="middle"
          outlineWidth={0.012}
          outlineColor="#1d4ed8"
        >
          {companyName}
        </Text>
      </group>

      {/* ── Roof antenna ── */}
      <mesh position={[0, totalHeight + 2.2, 0]}>
        <cylinderGeometry args={[0.05, 0.05, 4]} />
        <meshStandardMaterial color="#94a3b8" />
      </mesh>
      <mesh position={[0, totalHeight + 4.2, 0]}>
        <sphereGeometry args={[0.18]} />
        <meshStandardMaterial color="#2563eb" emissive="#2563eb" emissiveIntensity={0.5} />
      </mesh>

      {/* ── Helipad / signal disc on roof ── */}
      <mesh position={[3, totalHeight + 0.16, -2]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[1.5, 24]} />
        <meshStandardMaterial color="#94a3b8" />
      </mesh>
      <mesh position={[3, totalHeight + 0.17, -2]} rotation={[-Math.PI / 2, 0, 0]}>
        <torusGeometry args={[1.2, 0.06, 4, 24]} />
        <meshStandardMaterial color="#e2e8f0" />
      </mesh>
    </group>
  );
}
