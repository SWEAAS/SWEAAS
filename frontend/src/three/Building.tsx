import * as THREE from "three";
import { Text } from "@react-three/drei";

interface BuildingProps {
  /** Desk rows per floor (1 = 4 desks, 2 = 8, 3 = 12). Defaults to 1. */
  engDeskRows?: number;
  mktDeskRows?: number;
  prodDeskRows?: number;
  /** Company name shown as 3-D rooftop sign. */
  companyName?: string;
}

const FLOOR_COLORS = [
  { glass: "#93c5fd", floor: "#dbeafe" }, // Engineering – blue
  { glass: "#fcd34d", floor: "#fef3c7" }, // Marketing – amber
  { glass: "#6ee7b7", floor: "#d1fae5" }, // Product – emerald
];

/** Desk positions within a row (x offset from building centre). */
const DESK_X = [-3.5, -1.5, 0.5, 2.5] as const;
/** Z positions for desk rows (back to front). */
const DESK_ROW_Z = [-0.8, -2.6, -3.5] as const;

/** One ergonomic workstation. */
function Workstation({
  position,
  screenColor,
}: {
  position: [number, number, number];
  screenColor: string;
}) {
  return (
    <group position={position}>
      {/* Main desk surface */}
      <mesh position={[0, 0.48, 0]} castShadow>
        <boxGeometry args={[1.25, 0.05, 0.75]} />
        <meshStandardMaterial color="#c8b89a" roughness={0.6} metalness={0.05} />
      </mesh>
      {/* Side return (L-shape) */}
      <mesh position={[-0.55, 0.48, -0.45]} castShadow>
        <boxGeometry args={[0.4, 0.05, 0.5]} />
        <meshStandardMaterial color="#c8b89a" roughness={0.6} metalness={0.05} />
      </mesh>
      {/* Desk legs */}
      {([ [-0.55, -0.35], [0.55, -0.35], [-0.55, 0.35], [0.55, 0.35] ] as [number, number][]).map(
        ([lx, lz], i) => (
          <mesh key={i} position={[lx, 0.24, lz]}>
            <cylinderGeometry args={[0.025, 0.025, 0.46, 6]} />
            <meshStandardMaterial color="#9ca3af" metalness={0.7} roughness={0.3} />
          </mesh>
        )
      )}
      {/* Monitor bezel */}
      <mesh position={[0.1, 0.88, -0.2]}>
        <boxGeometry args={[0.54, 0.38, 0.03]} />
        <meshStandardMaterial color="#1e293b" />
      </mesh>
      {/* Monitor screen */}
      <mesh position={[0.1, 0.88, -0.185]}>
        <boxGeometry args={[0.48, 0.32, 0.01]} />
        <meshStandardMaterial
          color={screenColor}
          emissive={screenColor}
          emissiveIntensity={0.18}
        />
      </mesh>
      {/* Monitor stand */}
      <mesh position={[0.1, 0.67, -0.2]}>
        <cylinderGeometry args={[0.015, 0.015, 0.2, 6]} />
        <meshStandardMaterial color="#4b5563" />
      </mesh>
      {/* Monitor base */}
      <mesh position={[0.1, 0.57, -0.2]}>
        <boxGeometry args={[0.22, 0.02, 0.14]} />
        <meshStandardMaterial color="#374151" />
      </mesh>
      {/* Keyboard */}
      <mesh position={[0.05, 0.505, 0.05]}>
        <boxGeometry args={[0.36, 0.012, 0.14]} />
        <meshStandardMaterial color="#d1d5db" />
      </mesh>
      {/* Ergonomic chair – seat */}
      <mesh position={[0, 0.38, 0.52]}>
        <boxGeometry args={[0.44, 0.07, 0.42]} />
        <meshStandardMaterial color="#1e293b" />
      </mesh>
      {/* Chair back */}
      <mesh position={[0, 0.63, 0.22]}>
        <boxGeometry args={[0.42, 0.5, 0.06]} />
        <meshStandardMaterial color="#1e293b" />
      </mesh>
      {/* Chair arm rests */}
      {[-0.24, 0.24].map((cx, i) => (
        <mesh key={i} position={[cx, 0.54, 0.38]}>
          <boxGeometry args={[0.05, 0.04, 0.32]} />
          <meshStandardMaterial color="#374151" />
        </mesh>
      ))}
      {/* Chair pedestal */}
      <mesh position={[0, 0.18, 0.52]}>
        <cylinderGeometry args={[0.06, 0.06, 0.2, 6]} />
        <meshStandardMaterial color="#4b5563" />
      </mesh>
      {/* Chair star base */}
      <mesh position={[0, 0.06, 0.52]} rotation={[0, Math.PI / 6, 0]}>
        <cylinderGeometry args={[0.22, 0.22, 0.03, 5]} />
        <meshStandardMaterial color="#374151" />
      </mesh>
    </group>
  );
}

export default function Building({
  engDeskRows = 1,
  mktDeskRows = 1,
  prodDeskRows = 1,
  companyName = "SWEAAS HQ",
}: BuildingProps) {
  const deskRowsByFloor = [engDeskRows, mktDeskRows, prodDeskRows];

  return (
    <group position={[0, 0, 0]}>
      {/* ── Main glass shell ── */}
      <mesh position={[0, 6, 0]}>
        <boxGeometry args={[12, 12, 8]} />
        <meshStandardMaterial
          color="#f0f4ff"
          transparent
          opacity={0.15}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* ── Corner columns ── */}
      {([ [-5.8, -3.8], [-5.8, 3.8], [5.8, -3.8], [5.8, 3.8] ] as [number, number][]).map(
        ([cx, cz], i) => (
          <mesh key={i} position={[cx, 6, cz]} castShadow>
            <boxGeometry args={[0.3, 12.2, 0.3]} />
            <meshStandardMaterial color="#cbd5e1" />
          </mesh>
        )
      )}

      {/* ── Per-floor structure ── */}
      {FLOOR_COLORS.map(({ glass }, fi) => {
        const y = fi * 4;
        const rows = deskRowsByFloor[fi];
        const screenColor = fi === 0 ? "#93c5fd" : fi === 1 ? "#fbbf24" : "#6ee7b7";

        return (
          <group key={fi}>
            {/* Floor slab */}
            <mesh position={[0, y, 0]} receiveShadow>
              <boxGeometry args={[12, 0.2, 8]} />
              <meshStandardMaterial color="#e2e8f0" />
            </mesh>

            {/* Front glass panels */}
            <mesh position={[0, y + 2, 4.05]}>
              <planeGeometry args={[11.5, 3.5]} />
              <meshStandardMaterial
                color={glass}
                transparent
                opacity={0.3}
                side={THREE.DoubleSide}
              />
            </mesh>
            {/* Back glass panels */}
            <mesh position={[0, y + 2, -4.05]} rotation={[0, Math.PI, 0]}>
              <planeGeometry args={[11.5, 3.5]} />
              <meshStandardMaterial
                color={glass}
                transparent
                opacity={0.3}
                side={THREE.DoubleSide}
              />
            </mesh>
            {/* Side glass – left */}
            <mesh position={[-6.01, y + 2, 0]} rotation={[0, -Math.PI / 2, 0]}>
              <planeGeometry args={[7.5, 3.5]} />
              <meshStandardMaterial
                color={glass}
                transparent
                opacity={0.25}
                side={THREE.DoubleSide}
              />
            </mesh>
            {/* Side glass – right (leave open for staircase view) */}
            <mesh position={[6.01, y + 2, 0]} rotation={[0, Math.PI / 2, 0]}>
              <planeGeometry args={[7.5, 3.5]} />
              <meshStandardMaterial
                color={glass}
                transparent
                opacity={0.25}
                side={THREE.DoubleSide}
              />
            </mesh>

            {/* Desk rows */}
            {Array.from({ length: rows }, (_, ri) =>
              DESK_X.map((dx, di) => (
                <Workstation
                  key={`${fi}-${ri}-${di}`}
                  position={[dx, y + 0.05, DESK_ROW_Z[ri]]}
                  screenColor={screenColor}
                />
              ))
            )}
          </group>
        );
      })}

      {/* ── Roof cap ── */}
      <mesh position={[0, 12, 0]} receiveShadow>
        <boxGeometry args={[13, 0.3, 9]} />
        <meshStandardMaterial color="#cbd5e1" />
      </mesh>

      {/* ── Rooftop company sign ── */}
      <group position={[0, 12.8, 4.3]}>
        {/* Sign backing panel */}
        <mesh>
          <boxGeometry args={[6.0, 1.15, 0.14]} />
          <meshStandardMaterial color="#1d4ed8" />
        </mesh>
        {/* Company name text */}
        <Text
          position={[0, 0.04, 0.085]}
          fontSize={0.52}
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
      <mesh position={[0, 13.5, 0]}>
        <cylinderGeometry args={[0.05, 0.05, 3]} />
        <meshStandardMaterial color="#94a3b8" />
      </mesh>
      <mesh position={[0, 15, 0]}>
        <sphereGeometry args={[0.15]} />
        <meshStandardMaterial
          color="#2563eb"
          emissive="#2563eb"
          emissiveIntensity={0.5}
        />
      </mesh>
    </group>
  );
}
